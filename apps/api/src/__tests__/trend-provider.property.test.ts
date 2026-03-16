/**
 * Property-based tests for trend provider normalization and scoring.
 *
 * These tests exercise pure functions directly (no Express app, no GCP mocks needed).
 *
 * Property 8: Normalization produces complete common format
 * Property 9: Momentum and relevance scores bounded 0–100
 * Property 18: Inferred signals labeled correctly
 *
 * Validates: Requirements 9.3, 9.5, 11.1, 11.2, 11.3, 22.1, 22.2, 22.3
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { TrendPlatform } from '@content-storyteller/shared';
import type { TrendRegion, TrendQuery } from '@content-storyteller/shared';
import type { RawTrendSignal } from '../services/trends/types';
import { normalizeSignals } from '../services/trends/normalize';
import { computeMomentumScore, computeRelevanceScore } from '../services/trends/scoring';

// ── Shared arbitraries ──────────────────────────────────────────────

const VALID_PLATFORMS = Object.values(TrendPlatform);
const DOMAIN_PRESETS = ['tech', 'fashion', 'finance', 'fitness', 'education', 'gaming', 'startup'];

const trendPlatformArb = fc.constantFrom(...VALID_PLATFORMS);

const trendRegionArb: fc.Arbitrary<TrendRegion> = fc.oneof(
  fc.record({ scope: fc.constant('global' as const) }),
  fc.record({
    scope: fc.constant('country' as const),
    country: fc.string({ minLength: 1, maxLength: 50 }),
  }),
  fc.record({
    scope: fc.constant('state_province' as const),
    country: fc.string({ minLength: 1, maxLength: 50 }),
    stateProvince: fc.string({ minLength: 1, maxLength: 50 }),
  }),
);

const trendQueryArb: fc.Arbitrary<TrendQuery> = fc.record({
  platform: trendPlatformArb,
  domain: fc.oneof(
    fc.constantFrom(...DOMAIN_PRESETS),
    fc.string({ minLength: 1, maxLength: 50 }),
  ),
  region: trendRegionArb,
  timeWindow: fc.option(fc.constantFrom('24h' as const, '7d' as const, '30d' as const), { nil: undefined }),
  language: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
});

const rawTrendSignalArb: fc.Arbitrary<RawTrendSignal> = fc.record({
  rawTitle: fc.string({ minLength: 1, maxLength: 100 }),
  rawDescription: fc.string({ minLength: 0, maxLength: 300 }),
  sourceName: fc.string({ minLength: 1, maxLength: 50 }),
  platform: trendPlatformArb,
  region: trendRegionArb,
  rawScore: fc.option(fc.double({ min: -1000, max: 1000, noNaN: true }), { nil: undefined }),
  collectedAt: fc.date().map((d) => d.toISOString()),
  isInferred: fc.boolean(),
});

// ── Property 8 ──────────────────────────────────────────────────────
/**
 * Feature: trend-analyzer, Property 8: Normalization produces complete common format
 *
 * For any raw trend signal from any provider, the normalizeSignals function
 * shall produce a NormalizedSignal object containing all required fields.
 *
 * Validates: Requirements 9.3, 11.1, 22.1
 */
