import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TrendPlatform } from '@content-storyteller/shared';
import type { TrendItem, TrendAnalysisResult, FreshnessLabel } from '@content-storyteller/shared';
import { TrendFilters } from '../components/TrendFilters';
import { TrendResults } from '../components/TrendResults';
import { TrendSummary } from '../components/TrendSummary';
import { TrendCard } from '../components/TrendCard';

afterEach(() => {
  cleanup();
});

/* ── Helper: build a mock TrendItem ────────────────────────────── */

function buildMockTrendItem(overrides: Partial<TrendItem> = {}): TrendItem {
  return {
    title: 'AI-Powered Dev Tools',
    keyword: 'ai-devtools',
    description: 'Developer tools leveraging AI are surging in popularity.',
    momentumScore: 85,
    relevanceScore: 90,
    suggestedHashtags: ['#AIDevTools', '#CodingAI'],
    suggestedHook: 'The future of coding is here — AI tools that write code for you.',
    suggestedContentAngle: 'Showcase how AI dev tools boost productivity by 10x.',
    sourceLabels: ['gemini'],
    region: { scope: 'global' },
    platform: TrendPlatform.InstagramReels,
    freshnessLabel: 'Fresh',
    ...overrides,
  };
}

function buildMockResult(overrides: Partial<TrendAnalysisResult> = {}): TrendAnalysisResult {
  return {
    queryId: 'q-123',
    platform: TrendPlatform.InstagramReels,
    domain: 'tech',
    region: { scope: 'global' },
    generatedAt: new Date().toISOString(),
    summary: 'Tech trends are dominated by AI tooling this week.',
    trends: [buildMockTrendItem()],
    ...overrides,
  };
}

/* ── TrendFilters ──────────────────────────────────────────────── */

describe('TrendFilters', () => {
  it('renders all platform options as pill buttons', () => {
    const { container } = render(<TrendFilters onSubmit={() => {}} isLoading={false} />);
    const buttons = Array.from(container.querySelectorAll('button[type="button"]'));
    const buttonTexts = buttons.map((b) => b.textContent);

    expect(buttonTexts).toContain('Instagram');
    expect(buttonTexts).toContain('Twitter');
    expect(buttonTexts).toContain('LinkedIn');
    expect(buttonTexts).toContain('All');
  });

  it('renders all domain preset options as pill buttons', () => {
    const { container } = render(<TrendFilters onSubmit={() => {}} isLoading={false} />);
    const buttons = Array.from(container.querySelectorAll('button[type="button"]'));
    const buttonTexts = buttons.map((b) => b.textContent);

    const expectedPresets = ['Tech', 'Fashion', 'Finance', 'Fitness', 'Education', 'Gaming', 'Startup'];
    for (const preset of expectedPresets) {
      expect(buttonTexts).toContain(preset);
    }
  });

  it('renders all region scope options as pill buttons', () => {
    const { container } = render(<TrendFilters onSubmit={() => {}} isLoading={false} />);
    const buttons = Array.from(container.querySelectorAll('button[type="button"]'));
    const buttonTexts = buttons.map((b) => b.textContent);

    expect(buttonTexts).toContain('Global');
    expect(buttonTexts).toContain('Country');
    expect(buttonTexts).toContain('State/Province');
  });
});


/* ── TrendResults — loading state ──────────────────────────────── */

describe('TrendResults — loading state', () => {
  it('renders skeleton placeholders when isLoading is true', () => {
    const { container } = render(
      <TrendResults result={null} isLoading={true} onUseTrend={() => {}} />,
    );
    const skeletons = container.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

/* ── TrendResults — empty state ────────────────────────────────── */

describe('TrendResults — empty state', () => {
  it('renders empty message when result has zero trends', () => {
    const result = buildMockResult({ trends: [] });
    const { container } = render(
      <TrendResults result={result} isLoading={false} onUseTrend={() => {}} />,
    );
    expect(container.textContent).toContain('No trends found');
  });
});

/* ── TrendSummary ──────────────────────────────────────────────── */

describe('TrendSummary', () => {
  it('renders the summary text', () => {
    const summaryText = 'AI and sustainability dominate the tech landscape this week.';
    render(<TrendSummary summary={summaryText} />);
    expect(screen.getByText(summaryText)).toBeDefined();
  });

  it('renders the heading', () => {
    render(<TrendSummary summary="Some summary" />);
    expect(screen.getByText(/Trend Landscape/)).toBeDefined();
  });
});

/* ── TrendCard — freshness label badge colors ──────────────────── */

describe('TrendCard — freshness label badge colors', () => {
  const colorMap: Record<FreshnessLabel, string> = {
    Fresh: 'bg-green-100',
    'Rising Fast': 'bg-brand-100',
    Established: 'bg-gray-100',
    Fading: 'bg-orange-100',
  };

  for (const [label, expectedClass] of Object.entries(colorMap)) {
    it(`renders ${label} badge with ${expectedClass}`, () => {
      const trend = buildMockTrendItem({ freshnessLabel: label as FreshnessLabel });
      const { container } = render(<TrendCard trend={trend} onUseTrend={() => {}} />);

      const badge = Array.from(container.querySelectorAll('span')).find(
        (el) => el.textContent === label,
      );
      expect(badge).toBeTruthy();
      expect(badge!.className).toContain(expectedClass);
    });
  }
});

/* ── TrendCard — momentum score indicator ──────────────────────── */

describe('TrendCard — momentum score indicator', () => {
  it('renders momentum score text', () => {
    const trend = buildMockTrendItem({ momentumScore: 72 });
    const { container } = render(<TrendCard trend={trend} onUseTrend={() => {}} />);
    expect(container.textContent).toContain('72/100');
  });

  it('renders momentum progress bar with correct width', () => {
    const trend = buildMockTrendItem({ momentumScore: 60 });
    const { container } = render(<TrendCard trend={trend} onUseTrend={() => {}} />);
    const progressBar = container.querySelector('[style*="width"]') as HTMLElement;
    expect(progressBar).toBeTruthy();
    expect(progressBar.style.width).toBe('60%');
  });
});

/* ── TrendCard — "Use in Content Storyteller" CTA ──────────────── */

describe('TrendCard — Use in Content Storyteller CTA', () => {
  it('triggers callback with trend data when clicked', () => {
    const onUseTrend = vi.fn();
    const trend = buildMockTrendItem();
    const { container } = render(<TrendCard trend={trend} onUseTrend={onUseTrend} />);

    const ctaButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Use in Content Storyteller'),
    );
    expect(ctaButton).toBeTruthy();
    fireEvent.click(ctaButton!);

    expect(onUseTrend).toHaveBeenCalledTimes(1);
    expect(onUseTrend).toHaveBeenCalledWith(trend);
  });
});

/* ── App.tsx — mode toggle has 3 buttons ───────────────────────── */

describe('App.tsx — mode toggle includes trends mode', () => {
  it('renders Batch Mode, Live Agent, and Trend Analyzer buttons', async () => {
    // Dynamic import to avoid side-effects from App's hooks
    const { default: App } = await import('../App');
    const { container } = render(<App />);

    const buttons = Array.from(container.querySelectorAll('button'));
    const batchBtn = buttons.find((b) => b.textContent?.includes('Batch Mode'));
    const liveBtn = buttons.find((b) => b.textContent?.includes('Live Agent'));
    const trendsBtn = buttons.find((b) => b.textContent?.includes('Trend Analyzer'));

    expect(batchBtn).toBeTruthy();
    expect(liveBtn).toBeTruthy();
    expect(trendsBtn).toBeTruthy();
  });
});
