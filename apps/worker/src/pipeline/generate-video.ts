import {
  PipelineStage,
  PipelineContext,
  StageResult,
  JobState,
  AssetType,
  CreativeBrief,
  Storyboard,
  StoryboardScene,
  VideoBrief,
  Platform,
  Tone,
  getModel,
} from '@content-storyteller/shared';
import { updateJobState, recordAssetReference, recordFallbackNotice } from '../services/firestore';
import { generateContent } from '../services/genai';
import { writeAsset } from '../services/storage';
import { createLogger } from '../middleware/logger';
import { randomUUID } from 'crypto';
import { capabilityRegistry } from '../capabilities/capability-registry';
import { getProjectId, buildStoragePath } from './storage-paths';

/**
 * Platform-specific scene pacing guidance for the GenerateVideo prompt.
 */
const PLATFORM_VIDEO_PACING: Record<Platform, { totalDuration: string; sceneCount: number; guidance: string }> = {
  [Platform.InstagramReel]: {
    totalDuration: '15s',
    sceneCount: 4,
    guidance:
      'Create a fast-paced 15-second vertical reel. 4 scenes of ~3-4 seconds each. ' +
      'Hook in the first 2 seconds. Quick cuts, bold text overlays, high energy. ' +
      'Optimized for mobile-first 9:16 vertical format.',
  },
  [Platform.LinkedInLaunchPost]: {
    totalDuration: '30s',
    sceneCount: 5,
    guidance:
      'Create a professional 30-second video. 5 scenes of ~5-6 seconds each. ' +
      'Measured pacing with clear narrative arc. Data-driven visuals, clean transitions. ' +
      'Suitable for landscape or square format on LinkedIn feed.',
  },
  [Platform.XTwitterThread]: {
    totalDuration: '20s',
    sceneCount: 4,
    guidance:
      'Create a 20-second visual sequence to accompany a Twitter/X thread. ' +
      '4 scenes of ~5 seconds each. Each scene corresponds to a key thread point. ' +
      'Bold text overlays that can stand alone as visual tweets. Square format preferred.',
  },
  [Platform.GeneralPromoPackage]: {
    totalDuration: '25s',
    sceneCount: 5,
    guidance:
      'Create a versatile 25-second promo video. 5 scenes of ~5 seconds each. ' +
      'Balanced pacing that works across platforms. Adaptable aspect ratio. ' +
      'Clear narrative structure: hook, problem, solution, proof, CTA.',
  },
};

/**
 * Tone-specific motion and visual direction for video generation.
 */
const TONE_VIDEO_DIRECTION: Record<Tone, string> = {
  [Tone.Cinematic]:
    'Cinematic motion style — slow, sweeping camera movements. Dramatic reveals, depth of field shifts. ' +
    'Epic transitions (fade through black, slow dissolves). Atmospheric lighting. Film-grain texture.',
  [Tone.Punchy]:
    'Punchy motion style — fast cuts, snap zooms, dynamic transitions. ' +
    'High energy with quick pans and whip transitions. Bold, oversized text overlays. Rhythmic editing.',
  [Tone.Sleek]:
    'Sleek motion style — smooth, minimal camera movements. Clean slide transitions. ' +
    'Subtle parallax effects. Elegant typography animations. Refined and understated.',
  [Tone.Professional]:
    'Professional motion style — steady, controlled camera movements. ' +
    'Clean cross-dissolves and fade transitions. Structured layouts with data visualizations. ' +
    'Corporate-appropriate pacing with clear information hierarchy.',
};

/**
 * Build the video generation prompt with platform-specific pacing and tone-specific motion.
 */
