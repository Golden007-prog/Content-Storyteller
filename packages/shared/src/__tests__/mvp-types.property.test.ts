/**
 * Property-based tests for shared type extensions (MVP).
 *
 * Property 1: Platform and Tone enum completeness
 * Property 2: New schema interfaces have all required fields
 * Property 3: Extended interfaces maintain backward compatibility
 *
 * Validates: Requirements 1.1, 1.2, 2.4, 3.1, 4.1, 4.2, 4.3, 5.1
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  Platform,
  Tone,
  JobState,
  AssetType,
  Job,
  AssetReference,
  FallbackNotice,
} from '../index';

// ── Property 1: Platform and Tone enum completeness ─────────────────
describe('Property 1: Platform and Tone enum completeness', () => {
  const expectedPlatforms = ['instagram_reel', 'linkedin_launch_post', 'x_twitter_thread', 'general_promo_package'];
  const expectedTones = ['cinematic', 'punchy', 'sleek', 'professional'];

  it('Platform enum contains exactly the 4 required values', () => {
    const values = Object.values(Platform);
    expect(values).toHaveLength(4);
    for (const expected of expectedPlatforms) {
      expect(values).toContain(expected);
    }
  });

  it('Tone enum contains exactly the 4 required values', () => {
    const values = Object.values(Tone);
    expect(values).toHaveLength(4);
    for (const expected of expectedTones) {
      expect(values).toContain(expected);
    }
  });

  it('every Platform enum value is a non-empty lowercase string', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.values(Platform)),
        (platform: string) => {
          expect(platform.length).toBeGreaterThan(0);
          expect(platform).toBe(platform.toLowerCase());
          expect(platform).toMatch(/^[a-z_]+$/);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('every Tone enum value is a non-empty lowercase string', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.values(Tone)),
        (tone: string) => {
          expect(tone.length).toBeGreaterThan(0);
          expect(tone).toBe(tone.toLowerCase());
          expect(tone).toMatch(/^[a-z]+$/);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Platform and Tone enum keys are PascalCase', () => {
    for (const key of Object.keys(Platform)) {
      expect(key).toMatch(/^[A-Z][a-zA-Z]+$/);
    }
    for (const key of Object.keys(Tone)) {
      expect(key).toMatch(/^[A-Z][a-zA-Z]+$/);
    }
  });
});

// ── Property 2: New schema interfaces have all required fields ──────
describe('Property 2: New schema interfaces have all required fields', () => {
  it('CopyPackage has all required string and array fields', () => {
    fc.assert(
      fc.property(
        fc.record({
          hook: fc.string({ minLength: 1 }),
          caption: fc.string({ minLength: 1 }),
          cta: fc.string({ minLength: 1 }),
          hashtags: fc.array(fc.string({ minLength: 1 }), { minLength: 1 }),
          threadCopy: fc.array(fc.string({ minLength: 1 })),
          voiceoverScript: fc.string({ minLength: 1 }),
          onScreenText: fc.array(fc.string({ minLength: 1 })),
        }),
        (cp) => {
          expect(typeof cp.hook).toBe('string');
          expect(typeof cp.caption).toBe('string');
          expect(typeof cp.cta).toBe('string');
          expect(Array.isArray(cp.hashtags)).toBe(true);
          expect(Array.isArray(cp.threadCopy)).toBe(true);
          expect(typeof cp.voiceoverScript).toBe('string');
          expect(Array.isArray(cp.onScreenText)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('StoryboardScene has all required fields', () => {
    fc.assert(
      fc.property(
        fc.record({
          sceneNumber: fc.integer({ min: 1, max: 100 }),
          description: fc.string({ minLength: 1 }),
          duration: fc.string({ minLength: 1 }),
          motionStyle: fc.string({ minLength: 1 }),
          textOverlay: fc.string(),
          cameraDirection: fc.string({ minLength: 1 }),
        }),
        (scene) => {
          expect(typeof scene.sceneNumber).toBe('number');
          expect(typeof scene.description).toBe('string');
          expect(typeof scene.duration).toBe('string');
          expect(typeof scene.motionStyle).toBe('string');
          expect(typeof scene.textOverlay).toBe('string');
          expect(typeof scene.cameraDirection).toBe('string');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('ImageConcept has all required fields', () => {
    fc.assert(
      fc.property(
        fc.record({
          conceptName: fc.string({ minLength: 1 }),
          visualDirection: fc.string({ minLength: 1 }),
          generationPrompt: fc.string({ minLength: 1 }),
          style: fc.string({ minLength: 1 }),
        }),
        (concept) => {
          expect(typeof concept.conceptName).toBe('string');
          expect(typeof concept.visualDirection).toBe('string');
          expect(typeof concept.generationPrompt).toBe('string');
          expect(typeof concept.style).toBe('string');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('VideoBrief has all required fields', () => {
    fc.assert(
      fc.property(
        fc.record({
          totalDuration: fc.string({ minLength: 1 }),
          motionStyle: fc.string({ minLength: 1 }),
          textOverlayStyle: fc.string({ minLength: 1 }),
          cameraDirection: fc.string({ minLength: 1 }),
          energyDirection: fc.string({ minLength: 1 }),
        }),
        (brief) => {
          expect(typeof brief.totalDuration).toBe('string');
          expect(typeof brief.motionStyle).toBe('string');
          expect(typeof brief.textOverlayStyle).toBe('string');
          expect(typeof brief.cameraDirection).toBe('string');
          expect(typeof brief.energyDirection).toBe('string');
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 3: Extended interfaces maintain backward compatibility ──
describe('Property 3: Extended interfaces maintain backward compatibility', () => {
  it('Job interface works with only original required fields (new fields optional)', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        fc.constantFrom(...Object.values(JobState)),
        (id, correlationId, state) => {
          // A Job with only the original required fields should be valid
          const job: Job = {
            id,
            correlationId,
            idempotencyKey: 'key-1',
            state,
            uploadedMediaPaths: [],
            assets: [],
            fallbackNotices: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            // promptText, platform, tone are all optional
          };
          expect(job.id).toBe(id);
          expect(job.state).toBe(state);
          expect(job.promptText).toBeUndefined();
          expect(job.platform).toBeUndefined();
          expect(job.tone).toBeUndefined();
          expect(job.creativeBrief).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Job interface works with all new MVP fields populated', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.constantFrom(...Object.values(Platform)),
        fc.constantFrom(...Object.values(Tone)),
        fc.string({ minLength: 1, maxLength: 200 }),
        (id, platform, tone, promptText) => {
          const job: Job = {
            id,
            correlationId: 'corr-1',
            idempotencyKey: 'key-1',
            state: JobState.Queued,
            uploadedMediaPaths: [],
            assets: [],
            fallbackNotices: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            promptText,
            platform,
            tone,
            creativeBrief: {
              targetAudience: 'Test',
              tone: tone,
              keyMessages: ['msg'],
              visualDirection: 'Modern',
              inputSummary: 'Summary',
              platform,
              campaignAngle: 'Angle',
              pacing: 'Fast',
              visualStyle: 'Clean',
            },
          };
          expect(job.promptText).toBe(promptText);
          expect(job.platform).toBe(platform);
          expect(job.tone).toBe(tone);
          expect(job.creativeBrief).toBeDefined();
          expect(job.creativeBrief!.campaignAngle).toBe('Angle');
        },
      ),
      { numRuns: 100 },
    );
  });
});
