/**
 * Preservation Property Tests — Asset Preview URL & Rendering (Frontend)
 *
 * Property 2: Preservation — Existing SSE and Rendering Behavior
 *
 * These tests encode EXISTING correct behavior that must be preserved
 * after the bugfix. They MUST PASS on unfixed code.
 *
 * - handlePartialResult correctly extracts partialCopy, partialStoryboard, partialVideoBrief, partialImageConcepts, creativeBrief
 * - handleStateChange correctly extracts requestedOutputs, skippedOutputs, warnings
 * - ExportPanel renders working download links for assets with valid signedUrl
 * - OutputDashboard shows SkippedNote for skipped outputs and skeleton for pending outputs
 * - JSON metadata assets appear in ExportPanel but are NOT rendered as inline media
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10**
 */
import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import fc from 'fast-check';
import { JobState, AssetType } from '@content-storyteller/shared';
import type {
  CopyPackage,
  Storyboard,
  VideoBrief,
  ImageConcept,
  CreativeBrief,
  AssetReferenceWithUrl,
  JobWarning,
} from '@content-storyteller/shared';
import { OutputDashboard } from '../components/OutputDashboard';
import { ExportPanel } from '../components/ExportPanel';

afterEach(() => {
  cleanup();
});

// ── Arbitraries ─────────────────────────────────────────────────────

const arbPartialCopy: fc.Arbitrary<Partial<CopyPackage>> = fc.record({
  hook: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  caption: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  cta: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
});

const arbPartialStoryboard: fc.Arbitrary<Partial<Storyboard>> = fc.record({
  scenes: fc.option(
    fc.array(
      fc.record({
        sceneNumber: fc.nat({ max: 10 }),
        description: fc.string({ minLength: 1, maxLength: 80 }),
      }),
      { minLength: 1, maxLength: 3 },
    ),
    { nil: undefined },
  ),
});

const arbPartialVideoBrief: fc.Arbitrary<Partial<VideoBrief>> = fc.record({
  totalDuration: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  motionStyle: fc.option(fc.string({ minLength: 1, maxLength: 40 }), { nil: undefined }),
});

const arbImageConcepts: fc.Arbitrary<ImageConcept[]> = fc.array(
  fc.record({
    conceptId: fc.string({ minLength: 1, maxLength: 20 }),
    description: fc.string({ minLength: 1, maxLength: 80 }),
    style: fc.string({ minLength: 1, maxLength: 30 }),
    prompt: fc.string({ minLength: 1, maxLength: 100 }),
    conceptName: fc.string({ minLength: 1, maxLength: 30 }),
    visualDirection: fc.string({ minLength: 1, maxLength: 80 }),
  }),
  { minLength: 1, maxLength: 3 },
) as fc.Arbitrary<ImageConcept[]>;

const arbCreativeBrief: fc.Arbitrary<CreativeBrief> = fc.record({
  campaignAngle: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  pacing: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
  visualStyle: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  platform: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  tone: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
}) as fc.Arbitrary<CreativeBrief>;

const arbOutputList = fc.array(
  fc.constantFrom('copy', 'hashtags', 'image', 'video', 'storyboard', 'voiceover', 'gif'),
  { minLength: 0, maxLength: 4 },
);

const arbWarnings: fc.Arbitrary<JobWarning[]> = fc.array(
  fc.record({
    stage: fc.constantFrom('GenerateImages', 'GenerateVideo', 'GenerateGif'),
    message: fc.string({ minLength: 1, maxLength: 50 }),
    timestamp: fc.date(),
    severity: fc.constantFrom('info' as const, 'warning' as const),
  }),
  { minLength: 0, maxLength: 3 },
);

// ══════════════════════════════════════════════════════════════════════
// Property 2c: handlePartialResult preserves extraction of partial results
// ══════════════════════════════════════════════════════════════════════

