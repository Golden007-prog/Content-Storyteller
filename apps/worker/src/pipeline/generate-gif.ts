import {
  PipelineStage,
  PipelineContext,
  StageResult,
  JobState,
  AssetType,
  CreativeBrief,
  GifStylePreset,
  ImageClassification,
  GifMotionConcept,
  GifStoryboardBeat,
  GifStoryboard,
  getModel,
} from '@content-storyteller/shared';
import { updateJobState, recordAssetReference, recordFallbackNotice } from '../services/firestore';
import { generateContent, generateContentMultimodal } from '../services/genai';
import { writeAsset } from '../services/storage';
import { readUpload } from '../services/storage';
import { createLogger } from '../middleware/logger';
import { randomUUID } from 'crypto';
import { capabilityRegistry } from '../capabilities/capability-registry';
import { getProjectId, buildStoragePath } from './storage-paths';

/**
 * Map an ImageClassification to the appropriate GifStylePreset.
 * Exported for independent testing.
 */
export function classificationToPreset(classification: ImageClassification): GifStylePreset {
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
export function validateStoryboardBeats(beats: GifStoryboardBeat[]): GifStoryboardBeat[] {
  const MIN_BEATS = 3;
  const MAX_BEATS = 6;

  let clamped = beats.slice(0, MAX_BEATS);

  while (clamped.length < MIN_BEATS) {
    const nextBeat: GifStoryboardBeat = {
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
function inferMimeType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/png'; // default
}

/**
 * Build the image classification prompt for the multimodal model.
 */
function buildClassificationPrompt(): string {
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
function buildMotionConceptPrompt(
  classification: ImageClassification,
  preset: GifStylePreset,
  focusRegions: string[],
  brief?: CreativeBrief,
): string {
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
function buildStoryboardPrompt(
  motionConcept: GifMotionConcept,
): string {
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
export class GenerateGif implements PipelineStage {
  readonly name = 'GenerateGif';
  readonly jobState = JobState.GeneratingGif;

  async execute(context: PipelineContext): Promise<StageResult> {
    const log = createLogger(context.correlationId, context.jobId);
    log.info('GenerateGif stage started');

    try {
      await updateJobState(context.jobId, this.jobState);

      const brief = context.workingData.creativeBrief as CreativeBrief | undefined;
      const assets: string[] = [];

      // ── Step 0: Check for completed video asset ──────────────────────
      const videoAssetPath = context.workingData.videoAssetPath as string | undefined;
      if (!videoAssetPath) {
        log.warn('No completed video asset found, skipping GIF rendering');
        await recordFallbackNotice(context.jobId, {
          capability: 'gif_generation',
          reason: 'GIF generation requires a completed video asset — no video was available from the GenerateVideo stage',
          timestamp: new Date(),
          stage: this.jobState,
        });
        log.info('GenerateGif stage completed (skipped — no video asset)', { assetCount: 0 });
        return { success: true, assets: [] };
      }

      log.info('Video asset found for GIF conversion', { videoAssetPath });

      // ── Step 1: Classify the uploaded image ──────────────────────────
      let classification: ImageClassification = 'other';
      let focusRegions: string[] = [];

      const imagePath = context.uploadedMediaPaths[0];
      if (imagePath) {
        try {
          const imageBuffer = await readUpload(imagePath);
          const mimeType = inferMimeType(imagePath);
          const classificationPrompt = buildClassificationPrompt();

          const classificationResponse = await generateContentMultimodal(
            [
              { inlineData: { data: imageBuffer.toString('base64'), mimeType } },
              { text: classificationPrompt },
            ],
            getModel('image'),
          );

          const cleaned = classificationResponse
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();
          const parsed = JSON.parse(cleaned);

          const validClassifications: ImageClassification[] = [
            'diagram', 'workflow', 'ui_screenshot', 'chart', 'infographic', 'other',
          ];
          if (validClassifications.includes(parsed.classification)) {
            classification = parsed.classification;
          }
          if (Array.isArray(parsed.focusRegions)) {
            focusRegions = parsed.focusRegions
              .filter((r: unknown) => typeof r === 'string')
              .slice(0, 3);
          }
        } catch (classErr) {
          log.warn('Image classification failed, defaulting to "other"', {
            error: String(classErr),
          });
        }
      } else {
        log.warn('No uploaded image found, defaulting classification to "other"');
      }

      // ── Step 2: Select GIF style preset ──────────────────────────────
      const stylePreset = classificationToPreset(classification);
      log.info('GIF style preset selected', { classification, stylePreset });

      // ── Step 3: Generate motion concept ──────────────────────────────
      const motionPrompt = buildMotionConceptPrompt(classification, stylePreset, focusRegions, brief);
      const motionResponse = await generateContent(motionPrompt, getModel('text'));

      let motionConcept: GifMotionConcept;
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
      } catch {
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
      const storyboardResponse = await generateContent(storyboardPrompt, getModel('text'));

      let storyboard: GifStoryboard;
      try {
        const cleaned = storyboardResponse
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();
        const parsed = JSON.parse(cleaned);

        const rawBeats: GifStoryboardBeat[] = Array.isArray(parsed.beats)
          ? parsed.beats.map((b: Record<string, unknown>, i: number) => ({
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
          ? (parsed.loopStrategy as 'seamless' | 'bounce' | 'restart')
          : 'seamless';

        storyboard = {
          beats: validatedBeats,
          totalDurationMs,
          loopStrategy,
          stylePreset,
        };
      } catch {
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
      const projectId = getProjectId(context.workingData);
      const gifCapability = capabilityRegistry.get('gif_generation');
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
              videoAssetPath,
            },
          });

          if (genResult.success && genResult.assets.length > 0) {
            // Capability returns base64-encoded MP4 data; persist as GIF
            for (const assetData of genResult.assets) {
              const assetId = randomUUID();
              const gifPath = buildStoragePath(projectId, context.jobId, 'gif', `${assetId}.gif`);
              const gifBuffer = Buffer.from(assetData, 'base64');
              await writeAsset(gifPath, gifBuffer, 'image/gif');

              await recordAssetReference(context.jobId, {
                assetId,
                jobId: context.jobId,
                assetType: AssetType.Gif,
                storagePath: gifPath,
                generationTimestamp: new Date(),
                status: 'completed',
              });
              assets.push(gifPath);
            }
            log.info('GIF generation completed successfully', {
              gifAssetCount: genResult.assets.length,
            });
          } else {
            const reason = genResult.metadata?.reason
              ? `GIF generation returned no data: ${genResult.metadata.reason}`
              : 'GIF generation returned no assets';
            log.warn(reason);
            await recordFallbackNotice(context.jobId, {
              capability: 'gif_generation',
              reason,
              timestamp: new Date(),
              stage: this.jobState,
            });
            // Persist creative direction as fallback
            await this.persistCreativeDirection(context.jobId, motionConcept, storyboard, assets, projectId);
          }
        } catch (genErr) {
          log.warn('GIF generation failed, persisting creative direction', {
            error: String(genErr),
          });

          // MP4 fallback: if the error contains MP4 data, persist it
          await recordFallbackNotice(context.jobId, {
            capability: 'gif_generation',
            reason: genErr instanceof Error ? genErr.message : String(genErr),
            timestamp: new Date(),
            stage: this.jobState,
          });

          // Persist creative direction as fallback
          await this.persistCreativeDirection(context.jobId, motionConcept, storyboard, assets, projectId);
        }
      } else {
        // Capability unavailable — persist creative direction
        const reason = 'GIF generation capability is unavailable — persisted motion concept and storyboard as creative direction';
        log.warn('GIF generation unavailable, recording fallback', { reason });
        await recordFallbackNotice(context.jobId, {
          capability: 'gif_generation',
          reason,
          timestamp: new Date(),
          stage: this.jobState,
        });
        await this.persistCreativeDirection(context.jobId, motionConcept, storyboard, assets, projectId);
      }

      // Store in working data for downstream stages
      context.workingData.gifMotionConcept = motionConcept;
      context.workingData.gifStoryboard = storyboard;

      log.info('GenerateGif stage completed', { assetCount: assets.length });
      return { success: true, assets };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('GenerateGif stage failed', { error: message });
      return { success: false, assets: [], error: message };
    }
  }

  /**
   * Persist motion concept and storyboard as JSON creative direction assets.
   */
  private async persistCreativeDirection(
    jobId: string,
    motionConcept: GifMotionConcept,
    storyboard: GifStoryboard,
    assets: string[],
    projectId: string,
  ): Promise<void> {
    // Persist motion concept
    const motionAssetId = randomUUID();
    const motionPath = buildStoragePath(projectId, jobId, 'metadata', `gif-motion-concept-${motionAssetId}.json`);
    await writeAsset(motionPath, Buffer.from(JSON.stringify(motionConcept, null, 2), 'utf-8'), 'application/json');
    await recordAssetReference(jobId, {
      assetId: motionAssetId,
      jobId,
      assetType: AssetType.GifCreativeDirection,
      storagePath: motionPath,
      generationTimestamp: new Date(),
      status: 'completed',
    });
    assets.push(motionPath);

    // Persist storyboard
    const storyboardAssetId = randomUUID();
    const storyboardPath = buildStoragePath(projectId, jobId, 'metadata', `gif-storyboard-${storyboardAssetId}.json`);
    await writeAsset(storyboardPath, Buffer.from(JSON.stringify(storyboard, null, 2), 'utf-8'), 'application/json');
    await recordAssetReference(jobId, {
      assetId: storyboardAssetId,
      jobId,
      assetType: AssetType.GifCreativeDirection,
      storagePath: storyboardPath,
      generationTimestamp: new Date(),
      status: 'completed',
    });
    assets.push(storyboardPath);
  }
}
