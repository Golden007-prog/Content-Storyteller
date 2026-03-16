/**
 * Bug Condition Exploration Property Tests — Asset Preview URL & Rendering (Frontend)
 *
 * Property 1: Bug Condition — Asset Preview URL & Rendering Failures
 *
 * These tests encode the EXPECTED (correct) behavior.
 * They are EXPECTED TO FAIL on unfixed code, confirming the bugs exist.
 *
 * Test Bug2: handleStateChange must store SSE assets in state
 * Test Bug3: handlePartialResult must extract partialGifAsset
 * Test Bug4: App.tsx must pass gifAsset prop to OutputDashboard
 * Test Bug5: VisualDirection must render <img> tags for image URLs
 * Test Bug6: handleComplete must extract renderable image URLs for preview
 * Test Bug7: ExportPanel must disable download link for empty signedUrl
 * Test Bug8: VideoBriefView must render timeout message when videoBrief is missing
 *
 * **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8**
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fc from 'fast-check';
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { AssetType, JobState } from '@content-storyteller/shared';
import type { AssetReferenceWithUrl, GifAssetMetadata } from '@content-storyteller/shared';

// ── Test Bug5: VisualDirection image rendering ──────────────────────

describe('Test Bug5 (PBT): VisualDirection must render <img> tags for image URLs', () => {
  afterEach(() => {
    cleanup();
  });

  it('when imageUrls prop has entries, <img> tags are rendered for each URL', async () => {
    /**
     * **Validates: Requirements 1.5**
     *
     * Render VisualDirection with an imageUrls prop containing valid image URLs.
     * Assert that <img> tags are rendered for each URL.
     *
     * WILL FAIL on unfixed code: VisualDirection has no imageUrls prop and
     * only renders text concept cards — no <img> tags exist.
     */
    const imageUrlsArb = fc.array(
      fc.constant('https://storage.example.com').chain((base) =>
        fc.uuid().map((id) => `${base}/${id}.png`),
      ),
      { minLength: 1, maxLength: 4 },
    );
    const samples = fc.sample(imageUrlsArb, 5);

    // Import the real VisualDirection component (bypassing vi.mock)
    const { VisualDirection } = await vi.importActual<typeof import('../components/VisualDirection')>('../components/VisualDirection');

    for (const imageUrls of samples) {
      const { container, unmount } = render(
        React.createElement(VisualDirection, {
          imageConcepts: [],
          imageUrls,
        } as any),
      );

      const imgTags = container.querySelectorAll('img');

      // EXPECTED: at least one <img> tag for each image URL
      // WILL FAIL on unfixed code: VisualDirection has no imageUrls prop,
      // so no <img> tags are rendered
      expect(imgTags.length).toBeGreaterThanOrEqual(imageUrls.length);

      // Each image URL should appear as an img src
      for (const url of imageUrls) {
        const matchingImg = Array.from(imgTags).find((img) => img.getAttribute('src') === url);
        expect(matchingImg).toBeDefined();
      }

      unmount();
    }
  });
});

// ── Test Bug7: ExportPanel empty URL handling ───────────────────────

