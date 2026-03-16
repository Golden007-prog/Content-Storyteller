/**
 * Property-based tests for shared trend types.
 *
 * Property 1: TrendPlatform and TrendDomainPreset completeness
 * Property 2: Trend type interface field completeness
 * Property 3: TrendAnalysisResult JSON round-trip
 *
 * Validates: Requirements 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 6.3, 21.1, 21.2, 21.3, 21.4
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  TrendPlatform,
  type TrendDomainPreset,
  type TrendRegion,
  type TrendQuery,
  type FreshnessLabel,
  type TrendItem,
  type TrendAnalysisResult,
} from '../index';

// ── Shared arbitraries ──────────────────────────────────────────────

const DOMAIN_PRESETS: TrendDomainPreset[] = [
  'tech', 'fashion', 'finance', 'fitness', 'education', 'gaming', 'startup',
];

const FRESHNESS_LABELS: FreshnessLabel[] = [
  'Fresh', 'Rising Fast', 'Established', 'Fading',
];

const trendPlatformArb = fc.constantFrom(...Object.values(TrendPlatform));
const domainPresetArb = fc.constantFrom<TrendDomainPreset>(...DOMAIN_PRESETS);
const freshnessLabelArb = fc.constantFrom<FreshnessLabel>(...FRESHNESS_LABELS);
const scoreArb = fc.integer({ min: 0, max: 100 });

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
  domain: domainPresetArb,
  region: trendRegionArb,
  timeWindow: fc.option(fc.constantFrom('24h' as const, '7d' as const, '30d' as const), { nil: undefined }),
  language: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
});

const trendItemArb: fc.Arbitrary<TrendItem> = fc.record({
  title: fc.string({ minLength: 1, maxLength: 100 }),
  keyword: fc.string({ minLength: 1, maxLength: 50 }),
  description: fc.string({ minLength: 1, maxLength: 300 }),
  momentumScore: scoreArb,
  relevanceScore: scoreArb,
  suggestedHashtags: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 10 }),
  suggestedHook: fc.string({ minLength: 1, maxLength: 200 }),
  suggestedContentAngle: fc.string({ minLength: 1, maxLength: 200 }),
  sourceLabels: fc.array(fc.string({ minLength: 1, maxLength: 30 })),
  region: trendRegionArb,
  platform: trendPlatformArb,
  freshnessLabel: freshnessLabelArb,
});

const trendAnalysisResultArb: fc.Arbitrary<TrendAnalysisResult> = fc.record({
  queryId: fc.uuid(),
  platform: trendPlatformArb,
  domain: domainPresetArb,
  region: trendRegionArb,
  timeWindow: fc.option(fc.constantFrom('24h', '7d', '30d'), { nil: undefined }),
  language: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  generatedAt: fc.date().map((d) => d.toISOString()),
  summary: fc.string({ minLength: 1, maxLength: 500 }),
  trends: fc.array(trendItemArb, { minLength: 0, maxLength: 5 }),
});

// ── Property 1: TrendPlatform and TrendDomainPreset completeness ────
// Feature: trend-analyzer, Property 1: TrendPlatform and TrendDomainPreset completeness
describe('Property 1: TrendPlatform and TrendDomainPreset completeness', () => {
  /** Validates: Requirements 1.1, 2.1, 21.3, 21.4 */

  const expectedPlatforms = ['instagram_reels', 'x_twitter', 'linkedin', 'all_platforms'];
  const expectedDomainPresets = ['tech', 'fashion', 'finance', 'fitness', 'education', 'gaming', 'startup'];

  it('TrendPlatform enum contains exactly 4 values', () => {
    const values = Object.values(TrendPlatform);
    expect(values).toHaveLength(4);
    for (const expected of expectedPlatforms) {
      expect(values).toContain(expected);
    }
  });

  it('TrendDomainPreset contains exactly 7 values', () => {
    expect(DOMAIN_PRESETS).toHaveLength(7);
    for (const expected of expectedDomainPresets) {
      expect(DOMAIN_PRESETS).toContain(expected);
    }
  });

  it('every TrendPlatform enum value is a non-empty lowercase string', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.values(TrendPlatform)),
        (platform: string) => {
          expect(platform.length).toBeGreaterThan(0);
          expect(platform).toBe(platform.toLowerCase());
          expect(platform).toMatch(/^[a-z_]+$/);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('every TrendDomainPreset value is a non-empty lowercase string', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...DOMAIN_PRESETS),
        (preset: string) => {
          expect(preset.length).toBeGreaterThan(0);
          expect(preset).toBe(preset.toLowerCase());
          expect(preset).toMatch(/^[a-z]+$/);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 2: Trend type interface field completeness ─────────────
// Feature: trend-analyzer, Property 2: Trend type interface field completeness
describe('Property 2: Trend type interface field completeness', () => {
  /** Validates: Requirements 3.1, 4.1, 5.1, 6.1, 21.1 */

  it('TrendRegion has correct field types', () => {
    fc.assert(
      fc.property(trendRegionArb, (region: TrendRegion) => {
        expect(['global', 'country', 'state_province']).toContain(region.scope);
        if (region.country !== undefined) {
          expect(typeof region.country).toBe('string');
        }
        if (region.stateProvince !== undefined) {
          expect(typeof region.stateProvince).toBe('string');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('TrendQuery has all required fields with correct types', () => {
    fc.assert(
      fc.property(trendQueryArb, (query: TrendQuery) => {
        expect(Object.values(TrendPlatform)).toContain(query.platform);
        expect(typeof query.domain).toBe('string');
        expect(query.domain.length).toBeGreaterThan(0);
        expect(query.region).toBeDefined();
        expect(['global', 'country', 'state_province']).toContain(query.region.scope);
        if (query.timeWindow !== undefined) {
          expect(['24h', '7d', '30d']).toContain(query.timeWindow);
        }
        if (query.language !== undefined) {
          expect(typeof query.language).toBe('string');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('TrendItem has all required fields with correct types', () => {
    fc.assert(
      fc.property(trendItemArb, (item: TrendItem) => {
        expect(typeof item.title).toBe('string');
        expect(typeof item.keyword).toBe('string');
        expect(typeof item.description).toBe('string');
        expect(typeof item.momentumScore).toBe('number');
        expect(item.momentumScore).toBeGreaterThanOrEqual(0);
        expect(item.momentumScore).toBeLessThanOrEqual(100);
        expect(typeof item.relevanceScore).toBe('number');
        expect(item.relevanceScore).toBeGreaterThanOrEqual(0);
        expect(item.relevanceScore).toBeLessThanOrEqual(100);
        expect(Array.isArray(item.suggestedHashtags)).toBe(true);
        expect(typeof item.suggestedHook).toBe('string');
        expect(typeof item.suggestedContentAngle).toBe('string');
        expect(Array.isArray(item.sourceLabels)).toBe(true);
        expect(item.region).toBeDefined();
        expect(Object.values(TrendPlatform)).toContain(item.platform);
        expect(FRESHNESS_LABELS).toContain(item.freshnessLabel);
      }),
      { numRuns: 100 },
    );
  });

  it('TrendAnalysisResult has all required fields with correct types', () => {
    fc.assert(
      fc.property(trendAnalysisResultArb, (result: TrendAnalysisResult) => {
        expect(typeof result.queryId).toBe('string');
        expect(result.queryId.length).toBeGreaterThan(0);
        expect(Object.values(TrendPlatform)).toContain(result.platform);
        expect(typeof result.domain).toBe('string');
        expect(result.domain.length).toBeGreaterThan(0);
        expect(result.region).toBeDefined();
        if (result.timeWindow !== undefined) {
          expect(typeof result.timeWindow).toBe('string');
        }
        if (result.language !== undefined) {
          expect(typeof result.language).toBe('string');
        }
        expect(typeof result.generatedAt).toBe('string');
        expect(typeof result.summary).toBe('string');
        expect(Array.isArray(result.trends)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

// ── Property 3: TrendAnalysisResult JSON round-trip ─────────────────
// Feature: trend-analyzer, Property 3: TrendAnalysisResult JSON round-trip
describe('Property 3: TrendAnalysisResult JSON round-trip', () => {
  /** Validates: Requirements 6.3, 21.2 */

  it('serializing to JSON then parsing back produces a deeply equal object', () => {
    fc.assert(
      fc.property(trendAnalysisResultArb, (result: TrendAnalysisResult) => {
        const serialized = JSON.stringify(result);
        const deserialized = JSON.parse(serialized);
        expect(deserialized).toEqual(result);
      }),
      { numRuns: 100 },
    );
  });
});
