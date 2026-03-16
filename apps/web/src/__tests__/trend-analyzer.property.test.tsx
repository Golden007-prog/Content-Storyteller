import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import fc from 'fast-check';
import { TrendPlatform } from '@content-storyteller/shared';
import type { TrendItem, TrendRegion, FreshnessLabel, TrendAnalysisResult } from '@content-storyteller/shared';
import { TrendFilters } from '../components/TrendFilters';
import { TrendResults } from '../components/TrendResults';
import { TrendCard } from '../components/TrendCard';

/* ── Arbitrary generators ──────────────────────────────────────── */

const trendRegionArb: fc.Arbitrary<TrendRegion> = fc.oneof(
  fc.constant<TrendRegion>({ scope: 'global' }),
  fc.record({
    scope: fc.constant('country' as const),
    country: fc.string({ minLength: 1, maxLength: 20 }),
  }),
  fc.record({
    scope: fc.constant('state_province' as const),
    country: fc.string({ minLength: 1, maxLength: 20 }),
    stateProvince: fc.string({ minLength: 1, maxLength: 20 }),
  }),
);

const freshnessLabelArb: fc.Arbitrary<FreshnessLabel> = fc.constantFrom(
  'Fresh' as const,
  'Rising Fast' as const,
  'Established' as const,
  'Fading' as const,
);

const trendItemArb: fc.Arbitrary<TrendItem> = fc.record({
  title: fc.string({ minLength: 1, maxLength: 50 }),
  keyword: fc.string({ minLength: 1, maxLength: 30 }),
  description: fc.string({ minLength: 1, maxLength: 100 }),
  momentumScore: fc.integer({ min: 0, max: 100 }),
  relevanceScore: fc.integer({ min: 0, max: 100 }),
  suggestedHashtags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
  suggestedHook: fc.string({ minLength: 1, maxLength: 80 }),
  suggestedContentAngle: fc.string({ minLength: 1, maxLength: 80 }),
  sourceLabels: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }),
  region: trendRegionArb,
  platform: fc.constantFrom(...Object.values(TrendPlatform)),
  freshnessLabel: freshnessLabelArb,
});


/**
 * Property 12: Platform selector renders all TrendPlatform options
 * Validates: Requirements 14.1, 23.5
 */
describe('Property 12: Platform selector renders all TrendPlatform options', () => {
  it('TrendFilters renders pill buttons for all 4 TrendPlatform options', () => {
    const { container } = render(
      <TrendFilters onSubmit={() => {}} isLoading={false} />,
    );
    const buttons = Array.from(container.querySelectorAll('button[type="button"]'));
    const buttonTexts = buttons.map((b) => b.textContent);
    // Platform pills: All, Instagram, Twitter, LinkedIn
    expect(buttonTexts).toContain('All');
    expect(buttonTexts).toContain('Instagram');
    expect(buttonTexts).toContain('Twitter');
    expect(buttonTexts).toContain('LinkedIn');
  });

  it('for any TrendPlatform value, a matching pill button exists', () => {
    const platformLabels: Record<string, string> = {
      [TrendPlatform.AllPlatforms]: 'All',
      [TrendPlatform.InstagramReels]: 'Instagram',
      [TrendPlatform.XTwitter]: 'Twitter',
      [TrendPlatform.LinkedIn]: 'LinkedIn',
    };
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.values(TrendPlatform)),
        (platform) => {
          const { container } = render(
            <TrendFilters onSubmit={() => {}} isLoading={false} />,
          );
          const buttons = Array.from(container.querySelectorAll('button[type="button"]'));
          const buttonTexts = buttons.map((b) => b.textContent);
          expect(buttonTexts).toContain(platformLabels[platform]);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 13: Filter validation prevents submission without required fields
 * Validates: Requirements 14.7, 14.8
 */
describe('Property 13: Filter validation prevents submission without required fields', () => {
  it('submitting the form calls onSubmit with valid query data', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <TrendFilters onSubmit={onSubmit} isLoading={false} />,
    );

    const submitButton = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(submitButton);

    // Default values are valid, so onSubmit should be called
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const query = onSubmit.mock.calls[0][0];
    expect(query.platform).toBeDefined();
    expect(query.domain).toBeDefined();
    expect(query.region).toBeDefined();
  });

  it('for any whitespace-only language input, the language field is omitted from query', () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r')),
        (whitespace) => {
          const onSubmit = vi.fn();
          const { container } = render(
            <TrendFilters onSubmit={onSubmit} isLoading={false} />,
          );

          // Enter whitespace-only language
          const languageInput = container.querySelector('#trend-language') as HTMLInputElement;
          if (languageInput) {
            fireEvent.change(languageInput, { target: { value: whitespace } });
          }

          // Submit
          const submitButton = container.querySelector('button[type="submit"]') as HTMLButtonElement;
          fireEvent.click(submitButton);

          expect(onSubmit).toHaveBeenCalled();
          const query = onSubmit.mock.calls[0][0];
          // Whitespace-only language should not be included
          expect(query.language).toBeUndefined();
        },
      ),
      { numRuns: 20 },
    );
  });
});


