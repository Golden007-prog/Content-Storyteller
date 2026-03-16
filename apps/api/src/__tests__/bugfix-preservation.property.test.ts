/**
 * Preservation Property Tests — API
 *
 * These tests encode EXISTING correct behavior that must be preserved
 * after the bugfix. They MUST PASS on unfixed code.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { Platform, Tone, OutputPreference } from '@content-storyteller/shared';
import { resolveOutputIntent } from '../services/planner/output-intent';
import type { PlannerInput } from '../services/planner/output-intent';

// ── Arbitraries ─────────────────────────────────────────────────────

const arbPlatform = fc.constantFrom(...Object.values(Platform));
const arbTone = fc.constantFrom(...Object.values(Tone));

/**
 * Existing regex patterns in the unfixed code that we must NOT break:
 *   Video: /\b(video|reel|teaser|promo clip)\b/
 *   Image: /\b(image|photo|picture|visual|hero image)\b/
 *   Copy-only: /\b(copy only|text only)\b/
 *   Full package: /\b(complete package|full package)\b/
 *   GIF: /\b(gif|looping animation|animated explainer|linkedin gif|motion graphic|animated workflow)\b/i
 *   Carousel: /\bcarousel\b/
 */
const ALL_EXISTING_KEYWORDS = [
  'video', 'reel', 'teaser', 'promo clip',
  'image', 'photo', 'picture', 'visual', 'hero image',
  'copy only', 'text only',
  'complete package', 'full package',
  'gif', 'looping animation', 'animated explainer', 'linkedin gif',
  'motion graphic', 'animated workflow',
  'carousel',
];

/** Prompt that does NOT contain any existing media/keyword phrases */
const arbNeutralPrompt = fc
  .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuwxyz '.split('')), {
    minLength: 5,
    maxLength: 120,
  })
  .filter((s) => {
    const lower = s.toLowerCase();
    return !ALL_EXISTING_KEYWORDS.some((kw) => lower.includes(kw));
  });

const arbMediaPaths = fc.array(fc.string({ minLength: 1, maxLength: 30 }), {
  minLength: 0,
  maxLength: 2,
});

function makeInput(overrides: Partial<PlannerInput>): PlannerInput {
  return {
    promptText: 'write a caption',
    platform: Platform.InstagramReel,
    tone: Tone.Cinematic,
    uploadedMediaPaths: [],
    outputPreference: OutputPreference.Auto,
    ...overrides,
  };
}

// ── Property 1: outputPreferenceLabel returns expected strings ──────
// (Tested on frontend side — see bugfix-preservation.property.test.tsx)

// ── Property 2: CopyOnly always produces no media ──────────────────

/**
 * For all prompts WITHOUT new media phrases and with OutputPreference.CopyOnly,
 * resolveOutputIntent returns wantsImage=false, wantsVideo=false, wantsGif=false.
 *
 * **Validates: Requirements 3.1**
 */