describe('Test Bug7 (PBT): ExportPanel must disable download link for empty signedUrl', () => {
  afterEach(() => {
    cleanup();
  });

  it('when an asset has signedUrl="", download link must not have href=""', async () => {
    /**
     * **Validates: Requirements 1.7**
     *
     * Render ExportPanel with assets that have empty signedUrl.
     * Assert that download links do NOT have href="" (which would navigate to current page).
     * Instead, they should be disabled or show an unavailable state.
     *
     * WILL FAIL on unfixed code: ExportPanel renders <a href="" download>
     * for assets with empty signedUrl.
     */
    const assetWithEmptyUrlArb = fc.record({
      assetId: fc.uuid(),
      jobId: fc.constant('test-job'),
      assetType: fc.constantFrom(AssetType.Image, AssetType.Video, AssetType.Gif),
      storagePath: fc.constant('job-123/images/test.png'),
      generationTimestamp: fc.date(),
      status: fc.constant('completed' as const),
      signedUrl: fc.constant(''),
    });

    const assetsArb = fc.array(assetWithEmptyUrlArb, { minLength: 1, maxLength: 3 });
    const samples = fc.sample(assetsArb, 5);

    // Import the real ExportPanel (bypassing vi.mock)
    const { ExportPanel: RealExportPanel } = await vi.importActual<typeof import('../components/ExportPanel')>('../components/ExportPanel');

    for (const assets of samples) {
      const { container, unmount } = render(
        React.createElement(RealExportPanel, {
          jobId: 'test-job',
          assets,
        }),
      );

      // Find all download links
      const downloadLinks = container.querySelectorAll('a[download]');

      for (const link of Array.from(downloadLinks)) {
        const href = link.getAttribute('href');
        // EXPECTED: download links should NOT have href="" for empty signedUrl
        // They should either be absent, disabled, or have a non-empty href
        // WILL FAIL on unfixed code: href="" is rendered, causing navigation to current page
        expect(href).not.toBe('');
      }

      unmount();
    }
  });
});

// ── Test Bug8: VideoBriefView timeout with missing videoBrief ───────

describe('Test Bug8 (PBT): VideoBriefView must render timeout message when videoBrief is missing', () => {
  afterEach(() => {
    cleanup();
  });

  it('when videoStatus=timeout and videoBrief has no content, timeout message is visible', async () => {
    /**
     * **Validates: Requirements 1.8**
     *
     * Render VideoBriefView with videoStatus='timeout' and an empty videoBrief.
     * Assert that the timeout message ("timed out") is rendered clearly.
     *
     * WILL FAIL on unfixed code: When videoBrief has no content (hasContent=false),
     * the component shows "No video brief available yet" text after the status message,
     * and the timeout message may not be clearly visible or the component may not
     * render the timeout-specific fallback when videoBrief data is completely absent.
     */
    // Import the real VideoBriefView (bypassing vi.mock)
    const { VideoBriefView: RealVideoBriefView } = await vi.importActual<typeof import('../components/VideoBriefView')>('../components/VideoBriefView');

    // Empty videoBrief — no content fields set
    const emptyBriefs = [
      {},
      { totalDuration: undefined, motionStyle: undefined },
    ];

    for (const emptyBrief of emptyBriefs) {
      const { container, unmount } = render(
        React.createElement(RealVideoBriefView, {
          videoBrief: emptyBrief,
          videoUrl: undefined,
          videoStatus: 'timeout',
        }),
      );

      const textContent = container.textContent || '';

      // EXPECTED: The timeout message should be clearly visible
      // WILL FAIL on unfixed code: The component renders the status message
      // but then also shows "No video brief available yet" which is confusing.
      // The timeout message should be the primary visible message.
      const hasTimeoutMessage = textContent.includes('timed out');
      expect(hasTimeoutMessage).toBe(true);

      // The "No video brief available yet" text should NOT appear when we have a timeout
      // because the timeout IS the explanation — showing both is confusing
      const hasNoDataMessage = textContent.includes('No video brief available yet');
      expect(hasNoDataMessage).toBe(false);

      unmount();
    }
  });
});


// ══════════════════════════════════════════════════════════════════════
// App.tsx SSE handler tests (Bug2, Bug3, Bug4, Bug6)
// These require mocking useJob, useSSE, and child components
// ══════════════════════════════════════════════════════════════════════

// Hoisted mocks for App component
const appMocks = vi.hoisted(() => {
  let capturedSseCallbacks: Record<string, Function> = {};
  let capturedDashboardProps: Record<string, unknown> = {};
  let capturedAssets: AssetReferenceWithUrl[] = [];

  return {
    capturedSseCallbacks,
    capturedDashboardProps,
    capturedAssets,
  };
});

