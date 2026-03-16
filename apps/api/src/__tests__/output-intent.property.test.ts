/**
 * Property-based tests for the Planner module (resolveOutputIntent).
 *
 * Feature: smart-pipeline-orchestration
 *
 * Uses fast-check to verify universal properties across randomly generated PlannerInput values.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { Platform, Tone, OutputPreference } from '@content-storyteller/shared';
import { resolveOutputIntent, PlannerInput } from '../services/planner/output-intent';

// ── Video keywords that trigger wantsVideo ──────────────────────────
const VIDEO_KEYWORDS = ['video', 'reel', 'teaser', 'promo clip'];

// ── Arbitraries ─────────────────────────────────────────────────────

const arbPlatform = fc.constantFrom(...Object.values(Platform));
const arbTone = fc.constantFrom(...Object.values(Tone));
const arbOutputPreference = fc.constantFrom(...Object.values(OutputPreference));
const arbExplicitPreference = fc.constantFrom(
  OutputPreference.CopyOnly,
  OutputPreference.CopyImage,
  OutputPreference.CopyVideo,
  OutputPreference.FullPackage,
);

/** Prompt text that does NOT contain any video/image/copy-only/full-package keywords */
const arbNeutralPrompt = fc
  .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz '.split('')), {
    minLength: 1,
    maxLength: 200,
  })
  .filter((s) => {
    const lower = s.toLowerCase();
    return (
      !VIDEO_KEYWORDS.some((kw) => new RegExp(`\\b${kw}\\b`).test(lower)) &&
      !/\b(image|photo|picture|visual|hero image)\b/.test(lower) &&
      !/\b(copy only|text only)\b/.test(lower) &&
      !/\b(complete package|full package)\b/.test(lower) &&
      !/\bcarousel\b/.test(lower)
    );
  });

/** Prompt text that does NOT contain video keywords */
const arbNonVideoPrompt = fc
  .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz '.split('')), {
    minLength: 1,
    maxLength: 200,
  })
  .filter((s) => {
    const lower = s.toLowerCase();
    return !VIDEO_KEYWORDS.some((kw) => new RegExp(`\\b${kw}\\b`).test(lower));
  });

/** Any prompt text (may contain keywords) */
const arbAnyPrompt = fc.string({ minLength: 1, maxLength: 300 });

const arbMediaPaths = fc.array(fc.string({ minLength: 1, maxLength: 50 }), {
  minLength: 0,
  maxLength: 3,
});

/** Full PlannerInput with any values */
const arbPlannerInput: fc.Arbitrary<PlannerInput> = fc.record({
  promptText: arbAnyPrompt,
  platform: arbPlatform,
  tone: arbTone,
  uploadedMediaPaths: arbMediaPaths,
  outputPreference: fc.option(arbOutputPreference, { nil: undefined }),
  trendContext: fc.option(
    fc.record({
      desiredOutputType: fc.option(
        fc.constantFrom('video', 'reel', 'image', 'copy', 'text', 'full', 'package'),
        { nil: undefined },
      ),
    }),
    { nil: undefined },
  ),
});

// ── Platform default expectations ───────────────────────────────────

const PLATFORM_DEFAULTS: Record<
  Platform,
  { wantsVideo: boolean; wantsImage: boolean; wantsThread: boolean; wantsLinkedInPost: boolean }
> = {
  [Platform.InstagramReel]: { wantsVideo: true, wantsImage: true, wantsThread: false, wantsLinkedInPost: false },
  [Platform.LinkedInLaunchPost]: { wantsVideo: false, wantsImage: false, wantsThread: false, wantsLinkedInPost: true },
  [Platform.XTwitterThread]: { wantsVideo: false, wantsImage: false, wantsThread: true, wantsLinkedInPost: false },
  [Platform.GeneralPromoPackage]: { wantsVideo: true, wantsImage: true, wantsThread: false, wantsLinkedInPost: false },
};

// ── Test suite ──────────────────────────────────────────────────────

