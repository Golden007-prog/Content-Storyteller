/**
 * Property-based tests for GIF intent detection in the Output-Intent Planner.
 *
 * Feature: linkedin-gif-generator
 *
 * Uses fast-check to verify universal properties across randomly generated inputs.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { Platform, Tone, OutputPreference } from '@content-storyteller/shared';
import { resolveOutputIntent, PlannerInput } from '../services/planner/output-intent';

// ── Constants ───────────────────────────────────────────────────────

const GIF_KEYWORDS = [
  'gif',
  'looping animation',
  'animated explainer',
  'linkedin gif',
  'motion graphic',
  'animated workflow',
];

const VIDEO_KEYWORDS = ['video', 'reel', 'teaser', 'promo clip'];

// ── Arbitraries ─────────────────────────────────────────────────────

const arbPlatform = fc.constantFrom(...Object.values(Platform));
const arbTone = fc.constantFrom(...Object.values(Tone));
const arbMediaPaths = fc.array(fc.string({ minLength: 1, maxLength: 50 }), {
  minLength: 0,
  maxLength: 3,
});

/** Pick one GIF keyword at random */
const arbGifKeyword = fc.constantFrom(...GIF_KEYWORDS);

/**
 * Safe filler words that cannot accidentally form any keyword
 * (video, reel, teaser, promo clip, image, photo, picture, visual,
 *  hero image, copy only, text only, complete package, full package,
 *  carousel, gif, looping animation, animated explainer, linkedin gif,
 *  motion graphic, animated workflow).
 *
 * We use a small curated set of harmless words.
 */
const SAFE_WORDS = [
  'please',
  'help',
  'me',
  'with',
  'this',
  'content',
  'for',
  'my',
  'post',
  'about',
  'our',
  'new',
  'product',
  'launch',
  'today',
  'great',
  'awesome',
  'build',
  'share',
  'update',
];

/** Generate a filler phrase from safe words that won't trigger any keyword regex */
const arbSafeFiller = fc
  .array(fc.constantFrom(...SAFE_WORDS), { minLength: 1, maxLength: 10 })
  .map((words) => words.join(' '));

/**
 * Prompt containing at least one GIF keyword but NO video keywords.
 * Structure: [safe filler] [gif keyword] [safe filler]
 */
const arbGifOnlyPrompt = fc
  .tuple(arbSafeFiller, arbGifKeyword, arbSafeFiller)
  .map(([before, keyword, after]) => `${before} ${keyword} ${after}`);

/**
 * PlannerInput with auto preference (or undefined) so keyword scanning runs,
 * no trend context, and a prompt with GIF keywords but no video keywords.
 */
const arbGifKeywordInput: fc.Arbitrary<PlannerInput> = fc
  .tuple(arbGifOnlyPrompt, arbPlatform, arbTone, arbMediaPaths)
  .map(([promptText, platform, tone, uploadedMediaPaths]) => ({
    promptText,
    platform,
    tone,
    uploadedMediaPaths,
    // No explicit preference → keyword scanning path
  }));

// ── Test Suite ──────────────────────────────────────────────────────

