/**
 * Bug Condition Exploration Property Tests — API (Test 1d PBT)
 *
 * Property-based test for Defect 4: prompt inference regex too narrow.
 * Generates random prompts containing phrases from the expanded set and
 * verifies resolveOutputIntent sets the correct media intent flags.
 *
 * These tests are EXPECTED TO FAIL on unfixed code.
 *
 * Validates: Requirements 2.4
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Platform, Tone, OutputPreference } from '@content-storyteller/shared';
import { resolveOutputIntent } from '../services/planner/output-intent';
import type { PlannerInput } from '../services/planner/output-intent';

const baseInput: Omit<PlannerInput, 'promptText'> = {
  platform: Platform.LinkedInLaunchPost,
  tone: Tone.Professional,
  uploadedMediaPaths: [],
  outputPreference: OutputPreference.Auto,
};

/**
 * Property: For any prompt containing an expanded image phrase,
 * resolveOutputIntent should set wantsImage=true.
 *
 * **Validates: Requirements 2.4**
 */
describe('Property: Expanded prompt phrases set correct intent flags', () => {
  const IMAGE_PHRASES = [
    'create an image',
    'generate a visual',
    'make a graphic',
    'create a post image',
    'include a visual',
  ];

  const VIDEO_PHRASES = [
    'short video',
    'cinematic video',
  ];

  const GIF_PHRASES = [
    'animated explainer',
    'looping animation',
    'animate this',
  ];

  // Generator for random context around a phrase
  const surroundingText = fc.array(
    fc.constantFrom(
      'for my product launch',
      'for the campaign',
      'for our social media',
      'for LinkedIn',
      'for the presentation',
      'for the brand',
      'for the marketing materials',
      'that showcases our product',
      'to promote the event',
      'about our new feature',
      'highlighting the benefits',
      'with modern styling',
      'in a professional tone',
      'please',
      'I need',
      'can you',
      'help me',
    ),
    { minLength: 0, maxLength: 3 },
  );

  it('prompts with image phrases set wantsImage=true', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...IMAGE_PHRASES),
        surroundingText,
        fc.boolean(),
        (phrase, context, prefixPhrase) => {
          const prompt = prefixPhrase
            ? `${context.slice(0, 1).join(' ')} ${phrase} ${context.slice(1).join(' ')}`.trim()
            : `${phrase} ${context.join(' ')}`.trim();

          const intent = resolveOutputIntent({
            ...baseInput,
            promptText: prompt,
          });

          // EXPECTED: wantsImage should be true for any prompt containing these phrases
          // WILL FAIL for phrases like "make a graphic" which aren't in the current regex
          expect(intent.wantsImage).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('prompts with video phrases set wantsVideo=true', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VIDEO_PHRASES),
        surroundingText,
        (phrase, context) => {
          const prompt = `${phrase} ${context.join(' ')}`.trim();

          const intent = resolveOutputIntent({
            ...baseInput,
            promptText: prompt,
          });

          // EXPECTED: wantsVideo should be true
          // Current regex already matches "video" as a word, so "short video"
          // and "cinematic video" should match. These may pass on current code.
          expect(intent.wantsVideo).toBe(true);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('prompts with gif/animation phrases set wantsGif=true', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...GIF_PHRASES),
        surroundingText,
        (phrase, context) => {
          const prompt = `${phrase} ${context.join(' ')}`.trim();

          const intent = resolveOutputIntent({
            ...baseInput,
            promptText: prompt,
          });

          // EXPECTED: wantsGif should be true
          // WILL FAIL for "animate this" which is NOT in the current GIF regex
          // "animated explainer" and "looping animation" ARE in the current regex
          expect(intent.wantsGif).toBe(true);
        },
      ),
      { numRuns: 30 },
    );
  });
});