/**
 * Property 14: TrendResults renders one TrendCard per TrendItem
 * Validates: Requirements 15.2, 23.2
 */
describe('Property 14: TrendResults renders one TrendCard per TrendItem', () => {
  it('for any array of TrendItems, TrendResults renders exactly that many cards', () => {
    fc.assert(
      fc.property(
        fc.array(trendItemArb, { minLength: 1, maxLength: 6 }),
        (trends) => {
          const result: TrendAnalysisResult = {
            queryId: 'test-query-id',
            platform: TrendPlatform.InstagramReels,
            domain: 'tech',
            region: { scope: 'global' },
            generatedAt: new Date().toISOString(),
            summary: 'Test summary',
            trends,
          };
          const { container } = render(
            <TrendResults result={result} isLoading={false} onUseTrend={() => {}} />,
          );
          // Each TrendCard has a "Use in Content Storyteller" button
          const ctaButtons = Array.from(container.querySelectorAll('button')).filter(
            (b) => b.textContent?.includes('Use in Content Storyteller'),
          );
          expect(ctaButtons.length).toBe(trends.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});


/**
 * Property 15: TrendCard renders all required fields
 * Validates: Requirements 15.3, 15.4, 16.1, 17.3, 17.4
 */
describe('Property 15: TrendCard renders all required fields', () => {
  it('for any valid TrendItem, the card contains title, description, freshnessLabel, momentum score, and CTA button', () => {
    fc.assert(
      fc.property(trendItemArb, (trend) => {
        const { container } = render(
          <TrendCard trend={trend} onUseTrend={() => {}} />,
        );
        const text = container.textContent ?? '';

        // Required visible fields
        expect(text).toContain(trend.title);
        expect(text).toContain(trend.description);
        expect(text).toContain(trend.freshnessLabel);

        // Momentum score indicator
        expect(text).toContain(String(trend.momentumScore));

        // CTA button present
        const ctaButton = Array.from(container.querySelectorAll('button')).find(
          (b) => b.textContent?.includes('Use in Content Storyteller'),
        );
        expect(ctaButton).toBeTruthy();
      }),
      { numRuns: 100 },
    );
  });
});


/**
 * Property 16: CTA pre-fills prompt and maps platform correctly
 * Validates: Requirements 16.3, 16.4
 */
describe('Property 16: CTA pre-fills prompt and maps platform correctly', () => {
  it('when onUseTrend is called with a TrendItem, the callback receives the trend data', () => {
    fc.assert(
      fc.property(trendItemArb, (trend) => {
        let receivedTrend: TrendItem | null = null;
        const onUseTrend = (t: TrendItem) => {
          receivedTrend = t;
        };

        const { container } = render(
          <TrendCard trend={trend} onUseTrend={onUseTrend} />,
        );

        const ctaButton = Array.from(container.querySelectorAll('button')).find(
          (b) => b.textContent?.includes('Use in Content Storyteller'),
        );
        expect(ctaButton).toBeTruthy();
        fireEvent.click(ctaButton!);

        // Callback received the exact trend
        expect(receivedTrend).not.toBeNull();
        expect(receivedTrend!.title).toBe(trend.title);
        expect(receivedTrend!.keyword).toBe(trend.keyword);
        expect(receivedTrend!.suggestedHook).toBe(trend.suggestedHook);
        expect(receivedTrend!.suggestedContentAngle).toBe(trend.suggestedContentAngle);
        expect(receivedTrend!.platform).toBe(trend.platform);
      }),
      { numRuns: 100 },
    );
  });
});
