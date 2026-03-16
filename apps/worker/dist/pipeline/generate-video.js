"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenerateVideo = void 0;
const shared_1 = require("@content-storyteller/shared");
const firestore_1 = require("../services/firestore");
const genai_1 = require("../services/genai");
const storage_1 = require("../services/storage");
const logger_1 = require("../middleware/logger");
const crypto_1 = require("crypto");
const capability_registry_1 = require("../capabilities/capability-registry");
/**
 * Platform-specific scene pacing guidance for the GenerateVideo prompt.
 */
const PLATFORM_VIDEO_PACING = {
    [shared_1.Platform.InstagramReel]: {
        totalDuration: '15s',
        sceneCount: 4,
        guidance: 'Create a fast-paced 15-second vertical reel. 4 scenes of ~3-4 seconds each. ' +
            'Hook in the first 2 seconds. Quick cuts, bold text overlays, high energy. ' +
            'Optimized for mobile-first 9:16 vertical format.',
    },
    [shared_1.Platform.LinkedInLaunchPost]: {
        totalDuration: '30s',
        sceneCount: 5,
        guidance: 'Create a professional 30-second video. 5 scenes of ~5-6 seconds each. ' +
            'Measured pacing with clear narrative arc. Data-driven visuals, clean transitions. ' +
            'Suitable for landscape or square format on LinkedIn feed.',
    },
    [shared_1.Platform.XTwitterThread]: {
        totalDuration: '20s',
        sceneCount: 4,
        guidance: 'Create a 20-second visual sequence to accompany a Twitter/X thread. ' +
            '4 scenes of ~5 seconds each. Each scene corresponds to a key thread point. ' +
            'Bold text overlays that can stand alone as visual tweets. Square format preferred.',
    },
    [shared_1.Platform.GeneralPromoPackage]: {
        totalDuration: '25s',
        sceneCount: 5,
        guidance: 'Create a versatile 25-second promo video. 5 scenes of ~5 seconds each. ' +
            'Balanced pacing that works across platforms. Adaptable aspect ratio. ' +
            'Clear narrative structure: hook, problem, solution, proof, CTA.',
    },
};
/**
 * Tone-specific motion and visual direction for video generation.
 */
const TONE_VIDEO_DIRECTION = {
    [shared_1.Tone.Cinematic]: 'Cinematic motion style — slow, sweeping camera movements. Dramatic reveals, depth of field shifts. ' +
        'Epic transitions (fade through black, slow dissolves). Atmospheric lighting. Film-grain texture.',
    [shared_1.Tone.Punchy]: 'Punchy motion style — fast cuts, snap zooms, dynamic transitions. ' +
        'High energy with quick pans and whip transitions. Bold, oversized text overlays. Rhythmic editing.',
    [shared_1.Tone.Sleek]: 'Sleek motion style — smooth, minimal camera movements. Clean slide transitions. ' +
        'Subtle parallax effects. Elegant typography animations. Refined and understated.',
    [shared_1.Tone.Professional]: 'Professional motion style — steady, controlled camera movements. ' +
        'Clean cross-dissolves and fade transitions. Structured layouts with data visualizations. ' +
        'Corporate-appropriate pacing with clear information hierarchy.',
};
/**
 * Build the video generation prompt with platform-specific pacing and tone-specific motion.
 */
