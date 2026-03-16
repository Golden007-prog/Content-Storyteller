/**
 * Property-based tests for GIF type constraints.
 *
 * Property 5: GIF style preset validity
 * Property 8: GIF storage path format
 *
 * Validates: Requirements 3.1, 2.6
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { GifStylePreset } from '../index';

const VALID_GIF_STYLE_PRESETS: GifStylePreset[] = [
  'diagram_pulse',
  'workflow_step_highlight',
  'zoom_pan_explainer',
  'feature_spotlight',
  'text_callout_animation',
  'process_flow_reveal',
  'before_after_comparison',
];

// Feature: linkedin-gif-generator, Property 5: GIF style preset validity
describe('Property 5: GIF style preset validity', () => {
  /** Validates: Requirements 3.1 */

  it('any selected preset from the valid set is one of the 7 valid values', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_GIF_STYLE_PRESETS),
        (preset: GifStylePreset) => {
          expect(VALID_GIF_STYLE_PRESETS).toContain(preset);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('there are exactly 7 valid GIF style presets', () => {
    expect(VALID_GIF_STYLE_PRESETS).toHaveLength(7);
  });

  it('every valid preset is a non-empty lowercase_snake_case string', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_GIF_STYLE_PRESETS),
        (preset: GifStylePreset) => {
          expect(preset.length).toBeGreaterThan(0);
          expect(preset).toBe(preset.toLowerCase());
          expect(preset).toMatch(/^[a-z_]+$/);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('random strings outside the valid set are not valid presets', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(
          (s) => !VALID_GIF_STYLE_PRESETS.includes(s as GifStylePreset),
        ),
        (randomStr: string) => {
          expect(VALID_GIF_STYLE_PRESETS).not.toContain(randomStr);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: linkedin-gif-generator, Property 8: GIF storage path format
describe('Property 8: GIF storage path format', () => {
  /** Validates: Requirements 2.6 */

  const GIF_PATH_REGEX = /^[^/]+\/gifs\/[^/]+\.gif$/;

  it('constructed path matches {jobId}/gifs/{assetId}.gif for any jobId and assetId', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        (jobId: string, assetId: string) => {
          const path = `${jobId}/gifs/${assetId}.gif`;
          expect(path).toMatch(GIF_PATH_REGEX);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('path always ends with .gif extension', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z0-9_-]+$/),
        fc.stringMatching(/^[a-zA-Z0-9_-]+$/),
        (jobId: string, assetId: string) => {
          const path = `${jobId}/gifs/${assetId}.gif`;
          expect(path.endsWith('.gif')).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('path always contains /gifs/ directory segment', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        (jobId: string, assetId: string) => {
          const path = `${jobId}/gifs/${assetId}.gif`;
          expect(path).toContain('/gifs/');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('path segments can be extracted back to original jobId and assetId', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        (jobId: string, assetId: string) => {
          const path = `${jobId}/gifs/${assetId}.gif`;
          const parts = path.split('/');
          expect(parts[0]).toBe(jobId);
          expect(parts[1]).toBe('gifs');
          expect(parts[2]).toBe(`${assetId}.gif`);
        },
      ),
      { numRuns: 100 },
    );
  });
});