// Mock useJob hook
vi.mock('../hooks/useJob', () => ({
  useJob: () => ({
    phase: 'streaming',
    jobId: 'test-job-123',
    error: null,
    startJob: vi.fn().mockResolvedValue('test-job-123'),
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

// Mock api client — getAssets returns renderable assets
vi.mock('../api/client', () => ({
  getAssets: vi.fn().mockResolvedValue({
    bundle: {
      assets: [
        {
          assetId: 'img-1',
          jobId: 'test-job-123',
          assetType: 'image',
          storagePath: 'test-job-123/images/img1.png',
          generationTimestamp: new Date(),
          status: 'completed',
          signedUrl: 'https://storage.example.com/signed-img1.png',
        },
        {
          assetId: 'gif-1',
          jobId: 'test-job-123',
          assetType: 'gif',
          storagePath: 'test-job-123/gif/anim.gif',
          generationTimestamp: new Date(),
          status: 'completed',
          signedUrl: 'https://storage.example.com/signed-anim.gif',
        },
      ],
    },
  }),
}));

// Mock LandingPage
vi.mock('../components/LandingPage', () => ({
  LandingPage: () => React.createElement('div', { 'data-testid': 'landing-page' }),
}));

// Mock GenerationTimeline
vi.mock('../components/GenerationTimeline', () => ({
  GenerationTimeline: () => null,
}));

// Mock OutputDashboard to capture all props
vi.mock('../components/OutputDashboard', () => ({
  OutputDashboard: (props: any) => {
    appMocks.capturedDashboardProps = { ...props };
    return React.createElement('div', {
      'data-testid': 'output-dashboard',
      'data-gif-asset': JSON.stringify(props.gifAsset ?? null),
      'data-image-urls': JSON.stringify(props.imageUrls ?? null),
    });
  },
}));

// Mock ExportPanel to capture assets
vi.mock('../components/ExportPanel', () => ({
  ExportPanel: (props: any) => {
    appMocks.capturedAssets = props.assets || [];
    return React.createElement('div', { 'data-testid': 'export-panel' });
  },
}));

vi.mock('../components/LiveAgentPanel', () => ({
  LiveAgentPanel: () => null,
}));
vi.mock('../components/TrendAnalyzerPage', () => ({
  TrendAnalyzerPage: () => null,
}));

import App from '../App';

// ── Test Bug2: handleStateChange discards SSE assets ────────────────

describe('Test Bug2 (PBT): handleStateChange must store SSE assets in state', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    appMocks.capturedSseCallbacks = {};
    appMocks.capturedDashboardProps = {};
  });

  it('when SSE state_change includes assets array, assets are stored and available', () => {
    /**
     * **Validates: Requirements 1.2**
     *
     * Render App in streaming/generating view.
     * Simulate SSE state_change event with signed assets array.
     * Assert that the assets are stored in state (passed to OutputDashboard or available).
     *
     * WILL FAIL on unfixed code: handleStateChange extracts state, requestedOutputs,
     * skippedOutputs, warnings but never reads data.assets.
     */
    const signedAssetArb = fc.record({
      assetId: fc.uuid(),
      jobId: fc.constant('test-job-123'),
      assetType: fc.constantFrom(AssetType.Image, AssetType.Video, AssetType.Gif),
      storagePath: fc.constant('test/path/file.png'),
      generationTimestamp: fc.date(),
      status: fc.constant('completed' as const),
      signedUrl: fc.webUrl({ withFragments: false, withQueryParameters: false }),
    });

    const assetsArb = fc.array(signedAssetArb, { minLength: 1, maxLength: 4 });
    const samples = fc.sample(assetsArb, 5);

    for (const assets of samples) {
      appMocks.capturedSseCallbacks = {};
      appMocks.capturedDashboardProps = {};

      const { unmount } = render(React.createElement(App));

      expect(appMocks.capturedSseCallbacks.onStateChange).toBeDefined();

      // Simulate SSE state_change event with assets
      act(() => {
        appMocks.capturedSseCallbacks.onStateChange!({
          jobId: 'test-job-123',
          state: JobState.GeneratingImages,
          timestamp: new Date().toISOString(),
          assets: assets.map((a) => ({
            ...a,
            generationTimestamp: a.generationTimestamp.toISOString(),
          })),
        });
      });

      // EXPECTED: OutputDashboard should receive imageUrls derived from the assets
      // or the assets should be stored in state for preview rendering
      const dashboardImageUrls = appMocks.capturedDashboardProps.imageUrls as string[] | undefined;

      // At minimum, the image assets' signedUrls should be available for preview
      const imageAssets = assets.filter((a) => a.assetType === AssetType.Image);
      if (imageAssets.length > 0) {
        // WILL FAIL on unfixed code: imageUrls is undefined because handleStateChange
        // never reads data.assets
        expect(dashboardImageUrls).toBeDefined();
        expect(Array.isArray(dashboardImageUrls)).toBe(true);
        expect(dashboardImageUrls!.length).toBeGreaterThan(0);
      }

      unmount();
    }
  });
});

// ── Test Bug3: handlePartialResult ignores partialGifAsset ──────────

describe('Test Bug3 (PBT): handlePartialResult must extract partialGifAsset', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    appMocks.capturedSseCallbacks = {};
    appMocks.capturedDashboardProps = {};
  });

  it('when SSE partial_result includes partialGifAsset, gifAsset state is populated', () => {
    /**
     * **Validates: Requirements 1.3**
     *
     * Render App in streaming/generating view.
     * Simulate SSE partial_result event with partialGifAsset.
     * Assert that gifAsset is stored in state and passed to OutputDashboard.
     *
     * WILL FAIL on unfixed code: handlePartialResult has no branch for
     * data.partialGifAsset, so it's discarded.
     */
    const gifMetadataArb = fc.record({
      url: fc.webUrl({ withFragments: false, withQueryParameters: false }),
      mimeType: fc.constant('image/gif' as const),
      width: fc.integer({ min: 100, max: 800 }),
      height: fc.integer({ min: 100, max: 600 }),
      durationMs: fc.integer({ min: 500, max: 5000 }),
      loop: fc.boolean(),
      fileSizeBytes: fc.integer({ min: 1000, max: 5000000 }),
    });

    const samples = fc.sample(gifMetadataArb, 5);

    for (const gifMetadata of samples) {
      appMocks.capturedSseCallbacks = {};
      appMocks.capturedDashboardProps = {};

      const { unmount, container } = render(React.createElement(App));

      expect(appMocks.capturedSseCallbacks.onPartialResult).toBeDefined();

      // Simulate SSE partial_result event with partialGifAsset
      act(() => {
        appMocks.capturedSseCallbacks.onPartialResult!({
          jobId: 'test-job-123',
          state: JobState.ComposingPackage,
          timestamp: new Date().toISOString(),
          partialGifAsset: gifMetadata,
        });
      });

      // Check OutputDashboard received gifAsset prop
      const dashboard = container.querySelector('[data-testid="output-dashboard"]');
      expect(dashboard).not.toBeNull();

      const receivedGifAsset = JSON.parse(
        dashboard!.getAttribute('data-gif-asset') || 'null',
      );

      // EXPECTED: gifAsset should be populated with the partialGifAsset data
      // WILL FAIL on unfixed code: handlePartialResult ignores partialGifAsset,
      // so gifAsset is always null
      expect(receivedGifAsset).not.toBeNull();
      expect(receivedGifAsset.url).toBe(gifMetadata.url);
      expect(receivedGifAsset.width).toBe(gifMetadata.width);
      expect(receivedGifAsset.height).toBe(gifMetadata.height);

      unmount();
    }
  });
});

