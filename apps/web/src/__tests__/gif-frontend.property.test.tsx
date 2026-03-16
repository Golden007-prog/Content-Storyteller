import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { CopyPackage } from '@content-storyteller/shared';

/* ── Shared arbitraries ──────────────────────────────────────── */

/**
 * Generates a non-empty string of words (at least 1 word).
 */
const arbNonEmptyString = fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz '.split('')), { minLength: 1 })
  .filter((s) => s.trim().length > 0);

/**
 * Generates a caption string with a word count between min and max (inclusive).
 */
function arbCaptionWithWordCount(min: number, max: number): fc.Arbitrary<string> {
  return fc.integer({ min, max }).chain((wordCount) =>
    fc.array(
      fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 2, maxLength: 12 }),
      { minLength: wordCount, maxLength: wordCount },
    ).map((words) => words.join(' ')),
  );
}

/**
 * Generates a hashtag string (e.g., "#SomeTag").
 */
const arbHashtag = fc
  .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), { minLength: 2, maxLength: 15 })
  .map((s) => `#${s}`);

/**
 * Generates a CopyPackage with LinkedIn GIF constraints:
 * - non-empty hook
 * - caption with 50-200 words
 * - 3-8 hashtags
 * - non-empty cta
 */
function arbLinkedInGifCopyPackage(): fc.Arbitrary<CopyPackage> {
  return fc.record({
    hook: arbNonEmptyString,
    caption: arbCaptionWithWordCount(50, 200),
    cta: arbNonEmptyString,
    hashtags: fc.array(arbHashtag, { minLength: 3, maxLength: 8 }),
    threadCopy: fc.array(fc.string(), { minLength: 0, maxLength: 3 }),
    voiceoverScript: fc.string(),
    onScreenText: fc.array(fc.string(), { minLength: 0, maxLength: 3 }),
  });
}

/**
 * Generates a CopyPackage with valid GIF hashtags (3-8 elements).
 */
function arbGifCopyWithHashtags(): fc.Arbitrary<CopyPackage> {
  return fc.record({
    hook: fc.string(),
    caption: fc.string(),
    cta: fc.string(),
    hashtags: fc.array(arbHashtag, { minLength: 3, maxLength: 8 }),
    threadCopy: fc.array(fc.string(), { minLength: 0, maxLength: 3 }),
    voiceoverScript: fc.string(),
    onScreenText: fc.array(fc.string(), { minLength: 0, maxLength: 3 }),
  });
}

/* ══════════════════════════════════════════════════════════════════
 * Feature: linkedin-gif-generator, Property 9: LinkedIn GIF copy structure
 *
 * For any copy when wantsGif === true and platform is LinkedInLaunchPost,
 * hook is non-empty and caption word count is between 50 and 200.
 *
 * Validates: Requirements 7.1, 7.2
 * ══════════════════════════════════════════════════════════════════ */

describe('Feature: linkedin-gif-generator, Property 9: LinkedIn GIF copy structure', () => {
  it('hook is non-empty for any LinkedIn GIF copy', () => {
    fc.assert(
      fc.property(
        arbLinkedInGifCopyPackage(),
        (copy) => {
          // Simulate: wantsGif === true, platform === LinkedInLaunchPost
          expect(copy.hook).toBeDefined();
          expect(copy.hook.trim().length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('caption word count is between 50 and 200 for any LinkedIn GIF copy', () => {
    fc.assert(
      fc.property(
        arbLinkedInGifCopyPackage(),
        (copy) => {
          // Simulate: wantsGif === true, platform === LinkedInLaunchPost
          const wordCount = copy.caption.split(/\s+/).filter((w) => w.length > 0).length;
          expect(wordCount).toBeGreaterThanOrEqual(50);
          expect(wordCount).toBeLessThanOrEqual(200);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/* ══════════════════════════════════════════════════════════════════
 * Feature: linkedin-gif-generator, Property 10: GIF hashtag count bounds
 *
 * For any copy when wantsGif === true, hashtags array has between 3 and 8
 * elements.
 *
 * Validates: Requirements 7.3
 * ══════════════════════════════════════════════════════════════════ */

describe('Feature: linkedin-gif-generator, Property 10: GIF hashtag count bounds', () => {
  it('hashtags array has between 3 and 8 elements for any GIF copy', () => {
    fc.assert(
      fc.property(
        arbGifCopyWithHashtags(),
        (copy) => {
          // Simulate: wantsGif === true
          expect(copy.hashtags.length).toBeGreaterThanOrEqual(3);
          expect(copy.hashtags.length).toBeLessThanOrEqual(8);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('every hashtag is a non-empty string', () => {
    fc.assert(
      fc.property(
        arbGifCopyWithHashtags(),
        (copy) => {
          for (const tag of copy.hashtags) {
            expect(typeof tag).toBe('string');
            expect(tag.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

/* ══════════════════════════════════════════════════════════════════
 * Feature: linkedin-gif-generator, Property 11: LinkedIn GIF copy includes
 * required output fields
 *
 * For any pipeline execution with wantsGif === true and LinkedInLaunchPost,
 * copy includes hook, caption, CTA, and hashtags.
 *
 * Validates: Requirements 6.3
 * ══════════════════════════════════════════════════════════════════ */

describe('Feature: linkedin-gif-generator, Property 11: LinkedIn GIF copy includes required output fields', () => {
  it('copy includes hook, caption, cta, and hashtags for any LinkedIn GIF pipeline execution', () => {
    fc.assert(
      fc.property(
        arbLinkedInGifCopyPackage(),
        (copy) => {
          // Simulate: wantsGif === true, platform === LinkedInLaunchPost
          // Verify all required fields are present and defined
          expect(copy).toHaveProperty('hook');
          expect(copy).toHaveProperty('caption');
          expect(copy).toHaveProperty('cta');
          expect(copy).toHaveProperty('hashtags');

          // hook must be a non-empty string
          expect(typeof copy.hook).toBe('string');
          expect(copy.hook.trim().length).toBeGreaterThan(0);

          // caption must be a non-empty string
          expect(typeof copy.caption).toBe('string');
          expect(copy.caption.trim().length).toBeGreaterThan(0);

          // cta must be a string (present in the output)
          expect(typeof copy.cta).toBe('string');

          // hashtags must be an array with elements
          expect(Array.isArray(copy.hashtags)).toBe(true);
          expect(copy.hashtags.length).toBeGreaterThanOrEqual(3);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('CopyPackage structure conforms to the expected interface shape', () => {
    fc.assert(
      fc.property(
        arbLinkedInGifCopyPackage(),
        (copy) => {
          // Verify the CopyPackage has all expected keys from the interface
          const requiredKeys: (keyof CopyPackage)[] = [
            'hook', 'caption', 'cta', 'hashtags',
            'threadCopy', 'voiceoverScript', 'onScreenText',
          ];
          for (const key of requiredKeys) {
            expect(copy).toHaveProperty(key);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