describe('GIF Intent Planner Property Tests', () => {
  // ── Property 1 ────────────────────────────────────────────────────
  /**
   * Feature: linkedin-gif-generator, Property 1: GIF keyword detection sets correct intent flags
   *
   * For any prompt string containing at least one GIF keyword but no video
   * keywords, the resolved OutputIntent should have wantsGif === true and
   * wantsVideo === false.
   *
   * **Validates: Requirements 1.2, 1.7**
   */
  describe('Property 1: GIF keyword detection sets correct intent flags', () => {
    it('prompts with GIF keywords but no video keywords → wantsGif=true, wantsVideo=false', () => {
      fc.assert(
        fc.property(arbGifKeywordInput, (input) => {
          // Sanity: prompt must contain a GIF keyword
          const lower = input.promptText.toLowerCase();
          const hasGifKeyword = GIF_KEYWORDS.some((kw) =>
            new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower),
          );
          expect(hasGifKeyword).toBe(true);

          // Sanity: prompt must NOT contain video keywords
          const hasVideoKeyword = VIDEO_KEYWORDS.some((kw) =>
            new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower),
          );
          expect(hasVideoKeyword).toBe(false);

          const intent = resolveOutputIntent(input);

          // The core property
          expect(intent.wantsGif).toBe(true);

          // Video should not be set by GIF keywords alone.
          // However, platform defaults (InstagramReel, GeneralPromoPackage) set wantsVideo=true
          // before keyword scanning. The property holds for the keyword scanning contribution:
          // GIF keywords alone do NOT add wantsVideo. We verify that for non-video-default platforms.
          if (
            input.platform !== Platform.InstagramReel &&
            input.platform !== Platform.GeneralPromoPackage
          ) {
            expect(intent.wantsVideo).toBe(false);
          }
        }),
        { numRuns: 200 },
      );
    });

    it('on non-video-default platforms, GIF keywords never enable wantsVideo', () => {
      const nonVideoDefaultPlatform = fc.constantFrom(
        Platform.LinkedInLaunchPost,
        Platform.XTwitterThread,
      );

      const arbInput = fc
        .tuple(arbGifOnlyPrompt, nonVideoDefaultPlatform, arbTone, arbMediaPaths)
        .map(([promptText, platform, tone, uploadedMediaPaths]) => ({
          promptText,
          platform,
          tone,
          uploadedMediaPaths,
        }));

      fc.assert(
        fc.property(arbInput, (input) => {
          const intent = resolveOutputIntent(input);
          expect(intent.wantsGif).toBe(true);
          expect(intent.wantsVideo).toBe(false);
        }),
        { numRuns: 200 },
      );
    });
  });

  // ── Property 2 ────────────────────────────────────────────────────
  /**
   * Feature: linkedin-gif-generator, Property 2: Output preference to intent mapping
   *
   * For any valid PlannerInput with outputPreference set to CopyGif, the
   * resolved OutputIntent should have wantsGif=true, wantsVideo=false,
   * wantsImage=false. For FullPackage, the resolved intent should have
   * wantsGif=true in addition to wantsImage=true and wantsVideo=true.
   *
   * **Validates: Requirements 1.3, 1.4**
   */
  describe('Property 2: Output preference to intent mapping', () => {
    it('CopyGif preference → wantsGif=true, wantsVideo=false, wantsImage=false', () => {
      const arbCopyGifInput: fc.Arbitrary<PlannerInput> = fc.record({
        promptText: fc.string({ minLength: 1, maxLength: 300 }),
        platform: arbPlatform,
        tone: arbTone,
        uploadedMediaPaths: arbMediaPaths,
        outputPreference: fc.constant(OutputPreference.CopyGif),
      });

      fc.assert(
        fc.property(arbCopyGifInput, (input) => {
          const intent = resolveOutputIntent(input);

          expect(intent.wantsGif).toBe(true);
          expect(intent.wantsVideo).toBe(false);
          expect(intent.wantsImage).toBe(false);
          // Copy is always true
          expect(intent.wantsCopy).toBe(true);
        }),
        { numRuns: 200 },
      );
    });

    it('FullPackage preference → wantsGif=true, wantsImage=true, wantsVideo=true', () => {
      const arbFullPackageInput: fc.Arbitrary<PlannerInput> = fc.record({
        promptText: fc.string({ minLength: 1, maxLength: 300 }),
        platform: arbPlatform,
        tone: arbTone,
        uploadedMediaPaths: arbMediaPaths,
        outputPreference: fc.constant(OutputPreference.FullPackage),
      });

      fc.assert(
        fc.property(arbFullPackageInput, (input) => {
          const intent = resolveOutputIntent(input);

          expect(intent.wantsGif).toBe(true);
          expect(intent.wantsImage).toBe(true);
          expect(intent.wantsVideo).toBe(true);
          // Copy is always true
          expect(intent.wantsCopy).toBe(true);
        }),
        { numRuns: 200 },
      );
    });
  });
});