// ── Test Bug4: No gifAsset state in App.tsx ─────────────────────────

describe('Test Bug4 (PBT): App.tsx must pass gifAsset prop to OutputDashboard', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    appMocks.capturedSseCallbacks = {};
    appMocks.capturedDashboardProps = {};
  });

  it('when GIF metadata exists from SSE, OutputDashboard receives gifAsset prop', () => {
    /**
     * **Validates: Requirements 1.4**
     *
     * Render App, simulate SSE events that provide GIF metadata.
     * Assert OutputDashboard receives a defined gifAsset prop.
     *
     * WILL FAIL on unfixed code: App.tsx has no gifAsset state variable,
     * so OutputDashboard never receives gifAsset prop.
     */
    const { unmount, container } = render(React.createElement(App));

    expect(appMocks.capturedSseCallbacks.onPartialResult).toBeDefined();

    // Simulate SSE partial_result with GIF metadata
    act(() => {
      appMocks.capturedSseCallbacks.onPartialResult!({
        jobId: 'test-job-123',
        state: JobState.ComposingPackage,
        timestamp: new Date().toISOString(),
        partialGifAsset: {
          url: 'https://storage.example.com/signed-gif.gif',
          mimeType: 'image/gif',
          width: 320,
          height: 240,
          durationMs: 2000,
          loop: true,
          fileSizeBytes: 50000,
        },
      });
    });

    const dashboard = container.querySelector('[data-testid="output-dashboard"]');
    expect(dashboard).not.toBeNull();

    const gifAssetStr = dashboard!.getAttribute('data-gif-asset');
    const gifAsset = JSON.parse(gifAssetStr || 'null');

    // EXPECTED: gifAsset prop should be defined and contain the GIF metadata
    // WILL FAIL on unfixed code: no gifAsset state exists in App.tsx
    expect(gifAsset).not.toBeNull();
    expect(gifAsset.url).toBe('https://storage.example.com/signed-gif.gif');

    unmount();
  });
});