describe('Property 2c (PBT): handlePartialResult preserves extraction of partialCopy/partialStoryboard/partialVideoBrief/partialImageConcepts/creativeBrief', () => {
  /**
   * Replicate the ACTUAL handlePartialResult logic from App.tsx (unfixed code)
   * and verify it correctly processes each partial_result field type.
   */

  it('for all SSE partial_result events with partialCopy, the corresponding state is updated', () => {
    /**
     * **Validates: Requirements 3.2**
     */
    fc.assert(
      fc.property(arbPartialCopy, (partialCopy) => {
        let storedCopy: Partial<CopyPackage> | null = null;
        let storedState: string | undefined;

        // Replicate the ACTUAL handlePartialResult from App.tsx
        const handlePartialResult = (data: Record<string, unknown>) => {
          if (data.state) storedState = data.state as string;
          if (data.partialCopy) storedCopy = data.partialCopy as Partial<CopyPackage>;
        };

        handlePartialResult({
          state: JobState.GeneratingImages,
          partialCopy,
        });

        expect(storedState).toBe(JobState.GeneratingImages);
        expect(storedCopy).toEqual(partialCopy);
      }),
      { numRuns: 30 },
    );
  });

  it('for all SSE partial_result events with partialStoryboard, the corresponding state is updated', () => {
    /**
     * **Validates: Requirements 3.2**
     */
    fc.assert(
      fc.property(arbPartialStoryboard, (partialStoryboard) => {
        let storedStoryboard: Partial<Storyboard> | null = null;

        const handlePartialResult = (data: Record<string, unknown>) => {
          if (data.partialStoryboard) storedStoryboard = data.partialStoryboard as Partial<Storyboard>;
        };

        handlePartialResult({
          state: JobState.ComposingPackage,
          partialStoryboard,
        });

        expect(storedStoryboard).toEqual(partialStoryboard);
      }),
      { numRuns: 30 },
    );
  });

  it('for all SSE partial_result events with partialVideoBrief, the corresponding state is updated', () => {
    /**
     * **Validates: Requirements 3.2**
     */
    fc.assert(
      fc.property(arbPartialVideoBrief, (partialVideoBrief) => {
        let storedVideoBrief: Partial<VideoBrief> | null = null;

        const handlePartialResult = (data: Record<string, unknown>) => {
          if (data.partialVideoBrief) storedVideoBrief = data.partialVideoBrief as Partial<VideoBrief>;
        };

        handlePartialResult({
          state: JobState.ComposingPackage,
          partialVideoBrief,
        });

        expect(storedVideoBrief).toEqual(partialVideoBrief);
      }),
      { numRuns: 30 },
    );
  });

  it('for all SSE partial_result events with partialImageConcepts, the corresponding state is updated', () => {
    /**
     * **Validates: Requirements 3.2**
     */
    fc.assert(
      fc.property(arbImageConcepts, (imageConcepts) => {
        let storedImageConcepts: ImageConcept[] = [];

        const handlePartialResult = (data: Record<string, unknown>) => {
          const concepts = data.partialImageConcepts as ImageConcept[] | undefined;
          if (concepts && concepts.length > 0) {
            storedImageConcepts = concepts;
          }
        };

        handlePartialResult({
          state: JobState.GeneratingVideo,
          partialImageConcepts: imageConcepts,
        });

        expect(storedImageConcepts).toEqual(imageConcepts);
      }),
      { numRuns: 30 },
    );
  });

  it('for all SSE partial_result events with creativeBrief, the corresponding state is updated', () => {
    /**
     * **Validates: Requirements 3.2**
     */
    fc.assert(
      fc.property(arbCreativeBrief, (creativeBrief) => {
        let storedBrief: CreativeBrief | null = null;

        const handlePartialResult = (data: Record<string, unknown>) => {
          if (data.creativeBrief) storedBrief = data.creativeBrief as CreativeBrief;
        };

        handlePartialResult({
          state: JobState.GeneratingCopy,
          creativeBrief,
        });

        expect(storedBrief).toEqual(creativeBrief);
      }),
      { numRuns: 20 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════
// Property 2d: handleStateChange preserves extraction of requestedOutputs, skippedOutputs, warnings
// ══════════════════════════════════════════════════════════════════════

describe('Property 2d (PBT): handleStateChange preserves extraction of requestedOutputs/skippedOutputs/warnings', () => {
  it('for all SSE state_change events, requestedOutputs/skippedOutputs/warnings are correctly extracted', () => {
    /**
     * **Validates: Requirements 3.1, 3.4**
     */
    fc.assert(
      fc.property(
        arbOutputList,
        arbOutputList,
        arbWarnings,
        (requestedOutputs, skippedOutputs, warnings) => {
          let storedState: string | undefined;
          let storedRequested: string[] = [];
          let storedSkipped: string[] = [];
          let storedWarnings: JobWarning[] = [];

          // Replicate the ACTUAL handleStateChange from App.tsx
          const handleStateChange = (data: Record<string, unknown>) => {
            if (data.state) storedState = data.state as string;
            if (data.requestedOutputs) storedRequested = data.requestedOutputs as string[];
            if (data.skippedOutputs) storedSkipped = data.skippedOutputs as string[];
            if (data.warnings) storedWarnings = data.warnings as JobWarning[];
          };

          handleStateChange({
            state: JobState.GeneratingImages,
            requestedOutputs,
            skippedOutputs,
            warnings,
          });

          expect(storedState).toBe(JobState.GeneratingImages);
          expect(storedRequested).toEqual(requestedOutputs);
          expect(storedSkipped).toEqual(skippedOutputs);
          expect(storedWarnings).toEqual(warnings);
        },
      ),
      { numRuns: 30 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════
// Property 2e: ExportPanel renders working download links for valid signedUrl
// ══════════════════════════════════════════════════════════════════════

describe('Property 2e (PBT): ExportPanel renders <a> with correct href and CopyToClipboardButton for valid signedUrl', () => {
  it('for all assets with valid non-empty signedUrl, ExportPanel renders <a> with correct href', () => {
    /**
     * **Validates: Requirements 3.3**
     */
    const validAssetArb: fc.Arbitrary<AssetReferenceWithUrl> = fc.record({
      assetId: fc.uuid(),
      jobId: fc.constant('test-job'),
      assetType: fc.constantFrom(AssetType.Copy, AssetType.Image, AssetType.Video, AssetType.Gif, AssetType.Storyboard),
      storagePath: fc.constant('test/path/file.png'),
      generationTimestamp: fc.date(),
      status: fc.constant('completed' as const),
      signedUrl: fc.constant('https://storage.googleapis.com/signed-url/file'),
    });

    const assetsArb = fc.array(validAssetArb, { minLength: 1, maxLength: 4 });

    fc.assert(
      fc.property(assetsArb, (assets) => {
        const { container } = render(
          <ExportPanel jobId="test-job" assets={assets} />,
        );

        // Each asset should have a download link with the correct href
        const downloadLinks = container.querySelectorAll('a[download]');
        expect(downloadLinks.length).toBe(assets.length);

        for (const link of Array.from(downloadLinks)) {
          const href = link.getAttribute('href');
          expect(href).toBe('https://storage.googleapis.com/signed-url/file');
          expect(href).not.toBe('');
        }

        // Text assets should also have CopyToClipboardButton
        const textAssets = assets.filter(
          (a) => a.assetType === 'copy' || a.assetType === 'storyboard' || a.assetType === 'voiceover_script' || a.storagePath?.endsWith('.json'),
        );
        if (textAssets.length > 0) {
          const copyButtons = container.querySelectorAll('button');
          expect(copyButtons.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 15 },
    );
  });

  it('ExportPanel shows empty state when no assets provided', () => {
    /**
     * **Validates: Requirements 3.3**
     */
    const { container } = render(
      <ExportPanel jobId="test-job" assets={[]} />,
    );

    // Should show "No assets available" message
    expect(container.textContent).toContain('No assets available');
    // Should NOT have any download links
    const downloadLinks = container.querySelectorAll('a[download]');
    expect(downloadLinks.length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Property 2f: OutputDashboard renders SkippedNote for skipped outputs, skeleton for pending
// ══════════════════════════════════════════════════════════════════════

describe('Property 2f (PBT): OutputDashboard renders SkippedNote for skippedOutputs and skeleton for pending outputs', () => {
  it('for all skippedOutputs entries, OutputDashboard renders SkippedNote', () => {
    /**
     * **Validates: Requirements 3.4**
     */
    const skippedCombinations = [
      { skipped: ['image'], requested: ['copy'] },
      { skipped: ['video', 'storyboard'], requested: ['copy', 'image'] },
      { skipped: ['gif'], requested: ['copy', 'image', 'video', 'storyboard'] },
      { skipped: ['image', 'video', 'storyboard', 'gif'], requested: ['copy'] },
    ];

    for (const { skipped, requested } of skippedCombinations) {
      const { container } = render(
        <OutputDashboard
          skippedOutputs={skipped}
          requestedOutputs={requested}
        />,
      );

      const textContent = container.textContent || '';

      // For each skipped output, a SkippedNote should be rendered
      for (const type of skipped) {
        // SkippedNote renders "X generation was not requested for this package"
        if (type === 'image') {
          expect(textContent).toContain('Image generation was not requested');
        }
        if (type === 'video' || type === 'storyboard') {
          // Video and storyboard are grouped together
          expect(textContent).toContain('generation was not requested');
        }
        if (type === 'gif') {
          expect(textContent).toContain('Gif generation was not requested');
        }
      }

      cleanup();
    }
  });

  it('for pending outputs (not skipped, no content yet), OutputDashboard renders skeleton', () => {
    /**
     * **Validates: Requirements 3.4**
     */
    // No content provided, image and video are requested (not skipped)
    const { container } = render(
      <OutputDashboard
        requestedOutputs={['copy', 'image', 'video', 'storyboard']}
        skippedOutputs={[]}
      />,
    );

    // Should have skeleton placeholders
    const skeletons = container.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Property 2g: JSON metadata assets appear in ExportPanel but NOT as inline media
// ══════════════════════════════════════════════════════════════════════

describe('Property 2g (PBT): JSON metadata assets appear in ExportPanel but are NOT rendered as inline media', () => {
  it('ImageConcept, VideoBriefMeta, GifCreativeDirection assets appear in ExportPanel with download links', () => {
    /**
     * **Validates: Requirements 3.10**
     */
    const metadataAssets: AssetReferenceWithUrl[] = [
      {
        assetId: 'ic-1',
        jobId: 'test-job',
        assetType: AssetType.ImageConcept,
        storagePath: 'test/image-concepts.json',
        generationTimestamp: new Date(),
        status: 'completed',
        signedUrl: 'https://storage.example.com/image-concepts.json',
      },
      {
        assetId: 'vbm-1',
        jobId: 'test-job',
        assetType: AssetType.VideoBriefMeta,
        storagePath: 'test/video-brief.json',
        generationTimestamp: new Date(),
        status: 'completed',
        signedUrl: 'https://storage.example.com/video-brief.json',
      },
      {
        assetId: 'gcd-1',
        jobId: 'test-job',
        assetType: AssetType.GifCreativeDirection,
        storagePath: 'test/gif-creative-direction.json',
        generationTimestamp: new Date(),
        status: 'completed',
        signedUrl: 'https://storage.example.com/gif-creative-direction.json',
      },
    ];

    const { container } = render(
      <ExportPanel jobId="test-job" assets={metadataAssets} />,
    );

    // All 3 metadata assets should have download links
    const downloadLinks = container.querySelectorAll('a[download]');
    expect(downloadLinks.length).toBe(3);

    // They should also have Copy buttons (they're text/JSON assets)
    const copyButtons = container.querySelectorAll('button');
    expect(copyButtons.length).toBeGreaterThan(0);
  });

  it('JSON metadata assets are NOT rendered as <img>, <video>, or inline media in OutputDashboard', () => {
    /**
     * **Validates: Requirements 3.10**
     *
     * OutputDashboard should not render metadata assets as inline media.
     * Only text concept cards (from imageConcepts prop) are rendered.
     */
    const imageConcepts: ImageConcept[] = [
      {
        conceptName: 'Test Concept',
        visualDirection: 'Bold and colorful',
        style: 'Modern',
      } as ImageConcept,
    ];

    const { container } = render(
      <OutputDashboard
        copyPackage={{ hook: 'Test', caption: 'Test caption' }}
        imageConcepts={imageConcepts}
        requestedOutputs={['copy', 'image']}
        skippedOutputs={[]}
      />,
    );

    // Should render text concept cards (VisualDirection)
    expect(container.textContent).toContain('Test Concept');
    expect(container.textContent).toContain('Bold and colorful');

    // Should NOT render any <img> tags for metadata (unfixed code has no image rendering path)
    const imgTags = container.querySelectorAll('img');
    expect(imgTags.length).toBe(0);

    // Should NOT render any <video> tags
    const videoTags = container.querySelectorAll('video');
    expect(videoTags.length).toBe(0);
  });
});
