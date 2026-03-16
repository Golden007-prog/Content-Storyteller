import {
  PipelineStage,
  PipelineContext,
  StageResult,
  JobState,
  AssetType,
  CreativeBrief,
  ImageConcept,
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
 * Build the image concept generation prompt with platform and tone awareness.
 */
function buildImageConceptPrompt(brief: CreativeBrief): string {
  const platform = brief.platform || Platform.GeneralPromoPackage;
  const tone = brief.tone || Tone.Professional;

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
function validateImageConcepts(parsed: unknown[], brief: CreativeBrief): ImageConcept[] {
  return parsed.map((item, index) => {
    const obj = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
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
 * Detect whether asset data is likely plain text rather than base64-encoded
 * binary image data. Base64-encoded images are long strings of alphanumeric
 * characters, +, /, and = padding. Plain text contains spaces, punctuation,
 * and natural language patterns.
 */
function isLikelyTextNotBinary(data: string): boolean {
  if (!data || data.length === 0) return true;
  // If the string contains spaces or newlines, it's almost certainly text
  if (/\s/.test(data)) return true;
  // Check if it looks like valid base64: only [A-Za-z0-9+/=] characters
  // and reasonable length (real images are typically > 100 chars of base64)
  const isBase64 = /^[A-Za-z0-9+/]+=*$/.test(data) && data.length > 100;
  return !isBase64;
}

/**
 * GenerateImages stage: generate structured ImageConcept objects from the
 * Creative Brief using the Google GenAI SDK, persist them as a JSON asset,
 * and optionally attempt actual image generation if the capability is available.
 */
export class GenerateImages implements PipelineStage {
  readonly name = 'GenerateImages';
  readonly jobState = JobState.GeneratingImages;

  async execute(context: PipelineContext): Promise<StageResult> {
    const log = createLogger(context.correlationId, context.jobId);
    log.info('GenerateImages stage started');

    try {
      await updateJobState(context.jobId, this.jobState);

      const brief = context.workingData.creativeBrief as CreativeBrief | undefined;
      if (!brief) {
        throw new Error('Creative Brief not found in working data');
      }

      // 1. Generate ImageConcept objects via GenAI SDK
      const prompt = buildImageConceptPrompt(brief);
      const responseText = await generateContent(prompt, getModel('text'));

      let imageConcepts: ImageConcept[];
      try {
        const cleaned = responseText
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();
        const parsed = JSON.parse(cleaned);
        const conceptsArray = Array.isArray(parsed) ? parsed : [parsed];
        imageConcepts = validateImageConcepts(conceptsArray, brief);
      } catch {
        log.warn('Failed to parse GenAI response as JSON, using fallback ImageConcepts');
        imageConcepts = validateImageConcepts([{}, {}, {}], brief);
      }

      // 2. Always persist ImageConcept array as JSON asset
      const projectId = getProjectId(context.workingData);
      const conceptsAssetId = randomUUID();
      const conceptsStoragePath = buildStoragePath(projectId, context.jobId, 'metadata', `image-concept-${conceptsAssetId}.json`);
      const conceptsJson = JSON.stringify(imageConcepts, null, 2);
      await writeAsset(conceptsStoragePath, Buffer.from(conceptsJson, 'utf-8'), 'application/json');

      // 3. Record asset reference for the image concepts (non-renderable metadata type)
      await recordAssetReference(context.jobId, {
        assetId: conceptsAssetId,
        jobId: context.jobId,
        assetType: AssetType.ImageConcept,
        storagePath: conceptsStoragePath,
        generationTimestamp: new Date(),
        status: 'completed',
      });

      const assets: string[] = [conceptsStoragePath];
      const imageAssetPaths: string[] = [];

      // 4. Check if image generation capability is available
      const imageCapability = capabilityRegistry.get('image_generation');
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
                // Detect text-vs-binary: if the data looks like plain text
                // (not base64-encoded binary), record a fallback notice instead
                // of writing a text file masquerading as a PNG.
                if (isLikelyTextNotBinary(assetData)) {
                  log.warn('Image capability returned text instead of binary image data, recording fallback', {
                    conceptName: concept.conceptName,
                  });
                  await recordFallbackNotice(context.jobId, {
                    capability: 'image_generation',
                    reason: `Image capability returned text description instead of binary image data for concept "${concept.conceptName}"`,
                    timestamp: new Date(),
                    stage: this.jobState,
                  });
                  continue;
                }

                const imageAssetId = randomUUID();
                const imageStoragePath = buildStoragePath(projectId, context.jobId, 'images', `image-${imageAssetId}.png`);
                await writeAsset(
                  imageStoragePath,
                  Buffer.from(assetData, 'base64'),
                  'image/png',
                );
                await recordAssetReference(context.jobId, {
                  assetId: imageAssetId,
                  jobId: context.jobId,
                  assetType: AssetType.Image,
                  storagePath: imageStoragePath,
                  generationTimestamp: new Date(),
                  status: 'completed',
                });
                assets.push(imageStoragePath);
                imageAssetPaths.push(imageStoragePath);
              }
            }
          } catch (genErr) {
            log.warn('Image generation failed for concept, continuing', {
              conceptName: concept.conceptName,
              error: String(genErr),
            });
          }
        }
      } else {
        // Image generation unavailable — record fallback notice
        const reason = 'Image generation capability is unavailable — persisted ImageConcept creative direction instead';
        log.warn('Image generation unavailable, recording fallback', { reason });
        await recordFallbackNotice(context.jobId, {
          capability: 'image_generation',
          reason,
          timestamp: new Date(),
          stage: this.jobState,
        });
      }

      // Store in working data for downstream stages
      context.workingData.imageConcepts = imageConcepts;
      context.workingData.imageConceptsAssetPath = conceptsStoragePath;
      context.workingData.imageAssetPaths = imageAssetPaths;

      log.info('GenerateImages stage completed', { conceptCount: imageConcepts.length, assetCount: assets.length });
      return { success: true, assets };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('GenerateImages stage failed', { error: message });
      return { success: false, assets: [], error: message };
    }
  }
}