// ── Test Bug6: handleComplete doesn't extract renderable media ──────

describe('Test Bug6 (PBT): handleComplete must extract renderable image URLs and GIF metadata', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    appMocks.capturedSseCallbacks = {};
    appMocks.capturedDashboardProps = {};
  });

  it('after handleComplete fetches assets, renderable image URLs are extracted for preview', async () => {
    /**
     * **Validates: Requirements 1.6**
     *
     * Render App, simulate SSE complete event.
     * The mocked getAssets returns image and GIF assets with signed URLs.
     * Assert that OutputDashboard receives imageUrls and/or gifAsset props
     * derived from the fetched assets.
     *
     * WILL FAIL on unfixed code: handleComplete stores assets in state for
     * ExportPanel but never extracts renderable media URLs for preview.
     */
    const { unmount, container } = render(React.createElement(App));

    expect(appMocks.capturedSseCallbacks.onComplete).toBeDefined();

    // Simulate SSE complete event — this triggers handleComplete which calls getAssets
    await act(async () => {
      await appMocks.capturedSseCallbacks.onComplete!({
        jobId: 'test-job-123',
        state: JobState.Completed,
        timestamp: new Date().toISOString(),
        assets: [],
      });
    });

    // Wait for async getAssets to complete
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    // Check OutputDashboard received imageUrls from the fetched assets
    const dashboard = container.querySelector('[data-testid="output-dashboard"]');
    expect(dashboard).not.toBeNull();

    const imageUrlsStr = dashboard!.getAttribute('data-image-urls');
    const imageUrls = JSON.parse(imageUrlsStr || 'null');

    // EXPECTED: imageUrls should contain the signed URL from the fetched image asset
    // The mocked getAssets returns an image asset with signedUrl
    // WILL FAIL on unfixed code: handleComplete stores assets for ExportPanel
    // but never extracts image URLs for preview
    expect(imageUrls).not.toBeNull();
    expect(Array.isArray(imageUrls)).toBe(true);
    expect(imageUrls.length).toBeGreaterThan(0);
    expect(imageUrls).toContain('https://storage.example.com/signed-img1.png');

    unmount();
  });
});
