"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenerateImages = void 0;
const shared_1 = require("@content-storyteller/shared");
const firestore_1 = require("../services/firestore");
const genai_1 = require("../services/genai");
const storage_1 = require("../services/storage");
const logger_1 = require("../middleware/logger");
const crypto_1 = require("crypto");
const capability_registry_1 = require("../capabilities/capability-registry");
/**
 * Build the image concept generation prompt with platform and tone awareness.
 */
function buildImageConceptPrompt(brief) {
    const platform = brief.platform || shared_1.Platform.GeneralPromoPackage;
    const tone = brief.tone || shared_1.Tone.Professional;
    return `You are a world-class creative director specializing in visual marketing. Generate 3 structured image concepts based on the Creative Brief below.

## Creative Brief
- Target Audience: ${brief.targetAudience}
- Tone: ${tone}
- Key Messages: ${brief.keyMessages.join(', ')}
- Visual Direction: ${brief.visualDirection}
- Input Summary: ${brief.inputSummary}
${brief.campaignAngle ? `- Campaign Angle: ${brief.campaignAngle}` : ''}
${brief.pacing ? `- Pacing: ${brief.pacing}` : ''}
${brief.visualStyle ? `- Visual Style: ${brief.visualStyle}` : ''}
${brief.brandGuidelines ? `- Brand Guidelines: ${brief.brandGuidelines}` : ''}

## Platform: ${platform}
## Tone: ${tone}

## Output Format
Return a JSON array of 3 objects, each with exactly these fields:
- "conceptName": string — a short descriptive name for the visual concept
- "visualDirection": string — detailed description of the visual composition, colors, mood, and layout
- "generationPrompt": string — a detailed prompt suitable for an AI image generation model
- "style": string — the artistic style (e.g., "photorealistic", "flat illustration", "3D render", "cinematic photography")

Return ONLY valid JSON, no markdown fences.`;
}
/**
 * Validate and fill in missing fields on parsed ImageConcept objects.
 */
function validateImageConcepts(parsed, brief) {
    return parsed.map((item, index) => {
        const obj = (item && typeof item === 'object' ? item : {});
        return {
            conceptName: typeof obj.conceptName === 'string' && obj.conceptName.trim()
                ? obj.conceptName.trim()
                : `Concept ${index + 1}`,
            visualDirection: typeof obj.visualDirection === 'string' && obj.visualDirection.trim()
                ? obj.visualDirection.trim()
                : `Marketing visual for ${brief.targetAudience}`,
            generationPrompt: typeof obj.generationPrompt === 'string' && obj.generationPrompt.trim()
                ? obj.generationPrompt.trim()
                : `Create a marketing image for ${brief.keyMessages[0] || 'product launch'}`,
            style: typeof obj.style === 'string' && obj.style.trim()
                ? obj.style.trim()
                : 'photorealistic',
        };
    });
}
/**
 * GenerateImages stage: generate structured ImageConcept objects from the
 * Creative Brief using the Google GenAI SDK, persist them as a JSON asset,
 * and optionally attempt actual image generation if the capability is available.
 */
class GenerateImages {
    name = 'GenerateImages';
    jobState = shared_1.JobState.GeneratingImages;
    async execute(context) {
        const log = (0, logger_1.createLogger)(context.correlationId, context.jobId);
        log.info('GenerateImages stage started');
        try {
            await (0, firestore_1.updateJobState)(context.jobId, this.jobState);
            const brief = context.workingData.creativeBrief;
            if (!brief) {
                throw new Error('Creative Brief not found in working data');
            }
            // 1. Generate ImageConcept objects via GenAI SDK
            const prompt = buildImageConceptPrompt(brief);
            const responseText = await (0, genai_1.generateContent)(prompt, (0, shared_1.getModel)('text'));
            let imageConcepts;
            try {
                const cleaned = responseText
                    .replace(/^```(?:json)?\s*/i, '')
                    .replace(/\s*```$/i, '')
                    .trim();
                const parsed = JSON.parse(cleaned);
                const conceptsArray = Array.isArray(parsed) ? parsed : [parsed];
                imageConcepts = validateImageConcepts(conceptsArray, brief);
            }
            catch {
                log.warn('Failed to parse GenAI response as JSON, using fallback ImageConcepts');
                imageConcepts = validateImageConcepts([{}, {}, {}], brief);
            }
            // 2. Always persist ImageConcept array as JSON asset
            const conceptsAssetId = (0, crypto_1.randomUUID)();
            const conceptsStoragePath = `${context.jobId}/image-concepts/${conceptsAssetId}.json`;
            const conceptsJson = JSON.stringify(imageConcepts, null, 2);
            await (0, storage_1.writeAsset)(conceptsStoragePath, Buffer.from(conceptsJson, 'utf-8'), 'application/json');
            // 3. Record asset reference for the image concepts
            await (0, firestore_1.recordAssetReference)(context.jobId, {
                assetId: conceptsAssetId,
                jobId: context.jobId,
                assetType: shared_1.AssetType.Image,
                storagePath: conceptsStoragePath,
                generationTimestamp: new Date(),
                status: 'completed',
            });
            const assets = [conceptsStoragePath];
            // 4. Check if image generation capability is available
            const imageCapability = capability_registry_1.capabilityRegistry.get('image_generation');
            const isAvailable = imageCapability ? await imageCapability.isAvailable() : false;
            if (isAvailable && imageCapability) {
                // Attempt actual image generation using each concept's generationPrompt
                log.info('Image generation capability available, attempting image generation');
                for (const concept of imageConcepts) {
                    try {
                        const genResult = await imageCapability.generate({
                            jobId: context.jobId,
                            data: { prompt: concept.generationPrompt, brief },
                        });
                        if (genResult.success) {
                            for (const assetData of genResult.assets) {
                                const imageAssetId = (0, crypto_1.randomUUID)();
                                const imageStoragePath = `${context.jobId}/images/${imageAssetId}.png`;
                                await (0, storage_1.writeAsset)(imageStoragePath, Buffer.from(assetData, 'utf-8'), 'image/png');
                                await (0, firestore_1.recordAssetReference)(context.jobId, {
                                    assetId: imageAssetId,
                                    jobId: context.jobId,
                                    assetType: shared_1.AssetType.Image,
                                    storagePath: imageStoragePath,
                                    generationTimestamp: new Date(),
                                    status: 'completed',
                                });
                                assets.push(imageStoragePath);
                            }
                        }
                    }
                    catch (genErr) {
                        log.warn('Image generation failed for concept, continuing', {
                            conceptName: concept.conceptName,
                            error: String(genErr),
                        });
                    }
                }
            }
            else {
                // Image generation unavailable — record fallback notice
                const reason = 'Image generation capability is unavailable — persisted ImageConcept creative direction instead';
                log.warn('Image generation unavailable, recording fallback', { reason });
                await (0, firestore_1.recordFallbackNotice)(context.jobId, {
                    capability: 'image_generation',
                    reason,
                    timestamp: new Date(),
                    stage: this.jobState,
                });
            }
            // Store in working data for downstream stages
            context.workingData.imageConcepts = imageConcepts;
            context.workingData.imageConceptsAssetPath = conceptsStoragePath;
            log.info('GenerateImages stage completed', { conceptCount: imageConcepts.length, assetCount: assets.length });
            return { success: true, assets };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.error('GenerateImages stage failed', { error: message });
            return { success: false, assets: [], error: message };
        }
    }
}
exports.GenerateImages = GenerateImages;
//# sourceMappingURL=generate-images.js.map