function buildVideoPrompt(brief: CreativeBrief, platform: Platform, tone: Tone): string {
  const pacing = PLATFORM_VIDEO_PACING[platform] || PLATFORM_VIDEO_PACING[Platform.GeneralPromoPackage];
  const toneDirection = TONE_VIDEO_DIRECTION[tone] || TONE_VIDEO_DIRECTION[Tone.Professional];

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
function validateScene(obj: Record<string, unknown>, index: number): StoryboardScene {
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
function validateStoryboard(parsed: Record<string, unknown>, platform: Platform): Storyboard {
  const pacing = PLATFORM_VIDEO_PACING[platform] || PLATFORM_VIDEO_PACING[Platform.GeneralPromoPackage];
  const rawScenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
  const scenes: StoryboardScene[] = rawScenes.length > 0
    ? rawScenes.map((s: unknown, i: number) =>
        validateScene((s && typeof s === 'object' ? s : {}) as Record<string, unknown>, i),
      )
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
function validateVideoBrief(parsed: Record<string, unknown>, platform: Platform): VideoBrief {
  const pacing = PLATFORM_VIDEO_PACING[platform] || PLATFORM_VIDEO_PACING[Platform.GeneralPromoPackage];
  const rawScenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
  const scenes: StoryboardScene[] = rawScenes.length > 0
    ? rawScenes.map((s: unknown, i: number) =>
        validateScene((s && typeof s === 'object' ? s : {}) as Record<string, unknown>, i),
      )
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
 * Format a Storyboard as human-readable text for .txt export.
 */
function formatStoryboardText(storyboard: Storyboard): string {
  const lines: string[] = [
    '=== STORYBOARD ===',
    '',
    `Total Duration: ${storyboard.totalDuration}`,
    `Pacing: ${storyboard.pacing}`,
    '',
  ];

  for (const scene of storyboard.scenes) {
    lines.push(`--- Scene ${scene.sceneNumber} (${scene.duration}) ---`);
    lines.push(`Description: ${scene.description}`);
    lines.push(`Camera: ${scene.cameraDirection}`);
    lines.push(`Motion: ${scene.motionStyle}`);
    if (scene.textOverlay) {
      lines.push(`Text Overlay: ${scene.textOverlay}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * GenerateVideo stage: generate a structured Storyboard and VideoBrief from
 * the Creative Brief using the Google GenAI SDK, persist both as JSON assets,
 * and optionally attempt actual video generation if the capability is available.
 */
export class GenerateVideo implements PipelineStage {
  readonly name = 'GenerateVideo';
  readonly jobState = JobState.GeneratingVideo;

  async execute(context: PipelineContext): Promise<StageResult> {
    const log = createLogger(context.correlationId, context.jobId);
    log.info('GenerateVideo stage started');

    try {
      await updateJobState(context.jobId, this.jobState);

      const brief = context.workingData.creativeBrief as CreativeBrief | undefined;
      if (!brief) {
        throw new Error('Creative Brief not found in working data');
      }

      const platform = (brief.platform as Platform) || Platform.GeneralPromoPackage;
      const tone = (brief.tone as Tone) || Tone.Professional;

      log.info('GenerateVideo inputs', { platform, tone });

      // Build platform-aware, tone-aware video prompt
      const prompt = buildVideoPrompt(brief, platform, tone);

      // Call GenAI SDK to generate Storyboard + VideoBrief
      const responseText = await generateContent(prompt, getModel('reasoning'));

      let storyboard: Storyboard;
      let videoBrief: VideoBrief;
      try {
        const cleaned = responseText
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();
        const parsed = JSON.parse(cleaned);

        const rawStoryboard = (parsed.storyboard && typeof parsed.storyboard === 'object'
          ? parsed.storyboard
          : parsed) as Record<string, unknown>;
        const rawVideoBrief = (parsed.videoBrief && typeof parsed.videoBrief === 'object'
          ? parsed.videoBrief
          : {}) as Record<string, unknown>;

        storyboard = validateStoryboard(rawStoryboard, platform);
        videoBrief = validateVideoBrief(rawVideoBrief, platform);
      } catch {
        log.warn('Failed to parse GenAI response as JSON, using fallback Storyboard and VideoBrief');
        storyboard = validateStoryboard({}, platform);
        videoBrief = validateVideoBrief({}, platform);
      }

      const assets: string[] = [];
      const projectId = getProjectId(context.workingData);

      // Persist Storyboard as JSON asset
      const storyboardAssetId = randomUUID();
      const storyboardPath = buildStoragePath(projectId, context.jobId, 'storyboard', `storyboard-${storyboardAssetId}.json`);
      const storyboardJson = JSON.stringify(storyboard, null, 2);
      await writeAsset(storyboardPath, Buffer.from(storyboardJson, 'utf-8'), 'application/json');

      await recordAssetReference(context.jobId, {
        assetId: storyboardAssetId,
        jobId: context.jobId,
        assetType: AssetType.Storyboard,
        storagePath: storyboardPath,
        generationTimestamp: new Date(),
        status: 'completed',
      });
      assets.push(storyboardPath);

      // Persist stable storyboard.json alongside the UUID-named JSON for easy discovery
      const stableStoryboardJsonPath = buildStoragePath(projectId, context.jobId, 'storyboard', 'storyboard.json');
      await writeAsset(stableStoryboardJsonPath, Buffer.from(storyboardJson, 'utf-8'), 'application/json');
      assets.push(stableStoryboardJsonPath);

      // Persist human-readable storyboard .txt alongside JSON
      const storyboardTxt = formatStoryboardText(storyboard);
      const storyboardTxtPath = buildStoragePath(projectId, context.jobId, 'storyboard', 'storyboard.txt');
      await writeAsset(storyboardTxtPath, Buffer.from(storyboardTxt, 'utf-8'), 'text/plain');
      assets.push(storyboardTxtPath);

      // Persist VideoBrief as JSON asset
      const videoBriefAssetId = randomUUID();
      const videoBriefPath = buildStoragePath(projectId, context.jobId, 'metadata', `video-brief-${videoBriefAssetId}.json`);
      const videoBriefJson = JSON.stringify(videoBrief, null, 2);
      await writeAsset(videoBriefPath, Buffer.from(videoBriefJson, 'utf-8'), 'application/json');

      await recordAssetReference(context.jobId, {
        assetId: videoBriefAssetId,
        jobId: context.jobId,
        assetType: AssetType.VideoBriefMeta,
        storagePath: videoBriefPath,
        generationTimestamp: new Date(),
        status: 'completed',
      });
      assets.push(videoBriefPath);

      // Check if video generation capability is available for actual video rendering
      const videoCapability = capabilityRegistry.get('video_generation');
      const isAvailable = videoCapability ? await videoCapability.isAvailable() : false;

      if (isAvailable && videoCapability) {
        log.info('Video generation capability available, attempting video generation');
        try {
          // Calculate remaining pipeline time to cap video generation timeout
          const pipelineStartTime = context.workingData._pipelineStartTime as number | undefined;
          const pipelineTimeoutMs = context.workingData._pipelineTimeoutMs as number | undefined;
          let videoTimeoutMs: number | undefined;
          if (pipelineStartTime && pipelineTimeoutMs) {
            const elapsed = Date.now() - pipelineStartTime;
            // Leave 60s headroom for post-video stages (GIF, ComposePackage)
            videoTimeoutMs = Math.max(60_000, pipelineTimeoutMs - elapsed - 60_000);
            log.info('Video generation timeout calculated', { videoTimeoutMs, elapsed, pipelineTimeoutMs });
          }

          const genResult = await videoCapability.generate({
            jobId: context.jobId,
            data: { brief, storyboard, videoBrief, timeoutMs: videoTimeoutMs },
          });

          if (genResult.success && genResult.assets.length > 0) {
            for (const assetData of genResult.assets) {
              const videoAssetId = randomUUID();
              const videoStoragePath = buildStoragePath(projectId, context.jobId, 'video', `${videoAssetId}.mp4`);
              // Asset data from Veo API is base64-encoded mp4 binary
              const videoBuffer = Buffer.from(assetData, 'base64');
              await writeAsset(videoStoragePath, videoBuffer, 'video/mp4');
              await recordAssetReference(context.jobId, {
                assetId: videoAssetId,
                jobId: context.jobId,
                assetType: AssetType.Video,
                storagePath: videoStoragePath,
                generationTimestamp: new Date(),
                status: 'completed',
              });
              assets.push(videoStoragePath);

              // Set videoAssetPath for downstream stages (e.g. GenerateGif)
              if (!context.workingData.videoAssetPath) {
                context.workingData.videoAssetPath = videoStoragePath;
              }
            }
            log.info('Video generation completed successfully', {
              videoAssetCount: genResult.assets.length,
            });
          } else {
            const rawReason = genResult.metadata?.reason;
            const isTimeout = rawReason === 'timeout-or-no-video' || rawReason === 'video-generation-timeout';
            const mappedReason = isTimeout ? 'video-generation-timeout' : rawReason;
            const reason = mappedReason
              ? `Video generation returned no video: ${mappedReason}`
              : 'Video generation returned no video assets';
            log.warn(reason, {
              isTimeout,
              ...(genResult.metadata?.pollCount !== undefined ? { pollCount: genResult.metadata.pollCount } : {}),
              ...(genResult.metadata?.elapsedMs !== undefined ? { elapsedMs: genResult.metadata.elapsedMs } : {}),
            });
            await recordFallbackNotice(context.jobId, {
              capability: 'video_generation',
              reason: isTimeout ? 'video-generation-timeout' : reason,
              timestamp: new Date(),
              stage: this.jobState,
            });
            // Store failure info in working data for downstream consumers and return logic
            context.workingData.videoGenerationFailed = true;
            context.workingData.videoGenerationFailureReason = reason;
            if (isTimeout) {
              context.workingData.videoGenerationTimeout = true;
            }
          }
        } catch (genErr) {
          const errReason = genErr instanceof Error ? genErr.message : String(genErr);
          log.warn('Video generation failed, storyboard and video brief still persisted', {
            error: errReason,
          });
          await recordFallbackNotice(context.jobId, {
            capability: 'video_generation',
            reason: errReason,
            timestamp: new Date(),
            stage: this.jobState,
          });
          context.workingData.videoGenerationFailed = true;
          context.workingData.videoGenerationFailureReason = errReason;
        }
      } else {
        const reason = 'Video generation capability is unavailable — persisted Storyboard and VideoBrief as creative direction';
        log.warn('Video generation unavailable, recording fallback', { reason });
        await recordFallbackNotice(context.jobId, {
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
      const isTimeout = !!context.workingData.videoGenerationTimeout;
      const videoFailed = !!context.workingData.videoGenerationFailed;
      if (videoFailed) {
        const reason = context.workingData.videoGenerationFailureReason as string | undefined;
        return {
          success: false,
          assets,
          error: isTimeout
            ? 'Video generation timed out — storyboard and video brief persisted as creative direction'
            : reason || 'Video generation failed — storyboard and video brief persisted as creative direction',
        };
      }
      return {
        success: true,
        assets,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('GenerateVideo stage failed', { error: message });
      return { success: false, assets: [], error: message };
    }
  }
}
