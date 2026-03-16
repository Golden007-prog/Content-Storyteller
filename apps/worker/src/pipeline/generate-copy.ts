import {
  PipelineStage,
  PipelineContext,
  StageResult,
  JobState,
  AssetType,
  CreativeBrief,
  CopyPackage,
  Platform,
  Tone,
  getModel,
} from '@content-storyteller/shared';
import { updateJobState, recordAssetReference } from '../services/firestore';
import { generateContent } from '../services/genai';
import { writeAsset } from '../services/storage';
import { createLogger } from '../middleware/logger';
import { randomUUID } from 'crypto';

/**
 * Platform-specific copy instructions for the GenerateCopy prompt.
 */
const PLATFORM_COPY_INSTRUCTIONS: Record<Platform, string> = {
  [Platform.InstagramReel]:
    'Focus on short, punchy reel captions optimized for Instagram. ' +
    'The hook must grab attention in under 2 seconds. ' +
    'Hashtags should be trending and relevant (8-15 tags). ' +
    'Voiceover script should be concise (15 seconds max). ' +
    'On-screen text should be bold, minimal phrases for fast reading. ' +
    'threadCopy should contain 1-2 short companion post captions.',
  [Platform.LinkedInLaunchPost]:
    'Write professional, thought-leadership copy for LinkedIn. ' +
    'The hook should pose a compelling question or bold statement. ' +
    'Caption should be long-form (150-300 words) with clear structure. ' +
    'CTA should drive professional engagement (comments, shares, follows). ' +
    'Hashtags should be industry-specific (3-5 tags). ' +
    'threadCopy should contain the full post body broken into readable paragraphs. ' +
    'Voiceover script should be formal and authoritative. ' +
    'On-screen text should highlight key data points or quotes.',
  [Platform.XTwitterThread]:
    'Write a compelling Twitter/X thread with numbered posts. ' +
    'The hook is the first tweet — it must stand alone and be irresistible. ' +
    'threadCopy is critical: each element is one tweet in the thread (aim for 5-8 tweets). ' +
    'Each tweet should be under 280 characters and end with a hook to the next. ' +
    'Caption should be a summary of the thread topic. ' +
    'Hashtags should be concise (2-4 tags). ' +
    'Voiceover script can be a read-aloud version of the thread. ' +
    'On-screen text should be key quotes from the thread.',
  [Platform.GeneralPromoPackage]:
    'Write versatile marketing copy adaptable across platforms. ' +
    'The hook should work as a headline or subject line. ' +
    'Caption should be medium-length and adaptable. ' +
    'CTA should be clear and action-oriented. ' +
    'Hashtags should be broad and relevant (5-10 tags). ' +
    'threadCopy should contain 2-3 variant copy blocks for different channels. ' +
    'Voiceover script should be 20-30 seconds for video/audio use. ' +
    'On-screen text should be adaptable title cards and key phrases.',
};

/**
 * Tone-specific language direction for copy generation.
 */
const TONE_COPY_DIRECTION: Record<Tone, string> = {
  [Tone.Cinematic]:
    'Use cinematic, dramatic language. Evoke emotion through vivid imagery and storytelling. ' +
    'Bold, sweeping statements. Atmospheric and epic in feel.',
  [Tone.Punchy]:
    'Use punchy, short-form language. High energy, direct, and memorable. ' +
    'Power words, strong verbs, rhythmic cadence. Zero fluff.',
  [Tone.Sleek]:
    'Use sleek, minimal language. Refined and modern with understated confidence. ' +
    'Elegant word choices, clean phrasing, premium feel. Less is more.',
  [Tone.Professional]:
    'Use professional, formal language. Authoritative and trustworthy. ' +
    'Clear, structured communication. Measured language, corporate-appropriate.',
};

/**
 * Build the copy generation prompt with platform-specific and tone-specific instructions.
 */
function buildCopyPrompt(brief: CreativeBrief, platform: Platform, tone: Tone): string {
  const platformInstructions = PLATFORM_COPY_INSTRUCTIONS[platform] || PLATFORM_COPY_INSTRUCTIONS[Platform.GeneralPromoPackage];
  const toneDirection = TONE_COPY_DIRECTION[tone] || TONE_COPY_DIRECTION[Tone.Professional];

  return `You are a world-class marketing copywriter. Generate a complete Copy Package based on the Creative Brief below.

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

## Platform Instructions (${platform})
${platformInstructions}

## Tone Direction (${tone})
${toneDirection}

## Output Format
Return a JSON object with exactly these fields:
- "hook": string — the attention-grabbing opening line or headline
- "caption": string — the main body caption or post text
- "cta": string — a clear call-to-action phrase
- "hashtags": string[] — array of relevant hashtags (without # prefix)
- "threadCopy": string[] — array of copy blocks (thread tweets, post variants, or paragraphs)
- "voiceoverScript": string — a spoken-word script for video/audio voiceover
- "onScreenText": string[] — array of short text items for on-screen display

Return ONLY valid JSON, no markdown fences.`;
}

