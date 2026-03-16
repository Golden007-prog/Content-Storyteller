/**
 * Bug Condition Exploration Property Tests — Asset Delivery & Rendering (Frontend)
 *
 * Property 1: Bug Condition — GeneratingGif Missing from Timeline & Warnings Not Passed
 *
 * These tests encode the EXPECTED (correct) behavior.
 * They are EXPECTED TO FAIL on unfixed code, confirming the bugs exist.
 *
 * Test E: GeneratingGif must appear as active in GenerationTimeline
 * Test F: App.tsx must pass warnings to OutputDashboard
 *
 * **Validates: Requirements 1.6, 1.7**
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fc from 'fast-check';
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { JobState } from '@content-storyteller/shared';
import type { JobWarning } from '@content-storyteller/shared';

// ── Test E: GeneratingGif missing from timeline ─────────────────────

describe('Test E (PBT): GeneratingGif must show as active in GenerationTimeline', () => {
  afterEach(() => {
    cleanup();
  });

  it('when currentState is GeneratingGif, at least one stage shows as active', async () => {
    /**
     * **Validates: Requirements 1.7**
     *
     * Render GenerationTimeline with currentState = JobState.GeneratingGif.
     * Assert that at least one stage shows as active (has "In progress…" text).
     *
     * WILL FAIL on unfixed code: GeneratingGif is not in PIPELINE_STAGES,
     * so no stage shows as active.
     */
    // Import the REAL GenerationTimeline (vi.mock for Test F is hoisted, so we use importActual)
    const { GenerationTimeline: RealTimeline } = await vi.importActual<typeof import('../components/GenerationTimeline')>('../components/GenerationTimeline');

    const { container } = render(
      React.createElement(RealTimeline, { currentState: JobState.GeneratingGif }),
    );

    // Look for the "In progress…" text that indicates an active stage
    const activeIndicators = container.querySelectorAll('p');
    const inProgressTexts = Array.from(activeIndicators).filter(
      (p) => p.textContent?.includes('In progress'),
    );

    // EXPECTED: at least one stage should show "In progress…"
    // WILL FAIL on unfixed code: no stage is active because GeneratingGif is not in PIPELINE_STAGES
    expect(inProgressTexts.length).toBeGreaterThan(0);
  });
});

// ── Test F: App.tsx missing warnings ────────────────────────────────

// Hoisted mocks for App component
const appMocks = vi.hoisted(() => {
  const startJobMock = vi.fn().mockResolvedValue('job-123');
  let capturedSseCallbacks: Record<string, Function> = {};
  let capturedWarnings: JobWarning[] | undefined = undefined;

  return {
    startJobMock,
    capturedSseCallbacks,
    capturedWarnings,
  };
});

// Mock useJob hook
vi.mock('../hooks/useJob', () => ({
  useJob: () => ({
    phase: 'streaming',
    jobId: 'test-job-123',
    error: null,
    startJob: appMocks.startJobMock,
    refreshJob: vi.fn(),
    setPhase: vi.fn(),
  }),
}));

// Mock useSSE hook to capture SSE callbacks
vi.mock('../hooks/useSSE', () => ({
  useSSE: (opts: any) => {
    if (opts.callbacks) {
      appMocks.capturedSseCallbacks = opts.callbacks;
    }
  },
}));

// Mock api client
vi.mock('../api/client', () => ({
  getAssets: vi.fn().mockResolvedValue({ bundle: { assets: [] } }),
}));

// Mock LandingPage
vi.mock('../components/LandingPage', () => ({
  LandingPage: () => React.createElement('div', { 'data-testid': 'landing-page' }),
}));

// Mock GenerationTimeline
vi.mock('../components/GenerationTimeline', () => ({
  GenerationTimeline: () => null,
}));

// Mock OutputDashboard to capture the warnings prop
vi.mock('../components/OutputDashboard', () => ({
  OutputDashboard: (props: any) => {
    appMocks.capturedWarnings = props.warnings;
    return React.createElement('div', {
      'data-testid': 'output-dashboard',
      'data-warnings': JSON.stringify(props.warnings ?? null),
    });
  },
}));

// Mock other components
vi.mock('../components/ExportPanel', () => ({
  ExportPanel: () => null,
}));
vi.mock('../components/LiveAgentPanel', () => ({
  LiveAgentPanel: () => null,
}));
vi.mock('../components/TrendAnalyzerPage', () => ({
  TrendAnalyzerPage: () => null,
}));

import App from '../App';

describe('Test F (PBT): App.tsx must pass warnings to OutputDashboard', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    appMocks.capturedSseCallbacks = {};
    appMocks.capturedWarnings = undefined;
  });

  it('when SSE state_change includes warnings, OutputDashboard receives them as a prop', () => {
    /**
     * **Validates: Requirements 1.6**
     *
     * Render App in streaming/generating view with warnings in SSE state.
     * Assert OutputDashboard receives the warnings prop.
     *
     * WILL FAIL on unfixed code: App.tsx never passes warnings to OutputDashboard.
     */
    const warningArb = fc.record({
      stage: fc.constant('GenerateVideo'),
      message: fc.constantFrom(
        'Video generation returned no video: video-generation-timeout',
        'Video generation failed',
      ),
      timestamp: fc.date(),
      severity: fc.constantFrom('warning' as const, 'info' as const),
    });

    const warningsArrayArb = fc.array(warningArb, { minLength: 1, maxLength: 3 });
    const samples = fc.sample(warningsArrayArb, 5);

    for (const warnings of samples) {
      appMocks.capturedSseCallbacks = {};
      appMocks.capturedWarnings = undefined;

      const { unmount, container } = render(React.createElement(App));

      // The useSSE mock captures the callbacks
      expect(appMocks.capturedSseCallbacks.onStateChange).toBeDefined();

      // Simulate SSE state_change event with warnings
      act(() => {
        appMocks.capturedSseCallbacks.onStateChange!({
          jobId: 'test-job-123',
          state: JobState.GeneratingVideo,
          timestamp: new Date().toISOString(),
          warnings: warnings.map(w => ({ ...w, timestamp: w.timestamp.toISOString() })),
        });
      });

      // Verify OutputDashboard received the warnings prop
      const dashboard = container.querySelector('[data-testid="output-dashboard"]');
      expect(dashboard).not.toBeNull();

      const receivedWarnings = JSON.parse(
        dashboard!.getAttribute('data-warnings') || 'null',
      );

      // EXPECTED: warnings should be passed through to OutputDashboard
      // WILL FAIL on unfixed code: warnings are never passed, so receivedWarnings is null
      expect(receivedWarnings).not.toBeNull();
      expect(Array.isArray(receivedWarnings)).toBe(true);
      expect(receivedWarnings.length).toBeGreaterThan(0);

      unmount();
    }
  });
});
