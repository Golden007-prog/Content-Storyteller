/**
 * Bug Condition Exploration Property Tests — Media Routing & Worker Hygiene
 *
 * Property 1: Bug Condition — outputPreference Drop, SSE Metadata Ignored
 *
 * These tests encode the EXPECTED (correct) behavior.
 * They test the ACTUAL App.tsx code by rendering the App component
 * and verifying the real handleStartJob and handleStateChange callbacks.
 *
 * **Validates: Requirements 1.2, 1.4**
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fc from 'fast-check';
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { OutputPreference, JobState } from '@content-storyteller/shared';

// ── Hoisted mocks ───────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const startJobMock = vi.fn().mockResolvedValue('job-123');
  let capturedOnStartJob: ((...args: any[]) => any) | null = null;
  let capturedSseCallbacks: Record<string, Function> = {};
  let useJobPhase = 'idle';
  let useJobJobId: string | null = null;

  return {
    startJobMock,
    capturedOnStartJob,
    capturedSseCallbacks,
    useJobPhase,
    useJobJobId,
  };
});

// Mock useJob hook to capture startJob calls
vi.mock('../hooks/useJob', () => ({
  useJob: () => ({
    phase: mocks.useJobPhase,
    jobId: mocks.useJobJobId,
    error: null,
    startJob: mocks.startJobMock,
    refreshJob: vi.fn(),
    setPhase: vi.fn(),
  }),
}));

// Mock useSSE hook to capture SSE callbacks
vi.mock('../hooks/useSSE', () => ({
  useSSE: (opts: any) => {
    if (opts.callbacks) {
      mocks.capturedSseCallbacks = opts.callbacks;
    }
  },
}));

// Mock api client
vi.mock('../api/client', () => ({
  getAssets: vi.fn().mockResolvedValue({ bundle: { assets: [] } }),
}));

// Mock LandingPage to capture the onStartJob prop
vi.mock('../components/LandingPage', () => ({
  LandingPage: (props: any) => {
    mocks.capturedOnStartJob = props.onStartJob;
    return React.createElement('div', { 'data-testid': 'landing-page' }, 'LandingPage');
  },
}));

// Mock other components to keep rendering simple
vi.mock('../components/GenerationTimeline', () => ({
  GenerationTimeline: () => null,
}));
vi.mock('../components/OutputDashboard', () => ({
  OutputDashboard: (props: any) => {
    return React.createElement('div', {
      'data-testid': 'output-dashboard',
      'data-requested-outputs': JSON.stringify(props.requestedOutputs ?? null),
      'data-skipped-outputs': JSON.stringify(props.skippedOutputs ?? null),
    });
  },
}));
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

/**
 * Test 1a: handleStartJob forwards the 5th outputPreference parameter (Defect 2)
 *
 * **Validates: Requirements 1.2**
 */
describe('Test 1a (PBT): handleStartJob forwards outputPreference', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.capturedOnStartJob = null;
    mocks.useJobPhase = 'idle';
    mocks.useJobJobId = null;
  });

  const nonAutoOutputPreference = fc.constantFrom(
    OutputPreference.CopyOnly,
    OutputPreference.CopyImage,
    OutputPreference.CopyVideo,
    OutputPreference.CopyGif,
    OutputPreference.FullPackage,
  );

  it('for any non-Auto OutputPreference, handleStartJob forwards it to startJob', async () => {
    const values = fc.sample(nonAutoOutputPreference, 10);

    for (const outputPref of values) {
      vi.clearAllMocks();
      mocks.capturedOnStartJob = null;
      mocks.useJobPhase = 'idle';

      const { unmount } = render(React.createElement(App));

      // The mock LandingPage captures onStartJob from App
      expect(mocks.capturedOnStartJob).not.toBeNull();

      // Call onStartJob with 5 args, just like LandingPage does on form submit
      await act(async () => {
        await mocks.capturedOnStartJob!(
          [],
          'test prompt',
          'instagram_reel',
          'cinematic',
          outputPref,
        );
      });

      // EXPECTED (correct) behavior: startJob should receive outputPreference as 5th arg
      const callArgs = mocks.startJobMock.mock.calls[0];
      expect(callArgs).toBeDefined();
      expect(callArgs.length).toBe(5);
      expect(callArgs[4]).toBe(outputPref);

      unmount();
    }
  });
});

/**
 * Test 1b: SSE state_change metadata (requestedOutputs/skippedOutputs) is extracted (Defect 3)
 *
 * **Validates: Requirements 1.4**
 */
describe('Test 1b (PBT): SSE state_change extracts requestedOutputs and skippedOutputs', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.capturedSseCallbacks = {};
    mocks.useJobPhase = 'idle';
    mocks.useJobJobId = null;
  });

  const requestedOutputsArb = fc.subarray(
    ['copy', 'image', 'video', 'gif', 'storyboard', 'voiceover', 'hashtags'],
    { minLength: 1 },
  );

  const skippedOutputsArb = fc.subarray(
    ['image', 'video', 'gif', 'storyboard', 'voiceover'],
    { minLength: 0 },
  );

  it('for any SSE state_change with requestedOutputs/skippedOutputs, App stores them in state', () => {
    // Set phase to streaming so the generating view renders with OutputDashboard
    mocks.useJobPhase = 'streaming';
    mocks.useJobJobId = 'test-job-123';

    const values = fc.sample(
      fc.tuple(requestedOutputsArb, skippedOutputsArb),
      10,
    );

    for (const [requested, skipped] of values) {
      mocks.capturedSseCallbacks = {};

      const { unmount, container } = render(React.createElement(App));

      // The useSSE mock captures the callbacks
      expect(mocks.capturedSseCallbacks.onStateChange).toBeDefined();

      // Simulate SSE state_change event with metadata
      act(() => {
        mocks.capturedSseCallbacks.onStateChange!({
          jobId: 'test-job-123',
          state: JobState.GeneratingImages,
          timestamp: new Date().toISOString(),
          requestedOutputs: requested,
          skippedOutputs: skipped,
        });
      });

      // Verify OutputDashboard received the props
      const dashboard = container.querySelector('[data-testid="output-dashboard"]');
      expect(dashboard).not.toBeNull();

      const receivedRequested = JSON.parse(
        dashboard!.getAttribute('data-requested-outputs') || 'null',
      );
      const receivedSkipped = JSON.parse(
        dashboard!.getAttribute('data-skipped-outputs') || 'null',
      );

      // EXPECTED (correct) behavior: requestedOutputs and skippedOutputs should be passed through
      expect(receivedRequested).toEqual(requested);
      expect(receivedSkipped).toEqual(skipped);

      unmount();
    }
  });
});