describe('Output Intent Planner Property Tests', () => {

  // ── Property 1 ──────────────────────────────────────────────────────
  /**
   * Feature: smart-pipeline-orchestration, Property 1: Planner wantsCopy invariant
   *
   * For any valid PlannerInput (any prompt text, any platform, any tone,
   * any outputPreference, any uploaded media paths, any trend context),
   * the resulting OutputIntent SHALL have wantsCopy === true.
   *
   * **Validates: Requirements 9.8, 4.6**
   */
  describe('Property 1: Planner wantsCopy invariant', () => {
    it('wantsCopy is always true for any valid PlannerInput', () => {
      fc.assert(
        fc.property(arbPlannerInput, (input) => {
          const intent = resolveOutputIntent(input);
          expect(intent.wantsCopy).toBe(true);
        }),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 2 ──────────────────────────────────────────────────────
  /**
   * Feature: smart-pipeline-orchestration, Property 2: Planner platform defaults
   *
   * For any platform value and any prompt text that does not contain explicit
   * visual/video keywords, when outputPreference is auto, the Planner SHALL
   * produce an OutputIntent matching the platform default table.
   *
   * **Validates: Requirements 3.9, 3.10, 3.11, 9.7**
   */
  describe('Property 2: Planner platform defaults', () => {
    it('non-keyword prompts with auto preference match platform default table', () => {
      fc.assert(
        fc.property(arbPlatform, arbNeutralPrompt, arbTone, arbMediaPaths, (platform, prompt, tone, media) => {
          const input: PlannerInput = {
            promptText: prompt,
            platform,
            tone,
            uploadedMediaPaths: media,
            outputPreference: OutputPreference.Auto,
          };
          const intent = resolveOutputIntent(input);
          const expected = PLATFORM_DEFAULTS[platform];

          expect(intent.wantsVideo).toBe(expected.wantsVideo);
          expect(intent.wantsImage).toBe(expected.wantsImage);
          expect(intent.wantsThread).toBe(expected.wantsThread);
          expect(intent.wantsLinkedInPost).toBe(expected.wantsLinkedInPost);
        }),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 3 ──────────────────────────────────────────────────────
  /**
   * Feature: smart-pipeline-orchestration, Property 3: Explicit outputPreference overrides inference
   *
   * For any prompt text (including prompts with video/image keywords), when an
   * explicit outputPreference other than auto is provided, the Planner SHALL
   * produce an OutputIntent that matches the explicit preference mapping
   * regardless of prompt content.
   *
   * **Validates: Requirements 3.13, 5.5**
   */
  describe('Property 3: Explicit outputPreference overrides inference', () => {
    it('explicit preference always wins over prompt keywords', () => {
      fc.assert(
        fc.property(
          arbAnyPrompt,
          arbPlatform,
          arbTone,
          arbMediaPaths,
          arbExplicitPreference,
          (prompt, platform, tone, media, pref) => {
            const input: PlannerInput = {
              promptText: prompt,
              platform,
              tone,
              uploadedMediaPaths: media,
              outputPreference: pref,
            };
            const intent = resolveOutputIntent(input);

            switch (pref) {
              case OutputPreference.CopyOnly:
                expect(intent.wantsImage).toBe(false);
                expect(intent.wantsVideo).toBe(false);
                break;
              case OutputPreference.CopyImage:
                expect(intent.wantsImage).toBe(true);
                expect(intent.wantsVideo).toBe(false);
                break;
              case OutputPreference.CopyVideo:
                expect(intent.wantsVideo).toBe(true);
                expect(intent.wantsImage).toBe(false);
                break;
              case OutputPreference.FullPackage:
                expect(intent.wantsImage).toBe(true);
                expect(intent.wantsVideo).toBe(true);
                break;
            }
            // wantsCopy is always true regardless
            expect(intent.wantsCopy).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 5 ──────────────────────────────────────────────────────
  /**
   * Feature: smart-pipeline-orchestration, Property 5: Prompt keyword detection for video
   *
   * For any prompt text that does NOT contain the words "video", "reel",
   * "teaser", or "promo clip" (case-insensitive), and when the platform does
   * not default to video (i.e., not instagram_reel or general_promo_package)
   * and outputPreference is auto, the Planner SHALL produce an OutputIntent
   * with wantsVideo === false.
   *
   * **Validates: Requirements 3.4**
   */
  describe('Property 5: Prompt keyword detection for video', () => {
    it('no video keywords + non-video platform + auto → wantsVideo false', () => {
      const nonVideoPlatform = fc.constantFrom(Platform.LinkedInLaunchPost, Platform.XTwitterThread);

      fc.assert(
        fc.property(arbNonVideoPrompt, nonVideoPlatform, arbTone, arbMediaPaths, (prompt, platform, tone, media) => {
          const input: PlannerInput = {
            promptText: prompt,
            platform,
            tone,
            uploadedMediaPaths: media,
            outputPreference: OutputPreference.Auto,
          };
          const intent = resolveOutputIntent(input);
          expect(intent.wantsVideo).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 6 ──────────────────────────────────────────────────────
  /**
   * Feature: smart-pipeline-orchestration, Property 6: Backward compatibility without outputPreference
   *
   * For any valid PlannerInput where outputPreference is undefined or auto,
   * the Planner SHALL still produce a valid OutputIntent with all required
   * fields and wantsCopy === true.
   *
   * **Validates: Requirements 5.6**
   */
  describe('Property 6: Backward compatibility without outputPreference', () => {
    it('undefined/auto preference still produces valid intent', () => {
      const arbBackwardCompatPref = fc.constantFrom(undefined, OutputPreference.Auto);

      fc.assert(
        fc.property(
          arbAnyPrompt,
          arbPlatform,
          arbTone,
          arbMediaPaths,
          arbBackwardCompatPref,
          (prompt, platform, tone, media, pref) => {
            const input: PlannerInput = {
              promptText: prompt,
              platform,
              tone,
              uploadedMediaPaths: media,
              outputPreference: pref,
            };
            const intent = resolveOutputIntent(input);

            // All required boolean fields must be present and be booleans
            expect(typeof intent.wantsCopy).toBe('boolean');
            expect(typeof intent.wantsHashtags).toBe('boolean');
            expect(typeof intent.wantsImage).toBe('boolean');
            expect(typeof intent.wantsVideo).toBe('boolean');
            expect(typeof intent.wantsStoryboard).toBe('boolean');
            expect(typeof intent.wantsVoiceover).toBe('boolean');
            expect(typeof intent.wantsCarousel).toBe('boolean');
            expect(typeof intent.wantsThread).toBe('boolean');
            expect(typeof intent.wantsLinkedInPost).toBe('boolean');

            // wantsCopy invariant
            expect(intent.wantsCopy).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 19 ─────────────────────────────────────────────────────
  /**
   * Feature: smart-pipeline-orchestration, Property 19: Trend context respected by planner
   *
   * For any PlannerInput where trendContext.desiredOutputType is set, the
   * Planner SHALL produce an OutputIntent that reflects the desired output
   * type from the trend context, overriding platform defaults.
   *
   * **Validates: Requirements 3.12**
   */
  describe('Property 19: Trend context respected by planner', () => {
    it('trendContext.desiredOutputType overrides platform defaults', () => {
      fc.assert(
        fc.property(
          arbNeutralPrompt,
          arbPlatform,
          arbTone,
          arbMediaPaths,
          fc.constantFrom('video', 'reel', 'image', 'copy', 'text', 'full', 'package'),
          (prompt, platform, tone, media, desiredOutputType) => {
            const input: PlannerInput = {
              promptText: prompt,
              platform,
              tone,
              uploadedMediaPaths: media,
              outputPreference: OutputPreference.Auto,
              trendContext: { desiredOutputType },
            };
            const intent = resolveOutputIntent(input);

            const outputLower = desiredOutputType.toLowerCase();

            if (outputLower === 'video' || outputLower === 'reel') {
              expect(intent.wantsVideo).toBe(true);
              expect(intent.wantsStoryboard).toBe(true);
              expect(intent.wantsVoiceover).toBe(true);
            } else if (outputLower === 'image') {
              expect(intent.wantsImage).toBe(true);
            } else if (outputLower === 'copy' || outputLower === 'text') {
              // Copy-only: image and video stay false
              expect(intent.wantsImage).toBe(false);
              expect(intent.wantsVideo).toBe(false);
            } else if (outputLower === 'full' || outputLower === 'package') {
              expect(intent.wantsImage).toBe(true);
              expect(intent.wantsVideo).toBe(true);
            }

            // wantsCopy invariant always holds
            expect(intent.wantsCopy).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