function buildVideoPrompt(brief, platform, tone) {
    const pacing = PLATFORM_VIDEO_PACING[platform] || PLATFORM_VIDEO_PACING[shared_1.Platform.GeneralPromoPackage];
    const toneDirection = TONE_VIDEO_DIRECTION[tone] || TONE_VIDEO_DIRECTION[shared_1.Tone.Professional];
    return `You are a world-class video director and storyboard artist. Generate a complete Storyboard and Video Brief based on the Creative Brief below.

## Creative Brief
- Target Audience: ${brief.targetAudience}
- Tone: ${brief.tone}
- Key Messages: ${brief.keyMessages.join(', ')}
- Visual Direction: ${brief.visualDirection}
- Input Summary: ${brief.inputSummary}
${brief.campaignAngle ? `- Campaign Angle: ${brief.campaignAngle}` : ''}
${brief.pacing ? `- Pacing: ${brief.pacing}` : ''}
${brief.visualStyle ? `- Visual Style: ${brief.visualStyle}` : ''}
${brief.brandGuidelines ? `- Brand Guidelines: ${brief.brandGuidelines}` : ''}

## Platform Pacing (${platform})
Target duration: ${pacing.totalDuration}
Number of scenes: ${pacing.sceneCount}
${pacing.guidance}

## Tone & Motion Direction (${tone})
${toneDirection}

## Output Format
Return a JSON object with exactly these two top-level keys:

"storyboard": {
  "scenes": [
    {
      "sceneNumber": number (1-based),
      "description": string (detailed scene description),
      "duration": string (e.g. "3s", "5s"),
      "motionStyle": string (camera/motion description),
      "textOverlay": string (on-screen text for this scene),
      "cameraDirection": string (camera angle/movement instruction)
    }
  ],
  "totalDuration": string (e.g. "${pacing.totalDuration}"),
  "pacing": string (overall pacing description)
}

"videoBrief": {
  "totalDuration": string (e.g. "${pacing.totalDuration}"),
  "motionStyle": string (overall motion style),
  "textOverlayStyle": string (typography/text overlay approach),
  "cameraDirection": string (overall camera direction strategy),
  "energyDirection": string (energy arc description — e.g. "builds from calm to explosive")
}

Generate exactly ${pacing.sceneCount} scenes. Return ONLY valid JSON, no markdown fences.`;
}
/**
 * Validate and fill in missing fields on a parsed StoryboardScene.
 */
function validateScene(obj, index) {
    return {
        sceneNumber: typeof obj.sceneNumber === 'number' ? obj.sceneNumber : index + 1,
        description: typeof obj.description === 'string' && obj.description.trim()
            ? obj.description.trim()
            : `Scene ${index + 1} — establishing shot`,
        duration: typeof obj.duration === 'string' && obj.duration.trim()
            ? obj.duration.trim()
            : '5s',
        motionStyle: typeof obj.motionStyle === 'string' && obj.motionStyle.trim()
            ? obj.motionStyle.trim()
            : 'steady',
        textOverlay: typeof obj.textOverlay === 'string'
            ? obj.textOverlay.trim()
            : '',
        cameraDirection: typeof obj.cameraDirection === 'string' && obj.cameraDirection.trim()
            ? obj.cameraDirection.trim()
            : 'wide shot',
    };
}
/**
 * Validate and fill in missing fields on a parsed Storyboard.
 */
function validateStoryboard(parsed, platform) {
    const pacing = PLATFORM_VIDEO_PACING[platform] || PLATFORM_VIDEO_PACING[shared_1.Platform.GeneralPromoPackage];
    const rawScenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
    const scenes = rawScenes.length > 0
        ? rawScenes.map((s, i) => validateScene((s && typeof s === 'object' ? s : {}), i))
        : [validateScene({}, 0)];
    return {
        scenes,
        totalDuration: typeof parsed.totalDuration === 'string' && parsed.totalDuration.trim()
            ? parsed.totalDuration.trim()
            : pacing.totalDuration,
        pacing: typeof parsed.pacing === 'string' && parsed.pacing.trim()
            ? parsed.pacing.trim()
            : 'balanced',
    };
}
/**
 * Validate and fill in missing fields on a parsed VideoBrief.
 */