/**
 * Validate and fill in missing fields on a parsed CopyPackage, using fallback values.
 */
function validateCopyPackage(parsed: Record<string, unknown>, brief: CreativeBrief): CopyPackage {
  return {
    hook: typeof parsed.hook === 'string' && parsed.hook.trim() ? parsed.hook.trim() : `Discover ${brief.keyMessages[0] || 'something amazing'}`,
    caption: typeof parsed.caption === 'string' && parsed.caption.trim() ? parsed.caption.trim() : brief.inputSummary || 'Check out our latest content.',
    cta: typeof parsed.cta === 'string' && parsed.cta.trim() ? parsed.cta.trim() : 'Learn more today',
    hashtags: Array.isArray(parsed.hashtags) && parsed.hashtags.length > 0
      ? parsed.hashtags.map((h: unknown) => String(h).replace(/^#/, ''))
      : ['marketing', 'content'],
    threadCopy: Array.isArray(parsed.threadCopy) && parsed.threadCopy.length > 0
      ? parsed.threadCopy.map((t: unknown) => String(t))
      : [brief.inputSummary || 'Content thread post'],
    voiceoverScript: typeof parsed.voiceoverScript === 'string' && parsed.voiceoverScript.trim()
      ? parsed.voiceoverScript.trim()
      : `Here's what you need to know about ${brief.keyMessages[0] || 'this'}.`,
    onScreenText: Array.isArray(parsed.onScreenText) && parsed.onScreenText.length > 0
      ? parsed.onScreenText.map((t: unknown) => String(t))
      : [brief.keyMessages[0] || 'Key message'],
  };
}

/**
 * GenerateCopy stage: generate a structured CopyPackage from the Creative Brief
 * using the Google GenAI SDK, then persist the copy asset.
 */
export class GenerateCopy implements PipelineStage {
  readonly name = 'GenerateCopy';
  readonly jobState = JobState.GeneratingCopy;

  async execute(context: PipelineContext): Promise<StageResult> {
    const log = createLogger(context.correlationId, context.jobId);
    log.info('GenerateCopy stage started');

    try {
      await updateJobState(context.jobId, this.jobState);

      const brief = context.workingData.creativeBrief as CreativeBrief | undefined;
      if (!brief) {
        throw new Error('Creative Brief not found in working data');
      }

      const platform = (brief.platform as Platform) || Platform.GeneralPromoPackage;
      const tone = (brief.tone as Tone) || Tone.Professional;

      log.info('GenerateCopy inputs', { platform, tone });

      // Build platform-aware, tone-aware copy prompt
      const prompt = buildCopyPrompt(brief, platform, tone);

      // Call GenAI SDK to generate the CopyPackage
      const responseText = await generateContent(prompt, getModel('text'));

      let copyPackage: CopyPackage;
      try {
        // Strip markdown fences if present
        const cleaned = responseText
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();
        const parsed = JSON.parse(cleaned);
        copyPackage = validateCopyPackage(parsed, brief);
      } catch {
        // Fallback when JSON parsing fails
        log.warn('Failed to parse GenAI response as JSON, using fallback CopyPackage');
        copyPackage = validateCopyPackage({}, brief);
      }

      // Persist CopyPackage as JSON asset
      const assetId = randomUUID();
      const storagePath = `${context.jobId}/copy/${assetId}.json`;
      const jsonData = JSON.stringify(copyPackage, null, 2);
      await writeAsset(storagePath, Buffer.from(jsonData, 'utf-8'), 'application/json');

      // Record asset reference with type 'copy'
      await recordAssetReference(context.jobId, {
        assetId,
        jobId: context.jobId,
        assetType: AssetType.Copy,
        storagePath,
        generationTimestamp: new Date(),
        status: 'completed',
      });

      // Store in working data for downstream stages
      context.workingData.copyAssetPath = storagePath;
      context.workingData.copyPackage = copyPackage;

      log.info('GenerateCopy stage completed', { assetId, platform, tone });
      return { success: true, assets: [storagePath] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('GenerateCopy stage failed', { error: message });
      return { success: false, assets: [], error: message };
    }
  }
}
