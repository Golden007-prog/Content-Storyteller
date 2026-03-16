/**
 * Unit tests for trend provider architecture.
 *
 * Tests pure functions directly — no GCP mocks needed.
 * Mocks @google/genai since the registry imports GeminiTrendProvider which imports genai.
 *
 * Requirements: 9.1, 9.3, 9.4, 9.5, 11.1, 11.2, 11.3, 22.4
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: vi.fn().mockResolvedValue({ text: '[]' }),
    },
  })),
}));

vi.mock('../services/genai', () => ({
  generateContent: vi.fn().mockResolvedValue('[]'),
  GENAI_MODEL: 'gemini-2.0-flash',
}));

import { TrendPlatform } from '@content-storyteller/shared';
import type { TrendQuery } from '@content-storyteller/shared';
import type { RawTrendSignal } from '../services/trends/types';
import { getProviders } from '../services/trends/registry';
import { computeMomentumScore } from '../services/trends/scoring';
import { normalizeSignals } from '../services/trends/normalize';
import { GeminiTrendProvider } from '../services/trends/providers/gemini-provider';
import { generateContent } from '../services/genai';

// ── Helpers ─────────────────────────────────────────────────────────

function makeSignal(overrides: Partial<RawTrendSignal> = {}): RawTrendSignal {
  return {
    rawTitle: 'Test Trend',
    rawDescription: 'A test trend description',
    sourceName: 'test',
    platform: TrendPlatform.InstagramReels,
    region: { scope: 'global' },
    collectedAt: new Date().toISOString(),
    isInferred: false,
    ...overrides,
  };
}

function makeQuery(overrides: Partial<TrendQuery> = {}): TrendQuery {
  return {
    platform: TrendPlatform.InstagramReels,
    domain: 'tech',
    region: { scope: 'global' },
    ...overrides,
  };
}

// ── 1. Provider registry ────────────────────────────────────────────

describe('Provider registry returns expected providers', () => {
  it('getProviders() returns an array with at least one provider', () => {
    const providers = getProviders();
    expect(Array.isArray(providers)).toBe(true);
    expect(providers.length).toBeGreaterThanOrEqual(1);
  });

  it('first provider has name "gemini"', () => {
    const providers = getProviders();
    expect(providers[0].name).toBe('gemini');
  });

  it('every provider implements the TrendProvider interface', () => {
    const providers = getProviders();
    for (const provider of providers) {
      expect(typeof provider.name).toBe('string');
      expect(typeof provider.fetchSignals).toBe('function');
    }
  });
});

// ── 2. Scoring edge cases ───────────────────────────────────────────

describe('computeMomentumScore edge cases', () => {
  it('defaults to 50 when rawScore is null/undefined', () => {
    const signal = makeSignal({ rawScore: undefined });
    expect(computeMomentumScore(signal)).toBe(50);
  });

  it('returns 0 when rawScore is 0', () => {
    const signal = makeSignal({ rawScore: 0 });
    expect(computeMomentumScore(signal)).toBe(0);
  });

  it('returns 100 when rawScore is 100', () => {
    const signal = makeSignal({ rawScore: 100 });
    expect(computeMomentumScore(signal)).toBe(100);
  });

  it('clamps to 0 when rawScore is negative (-50)', () => {
    const signal = makeSignal({ rawScore: -50 });
    expect(computeMomentumScore(signal)).toBe(0);
  });

  it('clamps to 100 when rawScore exceeds 100 (200)', () => {
    const signal = makeSignal({ rawScore: 200 });
    expect(computeMomentumScore(signal)).toBe(100);
  });
});

// ── 3. Normalization deduplication ──────────────────────────────────

describe('Normalization deduplication', () => {
  it('deduplicates signals with the same title (different case)', () => {
    const signal1 = makeSignal({ rawTitle: 'AI Revolution' });
    const signal2 = makeSignal({ rawTitle: 'ai revolution' });
    const query = makeQuery();

    const results = normalizeSignals([signal1, signal2], query);
    expect(results).toHaveLength(1);
    // Keeps the first occurrence
    expect(results[0].rawTitle).toBe('AI Revolution');
  });

  it('keeps signals with different titles', () => {
    const signal1 = makeSignal({ rawTitle: 'AI Revolution' });
    const signal2 = makeSignal({ rawTitle: 'Blockchain Boom' });
    const query = makeQuery();

    const results = normalizeSignals([signal1, signal2], query);
    expect(results).toHaveLength(2);
  });
});

// ── 4. Provider failure graceful degradation ────────────────────────

describe('Provider failure and graceful degradation', () => {
  it('GeminiTrendProvider.fetchSignals returns empty array when generateContent throws', async () => {
    vi.mocked(generateContent).mockRejectedValueOnce(new Error('API unavailable'));

    const provider = new GeminiTrendProvider();
    const query = makeQuery();
    const result = await provider.fetchSignals(query);

    expect(result).toEqual([]);
  });
});