describe('Property 8: Normalization produces complete common format', () => {
  it('normalizeSignals produces objects with all required fields', () => {
    fc.assert(
      fc.property(
        rawTrendSignalArb,
        trendQueryArb,
        (signal, query) => {
          const results = normalizeSignals([signal], query);
          expect(results.length).toBe(1);
          const normalized = results[0];

          // rawTitle is a string
          expect(typeof normalized.rawTitle).toBe('string');

          // rawDescription is a string
          expect(typeof normalized.rawDescription).toBe('string');

          // sourceName is a string
          expect(typeof normalized.sourceName).toBe('string');

          // platform is a valid TrendPlatform
          expect(VALID_PLATFORMS).toContain(normalized.platform);

          // region is a valid TrendRegion
          expect(['global', 'country', 'state_province']).toContain(normalized.region.scope);

          // rawScore is number or null
          expect(
            normalized.rawScore === null || typeof normalized.rawScore === 'number',
          ).toBe(true);

          // collectedAt is a string
          expect(typeof normalized.collectedAt).toBe('string');

          // isInferred is a boolean
          expect(typeof normalized.isInferred).toBe('boolean');

          // momentumScore is a number
          expect(typeof normalized.momentumScore).toBe('number');

          // relevanceScore is a number
          expect(typeof normalized.relevanceScore).toBe('number');
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 9 ──────────────────────────────────────────────────────
/**
 * Feature: trend-analyzer, Property 9: Momentum and relevance scores bounded 0–100
 *
 * For any raw trend signal passed through normalization and scoring,
 * the resulting momentumScore shall be between 0 and 100 inclusive,
 * and the resulting relevanceScore shall be between 0 and 100 inclusive.
 *
 * Validates: Requirements 11.2, 11.3, 22.2, 22.3
 */
describe('Property 9: Momentum and relevance scores bounded 0–100', () => {
  it('momentumScore and relevanceScore are within [0, 100] after normalization', () => {
    // Use a wider rawScore range including edge cases
    const signalWithVariousScores = fc.record({
      rawTitle: fc.string({ minLength: 1, maxLength: 100 }),
      rawDescription: fc.string({ minLength: 0, maxLength: 300 }),
      sourceName: fc.string({ minLength: 1, maxLength: 50 }),
      platform: trendPlatformArb,
      region: trendRegionArb,
      rawScore: fc.oneof(
        fc.constant(undefined),
        fc.constant(0),
        fc.constant(100),
        fc.double({ min: -10000, max: 10000, noNaN: true }),
      ),
      collectedAt: fc.date().map((d) => d.toISOString()),
      isInferred: fc.boolean(),
    }) as fc.Arbitrary<RawTrendSignal>;

    fc.assert(
      fc.property(
        signalWithVariousScores,
        trendQueryArb,
        (signal, query) => {
          const results = normalizeSignals([signal], query);
          expect(results.length).toBe(1);
          const normalized = results[0];

          expect(normalized.momentumScore).toBeGreaterThanOrEqual(0);
          expect(normalized.momentumScore).toBeLessThanOrEqual(100);
          expect(normalized.relevanceScore).toBeGreaterThanOrEqual(0);
          expect(normalized.relevanceScore).toBeLessThanOrEqual(100);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('computeMomentumScore directly returns values in [0, 100]', () => {
    fc.assert(
      fc.property(
        rawTrendSignalArb,
        (signal) => {
          const score = computeMomentumScore(signal);
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('computeRelevanceScore directly returns values in [0, 100]', () => {
    fc.assert(
      fc.property(
        rawTrendSignalArb,
        trendQueryArb,
        (signal, query) => {
          const score = computeRelevanceScore(signal, query);
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 18 ─────────────────────────────────────────────────────
/**
 * Feature: trend-analyzer, Property 18: Inferred signals labeled correctly
 *
 * For any trend signal with isInferred: true, the normalized signal
 * shall have isInferred: true.
 *
 * Validates: Requirements 9.5
 */
describe('Property 18: Inferred signals labeled correctly', () => {
  it('signals with isInferred: true produce normalized signals with isInferred: true', () => {
    const inferredSignalArb: fc.Arbitrary<RawTrendSignal> = fc.record({
      rawTitle: fc.string({ minLength: 1, maxLength: 100 }),
      rawDescription: fc.string({ minLength: 0, maxLength: 300 }),
      sourceName: fc.string({ minLength: 1, maxLength: 50 }),
      platform: trendPlatformArb,
      region: trendRegionArb,
      rawScore: fc.option(fc.double({ min: 0, max: 100, noNaN: true }), { nil: undefined }),
      collectedAt: fc.date().map((d) => d.toISOString()),
      isInferred: fc.constant(true),
    });

    fc.assert(
      fc.property(
        inferredSignalArb,
        trendQueryArb,
        (signal, query) => {
          const results = normalizeSignals([signal], query);
          expect(results.length).toBe(1);
          expect(results[0].isInferred).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