function validateVideoBrief(parsed, platform) {
    const pacing = PLATFORM_VIDEO_PACING[platform] || PLATFORM_VIDEO_PACING[shared_1.Platform.GeneralPromoPackage];
    const rawScenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
    const scenes = rawScenes.length > 0
        ? rawScenes.map((s, i) => validateScene((s && typeof s === 'object' ? s : {}), i))
        : [];
    return {
        scenes,
        totalDuration: typeof parsed.totalDuration === 'string' && parsed.totalDuration.trim()
            ? parsed.totalDuration.trim()
            : pacing.totalDuration,
        motionStyle: typeof parsed.motionStyle === 'string' && parsed.motionStyle.trim()
            ? parsed.motionStyle.trim()
            : 'smooth transitions',
        textOverlayStyle: typeof parsed.textOverlayStyle === 'string' && parsed.textOverlayStyle.trim()
            ? parsed.textOverlayStyle.trim()
            : 'bold sans-serif',
        cameraDirection: typeof parsed.cameraDirection === 'string' && parsed.cameraDirection.trim()
            ? parsed.cameraDirection.trim()
            : 'mixed angles',
        energyDirection: typeof parsed.energyDirection === 'string' && parsed.energyDirection.trim()
            ? parsed.energyDirection.trim()
            : 'builds from calm to energetic',
    };
}
/**
 * GenerateVideo stage: generate a structured Storyboard and VideoBrief from
 * the Creative Brief using the Google GenAI SDK, persist both as JSON assets,
 * and optionally attempt actual video generation if the capability is available.
 */
