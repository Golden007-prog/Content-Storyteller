import {
  PipelineStage,
  PipelineContext,
  StageResult,
  JobState,
  CreativeBrief,
  Platform,
  Tone,
  getModel,
} from '@content-storyteller/shared';
import { getJob, updateJobState } from '../services/firestore';
import { generateContent } from '../services/genai';
import { createLogger } from '../middleware/logger';

/**
 * Platform-specific structure guidance for the Creative Director prompt.
 */
const PLATFORM_GUIDANCE: Record<Platform, string> = {
  [Platform.InstagramReel]:
    '15-second vertical reel format. Hook-first pacing — grab attention in the first 2 seconds. ' +
    'Visual-heavy with bold text overlays, fast cuts, and trending audio cues. ' +
    'Optimized for mobile-first vertical (9:16) consumption.',
  [Platform.LinkedInLaunchPost]:
    'Professional long-form format. Thought-leadership angle with data-driven insights. ' +
    'Structured for readability: strong opening hook, supporting points, clear CTA. ' +
    'Tone should convey authority and credibility for a B2B audience.',
  [Platform.XTwitterThread]:
    'Thread format with numbered posts (1/N). Punchy hooks on each post to maintain scroll-through. ' +
    'Concise, high-impact sentences. Use line breaks for readability. ' +
    'First tweet must stand alone as a compelling hook.',
  [Platform.GeneralPromoPackage]:
    'Versatile multi-format package suitable for cross-platform use. ' +
    'Balanced pacing that works across social, email, and web. ' +
    'Adaptable visual direction that scales from square to landscape to vertical.',
};

/**
 * Tone-specific creative direction for the prompt.
 */
const TONE_DIRECTION: Record<Tone, string> = {
  [Tone.Cinematic]:
    'Cinematic tone — sweeping, dramatic language. Evoke emotion through vivid imagery and storytelling. ' +
    'Think movie trailer energy: bold statements, atmospheric visuals, epic pacing.',
  [Tone.Punchy]:
    'Punchy tone — short, impactful sentences. High energy, direct, and memorable. ' +
    'Use power words, strong verbs, and rhythmic cadence. No fluff.',
  [Tone.Sleek]:
    'Sleek tone — minimal, refined, and modern. Clean aesthetic with understated confidence. ' +
    'Less is more. Elegant word choices, whitespace-friendly layouts, premium feel.',
  [Tone.Professional]:
    'Professional tone — formal, authoritative, and trustworthy. ' +
    'Clear and structured communication. Data-backed claims, measured language, corporate-appropriate.',
};

/**
 * Build the Creative Director prompt that produces a platform-aware,
 * tone-aware Creative Brief with campaign angle, pacing, and visual style.
 */
function buildCreativeDirectorPrompt(
  promptText: string,
  platform: Platform,
  tone: Tone,
): string {
  const platformGuide = PLATFORM_GUIDANCE[platform] || PLATFORM_GUIDANCE[Platform.GeneralPromoPackage];
  const toneGuide = TONE_DIRECTION[tone] || TONE_DIRECTION[Tone.Professional];

  return `You are a Creative Director AI. Analyze the following brief and produce a comprehensive Creative Brief for marketing content generation.

## User Brief
${promptText}

## Platform Direction
Target platform: ${platform}
${platformGuide}

## Tone Direction
Selected tone: ${tone}
${toneGuide}

## Output Instructions
Return a JSON object with these fields:
- targetAudience: string describing the ideal audience for this content
- tone: string describing the creative tone to apply (should reflect "${tone}")
- keyMessages: array of 3-5 key marketing messages (strings)
- visualDirection: string describing the overall visual style direction
- brandGuidelines: optional string with brand guidelines if detectable from the brief
- inputSummary: string summarizing the user's brief and creative intent
- platform: "${platform}" (echo back the selected platform)
- campaignAngle: string describing the unique campaign angle or creative hook that ties the content together
- pacing: string describing the content pacing strategy tailored to the platform
- visualStyle: string describing the specific visual style (colors, typography, imagery approach)

Return ONLY valid JSON, no markdown fences.`;
}

/**
 * ProcessInput stage: Creative Director Agent that produces a platform-aware,
 * tone-aware Creative Brief using the Google GenAI SDK.
 */
export class ProcessInput implements PipelineStage {
  readonly name = 'ProcessInput';
  readonly jobState = JobState.ProcessingInput;

  async execute(context: PipelineContext): Promise<StageResult> {
    const log = createLogger(context.correlationId, context.jobId);
    log.info('ProcessInput stage started');

    try {
      await updateJobState(context.jobId, this.jobState);

      // Read promptText, platform, tone from the Job document
      const job = await getJob(context.jobId);
      const promptText = job?.promptText || 'Create a marketing content package';
      const platform = job?.platform || Platform.GeneralPromoPackage;
      const tone = job?.tone || Tone.Professional;

      log.info('Creative Director inputs', { platform, tone, promptLength: promptText.length });

      // Build the Creative Director prompt with platform and tone guidance
      const prompt = buildCreativeDirectorPrompt(promptText, platform, tone);

      // Call GenAI SDK to generate the Creative Brief
      const responseText = await generateContent(prompt, getModel('text'));

      let creativeBrief: CreativeBrief;
      try {
        // Strip markdown fences if present
        const cleaned = responseText
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();
        const parsed = JSON.parse(cleaned);

        creativeBrief = {
          targetAudience: parsed.targetAudience || 'General audience',
          tone: parsed.tone || tone,
          keyMessages: Array.isArray(parsed.keyMessages) ? parsed.keyMessages : ['Key message from brief'],
          visualDirection: parsed.visualDirection || 'Modern and clean',
          brandGuidelines: parsed.brandGuidelines,
          inputSummary: parsed.inputSummary || `Creative brief for: ${promptText.slice(0, 100)}`,
          platform: platform,
          campaignAngle: parsed.campaignAngle || 'Engaging content campaign',
          pacing: parsed.pacing || 'Balanced pacing',
          visualStyle: parsed.visualStyle || 'Modern, clean aesthetic',
        };
      } catch {
        // Fallback when JSON parsing fails
        log.warn('Failed to parse GenAI response as JSON, using fallback brief');
        creativeBrief = {
          targetAudience: 'General audience',
          tone: tone,
          keyMessages: ['Key message from brief'],
          visualDirection: 'Modern and clean',
          inputSummary: `Creative brief for: ${promptText.slice(0, 100)}`,
          platform: platform,
          campaignAngle: 'Engaging content campaign',
          pacing: 'Balanced pacing',
          visualStyle: 'Modern, clean aesthetic',
        };
      }

      // Store creative brief in working data for subsequent stages
      context.workingData.creativeBrief = creativeBrief;

      // Persist creative brief on the Job document
      await updateJobState(context.jobId, this.jobState, { creativeBrief });

      log.info('ProcessInput stage completed — Creative Brief generated', {
        platform,
        tone,
        campaignAngle: creativeBrief.campaignAngle,
      });

      return { success: true, assets: [] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('ProcessInput stage failed', { error: message });
      return { success: false, assets: [], error: message };
    }
  }
}
