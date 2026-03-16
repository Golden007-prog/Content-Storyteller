/**
 * Unit tests for trend analyzer model routing.
 *
 * Verifies that:
 * 1. analyzeTrends uses getModel('text') for synthesis and passes result to generateContent
 * 2. GeminiTrendProvider uses getModel('text') for signal collection and passes result to generateContent
 *
 * Validates: Requirements 6.1, 6.2
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const getModelSpy = vi.fn();
  const generateContentSpy = vi.fn();
  const getProvidersSpy = vi.fn();

  return {
    getModelSpy,
    generateContentSpy,
    getProvidersSpy,
  };
});

// ── Module mocks ────────────────────────────────────────────────────

vi.mock('@content-storyteller/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@content-storyteller/shared')>();
  return {
    ...actual,
    getModel: mocks.getModelSpy,
  };
});

vi.mock('../services/genai', () => ({
  generateContent: mocks.generateContentSpy,
}));

vi.mock('../services/trends/registry', () => ({
  getProviders: mocks.getProvidersSpy,
}));

// ── Imports under test (after mocks) ────────────────────────────────

import { analyzeTrends } from '../services/trends/analyzer';
import { GeminiTrendProvider } from '../services/trends/providers/gemini-provider';
import { TrendPlatform, type TrendQuery } from '@content-storyteller/shared';

// ── Helpers ─────────────────────────────────────────────────────────

const sampleQuery: TrendQuery = {
  platform: TrendPlatform.InstagramReels,
  domain: 'tech',
  region: { scope: 'global' },
};

const sampleGeminiResponse = JSON.stringify({
  summary: 'Tech trends are booming',
  trends: [
    {
      title: 'AI Assistants',
      keyword: 'ai',
      description: 'AI assistants are trending',
      momentumScore: 90,
      relevanceScore: 85,
      suggestedHashtags: ['#AI'],
      suggestedHook: 'The future is here',
      suggestedContentAngle: 'Show AI in action',
      sourceLabels: ['gemini'],
      region: { scope: 'global' },
      platform: 'instagram_reels',
      freshnessLabel: 'Fresh',
    },
  ],
});

const sampleSignalResponse = JSON.stringify([
  {
    rawTitle: 'AI Trend',
    rawDescription: 'AI is trending',
    platform: 'instagram_reels',
    region: { scope: 'global' },
  },
]);

// ── Tests ───────────────────────────────────────────────────────────

describe('Trend analyzer model routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getModelSpy.mockImplementation((slot: string) => {
      if (slot === 'text') return 'test-text-model';
      return `test-${slot}-model`;
    });
  });

  // Req 6.1, 6.2: Trend synthesis uses textModel
  describe('analyzer synthesis routing', () => {
    it('calls getModel("text") and passes result to generateContent for synthesis', async () => {
      // Setup: no providers so we go straight to Gemini synthesis
      mocks.getProvidersSpy.mockReturnValue([]);
      mocks.generateContentSpy.mockResolvedValue(sampleGeminiResponse);

      await analyzeTrends(sampleQuery);

      // Verify getModel was called with 'text'
      expect(mocks.getModelSpy).toHaveBeenCalledWith('text');

      // Verify generateContent received the model from getModel('text')
      expect(mocks.generateContentSpy).toHaveBeenCalledWith(
        expect.any(String),
        'test-text-model',
      );
    });

    it('passes the text model even when providers return signals', async () => {
      // Setup: one provider that returns signals
      const mockProvider = {
        name: 'mock-provider',
        fetchSignals: vi.fn().mockResolvedValue([
          {
            rawTitle: 'Test Signal',
            rawDescription: 'A test signal',
            sourceName: 'mock',
            platform: 'instagram_reels',
            region: { scope: 'global' },
            collectedAt: new Date().toISOString(),
            isInferred: false,
          },
        ]),
      };
      mocks.getProvidersSpy.mockReturnValue([mockProvider]);
      mocks.generateContentSpy.mockResolvedValue(sampleGeminiResponse);

      await analyzeTrends(sampleQuery);

      expect(mocks.getModelSpy).toHaveBeenCalledWith('text');
      expect(mocks.generateContentSpy).toHaveBeenCalledWith(
        expect.any(String),
        'test-text-model',
      );
    });
  });

  // Req 6.1: Signal collection uses textModel
  describe('gemini-provider signal collection routing', () => {
    it('calls getModel("text") and passes result to generateContent for signal collection', async () => {
      mocks.generateContentSpy.mockResolvedValue(sampleSignalResponse);

      const provider = new GeminiTrendProvider();
      await provider.fetchSignals(sampleQuery);

      // Verify getModel was called with 'text'
      expect(mocks.getModelSpy).toHaveBeenCalledWith('text');

      // Verify generateContent received the model from getModel('text')
      expect(mocks.generateContentSpy).toHaveBeenCalledWith(
        expect.any(String),
        'test-text-model',
      );
    });

    it('returns empty array on failure without throwing', async () => {
      mocks.generateContentSpy.mockRejectedValue(new Error('API error'));

      const provider = new GeminiTrendProvider();
      const result = await provider.fetchSignals(sampleQuery);

      expect(result).toEqual([]);
    });
  });
});
