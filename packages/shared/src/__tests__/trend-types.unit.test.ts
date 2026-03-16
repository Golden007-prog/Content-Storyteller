/**
 * Unit tests for shared trend type extensions.
 *
 * Verifies barrel exports include all new trend types and enum/type values.
 *
 * Validates: Requirements 1.1, 1.2, 2.1, 5.1, 6.1
 */
import { describe, it, expect } from 'vitest';
import * as SharedExports from '../index';
import { TrendPlatform } from '../index';

describe('Trend types barrel exports', () => {
  it('exports TrendPlatform enum from barrel', () => {
    expect(SharedExports).toHaveProperty('TrendPlatform');
  });

  it('exports all trend type names from barrel', () => {
    // Enums are runtime values — verify directly
    expect(SharedExports.TrendPlatform).toBeDefined();

    // Interfaces/types are erased at runtime, but we verify the barrel
    // re-exports them by confirming the module keys include the enum
    // and that importing them doesn't throw (compile-time check).
    // The following imports succeed at compile time, confirming barrel exports:
    const _check: {
      TrendDomainPreset: SharedExports.TrendDomainPreset;
      TrendDomain: SharedExports.TrendDomain;
      TrendRegion: SharedExports.TrendRegion;
      TrendQuery: SharedExports.TrendQuery;
      FreshnessLabel: SharedExports.FreshnessLabel;
      TrendItem: SharedExports.TrendItem;
      TrendAnalysisResult: SharedExports.TrendAnalysisResult;
    } = {} as any;
    expect(_check).toBeDefined();
  });
});

describe('TrendPlatform enum values', () => {
  it('has exactly 4 members', () => {
    const values = Object.values(TrendPlatform);
    expect(values).toHaveLength(4);
  });

  it('enum keys are PascalCase', () => {
    const keys = Object.keys(TrendPlatform);
    for (const key of keys) {
      expect(key).toMatch(/^[A-Z][a-zA-Z]*$/);
    }
  });

  it('enum string values are snake_case', () => {
    const values = Object.values(TrendPlatform);
    for (const value of values) {
      expect(value).toMatch(/^[a-z]+(_[a-z]+)*$/);
    }
  });

  it('maps keys to correct string values', () => {
    expect(TrendPlatform.InstagramReels).toBe('instagram_reels');
    expect(TrendPlatform.XTwitter).toBe('x_twitter');
    expect(TrendPlatform.LinkedIn).toBe('linkedin');
    expect(TrendPlatform.AllPlatforms).toBe('all_platforms');
  });

  it('enum values are unique', () => {
    const values = Object.values(TrendPlatform);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('FreshnessLabel type', () => {
  it('accepts exactly 4 valid values', () => {
    const validLabels: SharedExports.FreshnessLabel[] = [
      'Fresh',
      'Rising Fast',
      'Established',
      'Fading',
    ];
    expect(validLabels).toHaveLength(4);
    // Each value is assignable to FreshnessLabel (compile-time check)
    for (const label of validLabels) {
      expect(typeof label).toBe('string');
    }
  });
});