class GenerateVideo {
    name = 'GenerateVideo';
    jobState = shared_1.JobState.GeneratingVideo;
    async execute(context) {
        const log = (0, logger_1.createLogger)(context.correlationId, context.jobId);
        log.info('GenerateVideo stage started');
        try {
            await (0, firestore_1.updateJobState)(context.jobId, this.jobState);
            const brief = context.workingData.creativeBrief;
            if (!brief) {
                throw new Error('Creative Brief not found in working data');
            }
            const platform = brief.platform || shared_1.Platform.GeneralPromoPackage;
            const tone = brief.tone || shared_1.Tone.Professional;
            log.info('GenerateVideo inputs', { platform, tone });
            // Build platform-aware, tone-aware video prompt
            const prompt = buildVideoPrompt(brief, platform, tone);
            // Call GenAI SDK to generate Storyboard + VideoBrief
            const responseText = await (0, genai_1.generateContent)(prompt, (0, shared_1.getModel)('reasoning'));
            let storyboard;
            let videoBrief;
            try {
                const cleaned = responseText
                    .replace(/^```(?:json)?\s*/i, '')
                    .replace(/\s*```$/i, '')
                    .trim();
                const parsed = JSON.parse(cleaned);
                const rawStoryboard = (parsed.storyboard && typeof parsed.storyboard === 'object'
                    ? parsed.storyboard
                    : parsed);
                const rawVideoBrief = (parsed.videoBrief && typeof parsed.videoBrief === 'object'
                    ? parsed.videoBrief
                    : {});
                storyboard = validateStoryboard(rawStoryboard, platform);
                videoBrief = validateVideoBrief(rawVideoBrief, platform);
            }
            catch {
                log.warn('Failed to parse GenAI response as JSON, using fallback Storyboard and VideoBrief');
                storyboard = validateStoryboard({}, platform);
                videoBrief = validateVideoBrief({}, platform);
            }
            const assets = [];
            // Persist Storyboard as JSON asset
            const storyboardAssetId = (0, crypto_1.randomUUID)();
            const storyboardPath = `${context.jobId}/storyboard/${storyboardAssetId}.json`;
            const storyboardJson = JSON.stringify(storyboard, null, 2);
            await (0, storage_1.writeAsset)(storyboardPath, Buffer.from(storyboardJson, 'utf-8'), 'application/json');
            await (0, firestore_1.recordAssetReference)(context.jobId, {
                assetId: storyboardAssetId,
                jobId: context.jobId,
                assetType: shared_1.AssetType.Storyboard,
                storagePath: storyboardPath,
                generationTimestamp: new Date(),
                status: 'completed',
            });
            assets.push(storyboardPath);
            // Persist VideoBrief as JSON asset
            const videoBriefAssetId = (0, crypto_1.randomUUID)();
            const videoBriefPath = `${context.jobId}/video-brief/${videoBriefAssetId}.json`;
            const videoBriefJson = JSON.stringify(videoBrief, null, 2);
            await (0, storage_1.writeAsset)(videoBriefPath, Buffer.from(videoBriefJson, 'utf-8'), 'application/json');
            await (0, firestore_1.recordAssetReference)(context.jobId, {
                assetId: videoBriefAssetId,
                jobId: context.jobId,
                assetType: shared_1.AssetType.Video,
                storagePath: videoBriefPath,
                generationTimestamp: new Date(),
                status: 'completed',
            });
            assets.push(videoBriefPath);
            // Check if video generation capability is available for actual video rendering
            const videoCapability = capability_registry_1.capabilityRegistry.get('video_generation');
            const isAvailable = videoCapability ? await videoCapability.isAvailable() : false;
            if (isAvailable && videoCapability) {
                log.info('Video generation capability available, attempting video generation');
                try {
                    const genResult = await videoCapability.generate({
                        jobId: context.jobId,
                        data: { brief, storyboard, videoBrief },
                    });
                    if (genResult.success && genResult.assets.length > 0) {
                        for (const assetData of genResult.assets) {
                            const videoAssetId = (0, crypto_1.randomUUID)();
                            const videoStoragePath = `${context.jobId}/video/${videoAssetId}.mp4`;
                            // Asset data from Veo API is base64-encoded mp4 binary
                            const videoBuffer = Buffer.from(assetData, 'base64');
                            await (0, storage_1.writeAsset)(videoStoragePath, videoBuffer, 'video/mp4');
                            await (0, firestore_1.recordAssetReference)(context.jobId, {
                                assetId: videoAssetId,
                                jobId: context.jobId,
                                assetType: shared_1.AssetType.Video,
                                storagePath: videoStoragePath,
                                generationTimestamp: new Date(),
                                status: 'completed',
                            });
                            assets.push(videoStoragePath);
                        }
                        log.info('Video generation completed successfully', {
                            videoAssetCount: genResult.assets.length,
                        });
                    }
                    else {
                        const reason = genResult.metadata?.reason
                            ? `Video generation returned no video: ${genResult.metadata.reason}`
                            : 'Video generation returned no video assets';
                        log.warn(reason);
                        await (0, firestore_1.recordFallbackNotice)(context.jobId, {
                            capability: 'video_generation',
                            reason,
                            timestamp: new Date(),
                            stage: this.jobState,
                        });
                    }
                }
                catch (genErr) {
                    log.warn('Video generation failed, storyboard and video brief still persisted', {
                        error: String(genErr),
                    });
                    await (0, firestore_1.recordFallbackNotice)(context.jobId, {
                        capability: 'video_generation',
                        reason: genErr instanceof Error ? genErr.message : String(genErr),
                        timestamp: new Date(),
                        stage: this.jobState,
                    });
                }
            }
            else {
                const reason = 'Video generation capability is unavailable — persisted Storyboard and VideoBrief as creative direction';
                log.warn('Video generation unavailable, recording fallback', { reason });
                await (0, firestore_1.recordFallbackNotice)(context.jobId, {
                    capability: 'video_generation',
                    reason,
                    timestamp: new Date(),
                    stage: this.jobState,
                });
            }
            // Store in working data for downstream stages
            context.workingData.storyboard = storyboard;
            context.workingData.videoBrief = videoBrief;
            context.workingData.storyboardAssetPath = storyboardPath;
            context.workingData.videoBriefAssetPath = videoBriefPath;
            log.info('GenerateVideo stage completed', {
                sceneCount: storyboard.scenes.length,
                totalDuration: storyboard.totalDuration,
                assetCount: assets.length,
            });
            return { success: true, assets };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.error('GenerateVideo stage failed', { error: message });
            return { success: false, assets: [], error: message };
        }
    }
}
exports.GenerateVideo = GenerateVideo;
//# sourceMappingURL=generate-video.js.map