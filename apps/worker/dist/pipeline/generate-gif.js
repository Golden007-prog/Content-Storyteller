"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenerateGif = void 0;
exports.classificationToPreset = classificationToPreset;
exports.validateStoryboardBeats = validateStoryboardBeats;
const shared_1 = require("@content-storyteller/shared");
const firestore_1 = require("../services/firestore");
const genai_1 = require("../services/genai");
const storage_1 = require("../services/storage");
const storage_2 = require("../services/storage");
const logger_1 = require("../middleware/logger");
const crypto_1 = require("crypto");
const capability_registry_1 = require("../capabilities/capability-registry");
/**
 * Map an ImageClassification to the appropriate GifStylePreset.
 * Exported for independent testing.
 */
function classificationToPreset(classification) {
    switch (classification) {
        case 'diagram':
        case 'workflow':
            return 'workflow_step_highlight';
        case 'ui_screenshot':
            return 'feature_spotlight';
        case 'chart':
        case 'infographic':
            return 'text_callout_animation';
        case 'other':
        default:
            return 'zoom_pan_explainer';
    }
}
/**
 * Validate and clamp a storyboard's beat count to the 3–6 range.
 * - If fewer than 3 beats, pads with default beats.
 * - If more than 6 beats, truncates to 6.
 * Exported for independent testing.
 */
function validateStoryboardBeats(beats) {
    const MIN_BEATS = 3;
    const MAX_BEATS = 6;
    let clamped = beats.slice(0, MAX_BEATS);
    while (clamped.length < MIN_BEATS) {
        const nextBeat = {
            beatNumber: clamped.length + 1,
            description: 'Hold and loop transition',
            durationMs: 800,
            motionType: 'fade',
            focusArea: 'center',
        };
        clamped.push(nextBeat);
    }
    // Re-number beats sequentially
    clamped = clamped.map((b, i) => ({ ...b, beatNumber: i + 1 }));
    return clamped;
}
/**
 * Infer the MIME type of an uploaded image from its file extension.
 */
function inferMimeType(path) {
    const lower = path.toLowerCase();
    if (lower.endsWith('.png'))
        return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg'))
        return 'image/jpeg';
    if (lower.endsWith('.webp'))
        return 'image/webp';
    if (lower.endsWith('.gif'))
        return 'image/gif';
    return 'image/png'; // default
}
/**
 * Build the image classification prompt for the multimodal model.
 */
function buildClassificationPrompt() {
    return `Analyze this image and classify it into exactly one of these categories:
- "diagram" — technical diagram, architecture diagram, system diagram
- "workflow" — process flow, workflow chart, step-by-step flow
- "ui_screenshot" — user interface screenshot, app screenshot, web page
- "chart" — data chart, bar chart, pie chart, line graph
- "infographic" — infographic, data visualization with text
- "other" — anything that doesn't fit the above categories

Also identify 1-3 focus regions (key areas of visual interest).

Return ONLY valid JSON with these fields:
- "classification": one of the category strings above
- "focusRegions": array of 1-3 short strings describing key visual areas

No markdown fences.`;
}
/**
 * Build the motion concept generation prompt.
 */
function buildMotionConceptPrompt(classification, preset, focusRegions, brief) {
    return `You are an animation director. Create a short motion concept for a looping LinkedIn GIF.

Image type: ${classification}
Animation style preset: ${preset.replace(/_/g, ' ')}
Focus regions: ${focusRegions.join(', ') || 'center of image'}
${brief ? `Context: ${brief.inputSummary}` : ''}

Describe a 3-8 second looping animation concept. Include:
- What elements move and how
- The pacing and energy
- How it loops seamlessly

Return ONLY valid JSON:
- "motionDescription": string describing the animation
- "suggestedDurationMs": number between 3000 and 8000

No markdown fences.`;
}
/**
 * Build the storyboard generation prompt.
 */
