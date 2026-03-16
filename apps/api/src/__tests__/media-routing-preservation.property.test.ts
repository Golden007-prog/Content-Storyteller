/**
 * Preservation Property Tests — Property 2a: Auto Preference Resolution
 *
 * For all Platform × Tone × promptText combinations with outputPreference=Auto
 * or undefined, verify resolveOutputIntent produces identical OutputIntent
 * before and after fix.
 *
 * These tests encode EXISTING correct behavior that must be preserved
 * after the bugfix. They MUST PASS on unfixed code.
 *
 * **Validates: Requirements 3.2, 3.3**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Platform, Tone, OutputPreference } from '@content-storyteller/shared';
import { resolveOutputIntent } from '../services/planner/output-intent';
import type { PlannerInput } from '../services/planner/output-intent';

// ── Arbitraries ─────────────────────────────────────────────────────

const arbPlatform = fc.constantFrom(...Object.values(Platform));
const arbTone = fc.constantFrom(...Object.values(Tone));

/**
 * All keyword phrases recognized by the unfixed resolveOutputIntent.
 * We filter these out to test pure platform-default behavior.
 */
const ALL_KEYWORDS = [
  'video', 'reel', 'teaser', 'promo clip', 'short video', 'cinematic video',
  'video ad', 'video clip',
  'image', 'photo', 'picture', 'visual', 'hero image', 'create an image',
  'generate a visual', 'make a graphic', 'create a post image', 'include a visual',
  'design a visual',
  'copy only', 'text only',
  'complete package', 'full package',
  'gif', 'looping animation', 'animated explainer', 'linkedin gif',
  'motion graphic', 'animated workflow', 'animate this', 'create a gif',
  'make a gif', 'animated gif',
  'carousel',
];

/** Prompt that does NOT contain any keyword phrases */
const arbNeutralPrompt = fc
  .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuwxyz '.split('')), {
    minLength: 5,
    maxLength: 80,
  })
  .filter((s) => {
    const lower = s.toLowerCase();
    return !ALL_KEYWORDS.some((kw) => lower.includes(kw));
  });

const arbMediaPaths = fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
  minLength: 0,
  maxLength: 2,
});

// ── Snapshot of expected platform defaults (observed on unfixed code) ──

/**
 * These are the OBSERVED platform defaults when outputPreference=Auto
 * and no keyword phrases are present. Captured from the unfixed code.
 */
const PLATFORM_DEFAULTS: Record<string, Partial<import('@content-storyteller/shared').OutputIntent>> = {
  [Platform.InstagramReel]: {
    wantsCopy: true,
    wantsVideo: true,
    wantsImage: true,
    wantsStoryboard: true,
    wantsVoiceover: true,
    wantsHashtags: false,
    wantsCarousel: false,
    wantsThread: false,
    wantsLinkedInPost: false,
    wantsGif: false,
  },
  [Platform.LinkedInLaunchPost]: {
    wantsCopy: true,
    wantsLinkedInPost: true,
    wantsHashtags: true,
    wantsVideo: false,
    wantsImage: false,
    wantsStoryboard: false,
    wantsVoiceover: false,
    wantsCarousel: false,
    wantsThread: false,
    wantsGif: false,
  },
  [Platform.XTwitterThread]: {
    wantsCopy: true,
    wantsThread: true,
    wantsHashtags: true,
    wantsVideo: false,
    wantsImage: false,
    wantsStoryboard: false,
    wantsVoiceover: false,
    wantsCarousel: false,
    wantsLinkedInPost: false,
    wantsGif: false,
  },
  [Platform.GeneralPromoPackage]: {
    wantsCopy: true,
    wantsImage: true,
    wantsVideo: true,
    wantsStoryboard: true,
    wantsVoiceover: true,
    wantsHashtags: true,
    wantsCarousel: false,
    wantsThread: false,
    wantsLinkedInPost: false,
    wantsGif: false,
  },
};

// ── Property 2a: Auto Preference Preservation ───────────────────────

describe('Property 2a: Auto Preference Resolution Preservation', () => {
  it('for Auto preference with neutral prompts, resolveOutputIntent matches platform defaults', () => {
    fc.assert(
      fc.property(
        arbNeutralPrompt,
        arbPlatform,
        arbTone,
        arbMediaPaths,
        (prompt, platform, tone, media) => {
          const input: PlannerInput = {
            promptText: prompt,
            platform,
            tone,
            uploadedMediaPaths: media,
            outputPreference: OutputPreference.Auto,
          };

          const intent = resolveOutputIntent(input);
          const expected = PLATFORM_DEFAULTS[platform];

          // Verify each flag matches the observed platform default
          expect(intent.wantsCopy).toBe(expected.wantsCopy);
          expect(intent.wantsVideo).toBe(expected.wantsVideo);
          expect(intent.wantsImage).toBe(expected.wantsImage);
          expect(intent.wantsStoryboard).toBe(expected.wantsStoryboard);
          expect(intent.wantsVoiceover).toBe(expected.wantsVoiceover);
          expect(intent.wantsHashtags).toBe(expected.wantsHashtags);
          expect(intent.wantsCarousel).toBe(expected.wantsCarousel);
          expect(intent.wantsThread).toBe(expected.wantsThread);
          expect(intent.wantsLinkedInPost).toBe(expected.wantsLinkedInPost);
          expect(intent.wantsGif).toBe(expected.wantsGif);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('for undefined preference with neutral prompts, resolveOutputIntent matches platform defaults identically', () => {
    fc.assert(
      fc.property(
        arbNeutralPrompt,
        arbPlatform,
        arbTone,
        arbMediaPaths,
        (prompt, platform, tone, media) => {
          const input: PlannerInput = {
            promptText: prompt,
            platform,
            tone,
            uploadedMediaPaths: media,
            outputPreference: undefined,
          };

          const intent = resolveOutputIntent(input);
          const expected = PLATFORM_DEFAULTS[platform];

          expect(intent.wantsCopy).toBe(expected.wantsCopy);
          expect(intent.wantsVideo).toBe(expected.wantsVideo);
          expect(intent.wantsImage).toBe(expected.wantsImage);
          expect(intent.wantsStoryboard).toBe(expected.wantsStoryboard);
          expect(intent.wantsVoiceover).toBe(expected.wantsVoiceover);
          expect(intent.wantsHashtags).toBe(expected.wantsHashtags);
          expect(intent.wantsCarousel).toBe(expected.wantsCarousel);
          expect(intent.wantsThread).toBe(expected.wantsThread);
          expect(intent.wantsLinkedInPost).toBe(expected.wantsLinkedInPost);
          expect(intent.wantsGif).toBe(expected.wantsGif);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Auto and undefined produce identical OutputIntent for any neutral prompt', () => {
    fc.assert(
      fc.property(
        arbNeutralPrompt,
        arbPlatform,
        arbTone,
        arbMediaPaths,
        (prompt, platform, tone, media) => {
          const autoIntent = resolveOutputIntent({
            promptText: prompt,
            platform,
            tone,
            uploadedMediaPaths: media,
            outputPreference: OutputPreference.Auto,
          });

          const undefinedIntent = resolveOutputIntent({
            promptText: prompt,
            platform,
            tone,
            uploadedMediaPaths: media,
            outputPreference: undefined,
          });

          expect(autoIntent).toEqual(undefinedIntent);
        },
      ),
      { numRuns: 100 },
    );
  });
});