describe('Property 2: CopyOnly preference produces no media output', () => {
  it('CopyOnly always sets wantsImage=false, wantsVideo=false, wantsGif=false', () => {
    fc.assert(
      fc.property(
        arbNeutralPrompt,
        arbPlatform,
        arbTone,
        arbMediaPaths,
        (prompt, platform, tone, media) => {
          const intent = resolveOutputIntent({
            promptText: prompt,
            platform,
            tone,
            uploadedMediaPaths: media,
            outputPreference: OutputPreference.CopyOnly,
          });

          expect(intent.wantsImage).toBe(false);
          expect(intent.wantsVideo).toBe(false);
          expect(intent.wantsGif).toBe(false);
          expect(intent.wantsCopy).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 3: Auto + InstagramReel + no media keywords → platform defaults ──

/**
 * For all prompts with OutputPreference.Auto and platform InstagramReel
 * and no media keywords, resolveOutputIntent returns
 * wantsVideo=true, wantsImage=true, wantsStoryboard=true, wantsVoiceover=true.
 *
 * **Validates: Requirements 3.2, 3.4**
 */
describe('Property 3: Auto + InstagramReel platform defaults preserved', () => {
  it('neutral prompts with Auto + InstagramReel get full video+image defaults', () => {
    fc.assert(
      fc.property(
        arbNeutralPrompt,
        arbTone,
        arbMediaPaths,
        (prompt, tone, media) => {
          const intent = resolveOutputIntent({
            promptText: prompt,
            platform: Platform.InstagramReel,
            tone,
            uploadedMediaPaths: media,
            outputPreference: OutputPreference.Auto,
          });

          expect(intent.wantsVideo).toBe(true);
          expect(intent.wantsImage).toBe(true);
          expect(intent.wantsStoryboard).toBe(true);
          expect(intent.wantsVoiceover).toBe(true);
          expect(intent.wantsCopy).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 4: "copy only" / "text only" keywords override media flags ──

/**
 * For all prompts containing "copy only" or "text only",
 * resolveOutputIntent returns wantsImage=false, wantsVideo=false
 * regardless of platform.
 *
 * **Validates: Requirements 3.5**
 */
describe('Property 4: Copy-only keyword override preserved', () => {
  const arbCopyOnlyPhrase = fc.constantFrom('copy only', 'text only');

  const arbSurroundingText = fc.array(
    fc.constantFrom(
      'just give me',
      'I want',
      'please provide',
      'for the campaign',
      'for LinkedIn',
      'content',
      'for my brand',
      'with hashtags',
    ),
    { minLength: 0, maxLength: 2 },
  );

  it('"copy only" or "text only" in prompt forces wantsImage=false, wantsVideo=false', () => {
    fc.assert(
      fc.property(
        arbCopyOnlyPhrase,
        arbSurroundingText,
        arbPlatform,
        arbTone,
        arbMediaPaths,
        (phrase, context, platform, tone, media) => {
          const prompt = `${context.join(' ')} ${phrase} ${context.join(' ')}`.trim();

          const intent = resolveOutputIntent({
            promptText: prompt,
            platform,
            tone,
            uploadedMediaPaths: media,
            outputPreference: OutputPreference.Auto,
          });

          expect(intent.wantsImage).toBe(false);
          expect(intent.wantsVideo).toBe(false);
          expect(intent.wantsCopy).toBe(true);
        },
      ),
      { numRuns: 80 },
    );
  });
});

// ── Property 5: Existing keywords set corresponding flags ──────────

/**
 * For all prompts with existing keywords ("video", "reel", "image", "photo"),
 * resolveOutputIntent sets the corresponding flags to true.
 *
 * **Validates: Requirements 3.2**
 */
describe('Property 5: Existing keyword detection preserved', () => {
  const arbSurroundingText = fc.array(
    fc.constantFrom(
      'create a',
      'make a',
      'I need a',
      'for the launch',
      'for our brand',
      'please',
      'about the product',
    ),
    { minLength: 0, maxLength: 2 },
  );

  it('"video" or "reel" in prompt sets wantsVideo=true', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('video', 'reel'),
        arbSurroundingText,
        arbPlatform,
        arbTone,
        arbMediaPaths,
        (keyword, context, platform, tone, media) => {
          const prompt = `${context.join(' ')} ${keyword} ${context.join(' ')}`.trim();

          const intent = resolveOutputIntent({
            promptText: prompt,
            platform,
            tone,
            uploadedMediaPaths: media,
            outputPreference: OutputPreference.Auto,
          });

          expect(intent.wantsVideo).toBe(true);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('"image" or "photo" in prompt sets wantsImage=true', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('image', 'photo'),
        arbSurroundingText,
        arbPlatform,
        arbTone,
        arbMediaPaths,
        (keyword, context, platform, tone, media) => {
          const prompt = `${context.join(' ')} ${keyword} ${context.join(' ')}`.trim();

          const intent = resolveOutputIntent({
            promptText: prompt,
            platform,
            tone,
            uploadedMediaPaths: media,
            outputPreference: OutputPreference.Auto,
          });

          expect(intent.wantsImage).toBe(true);
        },
      ),
      { numRuns: 60 },
    );
  });
});

// ── Property 7: generateSignedUrl in cloud env calls getSignedUrl ──

/**
 * generateSignedUrl in cloud environment (isCloud=true) calls
 * file.getSignedUrl() and returns the signed URL.
 *
 * **Validates: Requirements 3.3**
 */
describe('Property 7: Cloud signed URL generation preserved', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('in cloud env, generateSignedUrl calls file.getSignedUrl and returns the URL', async () => {
    const expectedUrl = 'https://storage.googleapis.com/signed-url-test';
    const mockGetSignedUrl = vi.fn().mockResolvedValue([expectedUrl]);

    vi.doMock('../config/gcp', () => ({
      getGcpConfig: () => ({
        projectId: 'test-project',
        location: 'us-central1',
        firestoreDatabase: '(default)',
        uploadsBucket: 'test-uploads',
        assetsBucket: 'test-assets',
        pubsubTopic: 'test-topic',
        geminiApiKey: '',
        isCloud: true,
        authMode: 'adc-service-account' as const,
      }),
      _resetConfigForTesting: () => {},
    }));

    vi.doMock('@google-cloud/storage', () => ({
      Storage: vi.fn().mockImplementation(() => ({
        bucket: () => ({
          file: () => ({
            getSignedUrl: mockGetSignedUrl,
          }),
        }),
      })),
    }));

    const { generateSignedUrl } = await import('../services/storage');

    const result = await generateSignedUrl('jobs/123/images/hero.png');

    expect(mockGetSignedUrl).toHaveBeenCalledOnce();
    expect(result).toBe(expectedUrl);
  });
});