function buildStoryboardPrompt(motionConcept) {
    return `You are a storyboard artist. Create a beat-by-beat storyboard for a short looping GIF animation.

Animation style: ${motionConcept.stylePreset.replace(/_/g, ' ')}
Image type: ${motionConcept.imageClassification}
Motion concept: ${motionConcept.motionDescription}
Target duration: ${motionConcept.suggestedDurationMs}ms
Focus regions: ${motionConcept.focusRegions.join(', ')}

Create 3-6 beats. Each beat should describe a distinct animation moment.

Return ONLY valid JSON:
{
  "beats": [
    {
      "beatNumber": number,
      "description": string,
      "durationMs": number,
      "motionType": string (e.g. "zoom", "pan", "fade", "highlight", "pulse"),
      "focusArea": string
    }
  ],
  "totalDurationMs": number,
  "loopStrategy": "seamless" | "bounce" | "restart"
}

No markdown fences.`;
}
/**
 * GenerateGif stage: analyze an uploaded image, classify it, generate a motion
 * concept and storyboard, then render a GIF via the gif_generation capability.
 *
 * Non-critical stage — failures produce warnings, not job failures.
 */
class GenerateGif {
    name = 'GenerateGif';
    jobState = shared_1.JobState.GeneratingGif;
    async execute(context) {
        const log = (0, logger_1.createLogger)(context.correlationId, context.jobId);
        log.info('GenerateGif stage started');
        try {
            await (0, firestore_1.updateJobState)(context.jobId, this.jobState);
            const brief = context.workingData.creativeBrief;
            const assets = [];
            // ── Step 1: Classify the uploaded image ──────────────────────────
            let classification = 'other';
            let focusRegions = [];
            const imagePath = context.uploadedMediaPaths[0];
            if (imagePath) {
                try {
                    const imageBuffer = await (0, storage_2.readUpload)(imagePath);
                    const mimeType = inferMimeType(imagePath);
                    const classificationPrompt = buildClassificationPrompt();
                    const classificationResponse = await (0, genai_1.generateContentMultimodal)([
                        { inlineData: { data: imageBuffer.toString('base64'), mimeType } },
                        { text: classificationPrompt },
                    ], (0, shared_1.getModel)('image'));
                    const cleaned = classificationResponse
                        .replace(/^```(?:json)?\s*/i, '')
                        .replace(/\s*```$/i, '')
                        .trim();
                    const parsed = JSON.parse(cleaned);
                    const validClassifications = [
                        'diagram', 'workflow', 'ui_screenshot', 'chart', 'infographic', 'other',
                    ];
                    if (validClassifications.includes(parsed.classification)) {
                        classification = parsed.classification;
                    }
                    if (Array.isArray(parsed.focusRegions)) {
                        focusRegions = parsed.focusRegions
                            .filter((r) => typeof r === 'string')
                            .slice(0, 3);
                    }
                }
                catch (classErr) {
                    log.warn('Image classification failed, defaulting to "other"', {
                        error: String(classErr),
                    });
                }
            }
            else {
                log.warn('No uploaded image found, defaulting classification to "other"');
            }
            // ── Step 2: Select GIF style preset ──────────────────────────────
            const stylePreset = classificationToPreset(classification);
            log.info('GIF style preset selected', { classification, stylePreset });
            // ── Step 3: Generate motion concept ──────────────────────────────
            const motionPrompt = buildMotionConceptPrompt(classification, stylePreset, focusRegions, brief);
            const motionResponse = await (0, genai_1.generateContent)(motionPrompt, (0, shared_1.getModel)('text'));
            let motionConcept;
            try {
                const cleaned = motionResponse
                    .replace(/^```(?:json)?\s*/i, '')
                    .replace(/\s*```$/i, '')
                    .trim();
                const parsed = JSON.parse(cleaned);
                motionConcept = {
                    stylePreset,
                    imageClassification: classification,
                    motionDescription: typeof parsed.motionDescription === 'string' && parsed.motionDescription.trim()
                        ? parsed.motionDescription.trim()
                        : 'Smooth zoom and pan animation highlighting key areas',
                    focusRegions,
                    suggestedDurationMs: typeof parsed.suggestedDurationMs === 'number'
                        ? Math.min(Math.max(parsed.suggestedDurationMs, 3000), 8000)
                        : 5000,
                };
            }
            catch {
                log.warn('Failed to parse motion concept response, using fallback');
                motionConcept = {
                    stylePreset,
                    imageClassification: classification,
                    motionDescription: 'Smooth zoom and pan animation highlighting key areas',
                    focusRegions,
                    suggestedDurationMs: 5000,
                };
            }
            // ── Step 4: Build storyboard ─────────────────────────────────────
            const storyboardPrompt = buildStoryboardPrompt(motionConcept);
            const storyboardResponse = await (0, genai_1.generateContent)(storyboardPrompt, (0, shared_1.getModel)('text'));
            let storyboard;
            try {
                const cleaned = storyboardResponse
                    .replace(/^```(?:json)?\s*/i, '')
                    .replace(/\s*```$/i, '')
                    .trim();
                const parsed = JSON.parse(cleaned);
                const rawBeats = Array.isArray(parsed.beats)
                    ? parsed.beats.map((b, i) => ({
                        beatNumber: typeof b.beatNumber === 'number' ? b.beatNumber : i + 1,
                        description: typeof b.description === 'string' ? b.description : `Beat ${i + 1}`,
                        durationMs: typeof b.durationMs === 'number' ? b.durationMs : 800,
                        motionType: typeof b.motionType === 'string' ? b.motionType : 'fade',
                        focusArea: typeof b.focusArea === 'string' ? b.focusArea : 'center',
                    }))
                    : [];
                const validatedBeats = validateStoryboardBeats(rawBeats);
                const totalDurationMs = typeof parsed.totalDurationMs === 'number'
                    ? parsed.totalDurationMs
                    : validatedBeats.reduce((sum, b) => sum + b.durationMs, 0);
                const loopStrategy = ['seamless', 'bounce', 'restart'].includes(parsed.loopStrategy)
                    ? parsed.loopStrategy
                    : 'seamless';
                storyboard = {
                    beats: validatedBeats,
                    totalDurationMs,
                    loopStrategy,
                    stylePreset,
                };
            }
            catch {
                log.warn('Failed to parse storyboard response, using fallback');
                const fallbackBeats = validateStoryboardBeats([]);
                storyboard = {
                    beats: fallbackBeats,
                    totalDurationMs: fallbackBeats.reduce((sum, b) => sum + b.durationMs, 0),
                    loopStrategy: 'seamless',
                    stylePreset,
                };
            }
            log.info('GIF storyboard built', {
                beatCount: storyboard.beats.length,
                totalDurationMs: storyboard.totalDurationMs,
                loopStrategy: storyboard.loopStrategy,
            });
            // ── Step 5: Check capability and render ──────────────────────────
            const gifCapability = capability_registry_1.capabilityRegistry.get('gif_generation');
            const isAvailable = gifCapability ? await gifCapability.isAvailable() : false;
            if (isAvailable && gifCapability) {
                log.info('GIF generation capability available, attempting render');
                try {
                    const genResult = await gifCapability.generate({
                        jobId: context.jobId,
                        data: {
                            motionConcept,
                            storyboard,
                            imagePath: imagePath || undefined,
                        },
                    });
                    if (genResult.success && genResult.assets.length > 0) {
                        // Capability returns base64-encoded MP4 data; persist as GIF
                        for (const assetData of genResult.assets) {
                            const assetId = (0, crypto_1.randomUUID)();
                            const gifPath = `${context.jobId}/gifs/${assetId}.gif`;
                            const gifBuffer = Buffer.from(assetData, 'base64');
                            await (0, storage_1.writeAsset)(gifPath, gifBuffer, 'image/gif');
                            await (0, firestore_1.recordAssetReference)(context.jobId, {
                                assetId,
                                jobId: context.jobId,
                                assetType: shared_1.AssetType.Gif,
                                storagePath: gifPath,
                                generationTimestamp: new Date(),
                                status: 'completed',
                            });
                            assets.push(gifPath);
                        }
                        log.info('GIF generation completed successfully', {
                            gifAssetCount: genResult.assets.length,
                        });
                    }
                    else {
                        const reason = genResult.metadata?.reason
                            ? `GIF generation returned no data: ${genResult.metadata.reason}`
                            : 'GIF generation returned no assets';
                        log.warn(reason);
                        await (0, firestore_1.recordFallbackNotice)(context.jobId, {
                            capability: 'gif_generation',
                            reason,
                            timestamp: new Date(),
                            stage: this.jobState,
                        });
                        // Persist creative direction as fallback
                        await this.persistCreativeDirection(context.jobId, motionConcept, storyboard, assets);
                    }
                }
                catch (genErr) {
                    log.warn('GIF generation failed, persisting creative direction', {
                        error: String(genErr),
                    });
                    // MP4 fallback: if the error contains MP4 data, persist it
                    await (0, firestore_1.recordFallbackNotice)(context.jobId, {
                        capability: 'gif_generation',
                        reason: genErr instanceof Error ? genErr.message : String(genErr),
                        timestamp: new Date(),
                        stage: this.jobState,
                    });
                    // Persist creative direction as fallback
                    await this.persistCreativeDirection(context.jobId, motionConcept, storyboard, assets);
                }
            }
            else {
                // Capability unavailable — persist creative direction
                const reason = 'GIF generation capability is unavailable — persisted motion concept and storyboard as creative direction';
                log.warn('GIF generation unavailable, recording fallback', { reason });
                await (0, firestore_1.recordFallbackNotice)(context.jobId, {
                    capability: 'gif_generation',
                    reason,
                    timestamp: new Date(),
                    stage: this.jobState,
                });
                await this.persistCreativeDirection(context.jobId, motionConcept, storyboard, assets);
            }
            // Store in working data for downstream stages
            context.workingData.gifMotionConcept = motionConcept;
            context.workingData.gifStoryboard = storyboard;
            log.info('GenerateGif stage completed', { assetCount: assets.length });
            return { success: true, assets };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.error('GenerateGif stage failed', { error: message });
            return { success: false, assets: [], error: message };
        }
    }
    /**
     * Persist motion concept and storyboard as JSON creative direction assets.
     */
    async persistCreativeDirection(jobId, motionConcept, storyboard, assets) {
        // Persist motion concept
        const motionAssetId = (0, crypto_1.randomUUID)();
        const motionPath = `${jobId}/gif-motion-concept/${motionAssetId}.json`;
        await (0, storage_1.writeAsset)(motionPath, Buffer.from(JSON.stringify(motionConcept, null, 2), 'utf-8'), 'application/json');
        await (0, firestore_1.recordAssetReference)(jobId, {
            assetId: motionAssetId,
            jobId,
            assetType: shared_1.AssetType.Gif,
            storagePath: motionPath,
            generationTimestamp: new Date(),
            status: 'completed',
        });
        assets.push(motionPath);
        // Persist storyboard
        const storyboardAssetId = (0, crypto_1.randomUUID)();
        const storyboardPath = `${jobId}/gif-storyboard/${storyboardAssetId}.json`;
        await (0, storage_1.writeAsset)(storyboardPath, Buffer.from(JSON.stringify(storyboard, null, 2), 'utf-8'), 'application/json');
        await (0, firestore_1.recordAssetReference)(jobId, {
            assetId: storyboardAssetId,
            jobId,
            assetType: shared_1.AssetType.Gif,
            storagePath: storyboardPath,
            generationTimestamp: new Date(),
            status: 'completed',
        });
        assets.push(storyboardPath);
    }
}
exports.GenerateGif = GenerateGif;
//# sourceMappingURL=generate-gif.js.map