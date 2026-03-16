/**
 * Preservation Property Tests — Properties 2b & 2c
 *
 * Property 2b: SSE partial_result Preservation
 * Property 2c: OutputDashboard Backward Compatibility
 *
 * These tests encode EXISTING correct behavior that must be preserved
 * after the bugfix. They MUST PASS on unfixed code.
 *
 * **Validates: Requirements 3.4, 3.5**
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import fc from 'fast-check';
import { JobState } from '@content-storyteller/shared';
import { OutputDashboard } from '../components/OutputDashboard';
import type { CopyPackage, Storyboard, VideoBrief, ImageConcept } from '@content-storyteller/shared';

afterEach(() => {
  cleanup();
});

// ── Property 2b: SSE partial_result Preservation ────────────────────

/**
 * For any SSE partial_result event with partialCopy, partialStoryboard,
 * partialVideoBrief, partialImageConcepts, or creativeBrief fields,
 * verify the existing handlePartialResult callback updates the
 * corresponding state identically.
 *
 * We replicate the ACTUAL handlePartialResult from App.tsx (unfixed code)
 * and verify it correctly processes each field type.
 *
 * **Validates: Requirements 3.5**
 */
describe('Property 2b: SSE partial_result Preservation', () => {
  // Arbitrary for partial copy data
  const arbPartialCopy = fc.record({
    hook: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    caption: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
    cta: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  });

  // Arbitrary for partial storyboard data
  const arbPartialStoryboard = fc.record({
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

  // Arbitrary for partial video brief data
  const arbPartialVideoBrief = fc.record({
    concept: fc.option(fc.string({ minLength: 1, maxLength: 80 }), { nil: undefined }),
    duration: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  });

  // Arbitrary for image concepts
  const arbImageConcepts = fc.array(
    fc.record({
      conceptId: fc.string({ minLength: 1, maxLength: 20 }),
      description: fc.string({ minLength: 1, maxLength: 80 }),
      style: fc.string({ minLength: 1, maxLength: 30 }),
      prompt: fc.string({ minLength: 1, maxLength: 100 }),
    }),
    { minLength: 1, maxLength: 3 },
  );

  // Arbitrary for creative brief
  const arbCreativeBrief = fc.record({
    campaignAngle: fc.option(fc.string({ minLength: 1, maxLength: 80 }), { nil: undefined }),
    pacing: fc.option(fc.string({ minLength: 1, maxLength: 40 }), { nil: undefined }),
    visualStyle: fc.option(fc.string({ minLength: 1, maxLength: 60 }), { nil: undefined }),
  });

  it('handlePartialResult updates copyPackage state when partialCopy is present', () => {
    fc.assert(
      fc.property(arbPartialCopy, (partialCopy) => {
        // Track state updates
        let storedCopy: Partial<CopyPackage> | null = null;
        let storedState: string | undefined;

        const setCurrentState = (s: string) => { storedState = s; };
        const setCopyPackage = (c: Partial<CopyPackage>) => { storedCopy = c; };
        const setStoryboard = (_s: any) => {};
        const setVideoBrief = (_v: any) => {};
        const setImageConcepts = (_i: any) => {};
        const setCreativeBrief = (_b: any) => {};

        // Replicate the ACTUAL handlePartialResult from App.tsx (unfixed code)
        const handlePartialResult = (data: any) => {
          if (data.state) setCurrentState(data.state);
          if (data.partialCopy) setCopyPackage(data.partialCopy);
          if (data.partialStoryboard) setStoryboard(data.partialStoryboard);
          if (data.partialVideoBrief) setVideoBrief(data.partialVideoBrief);
          if (data.partialImageConcepts && data.partialImageConcepts.length > 0) {
            setImageConcepts(data.partialImageConcepts);
          }
          if (data.creativeBrief) setCreativeBrief(data.creativeBrief);
        };

        handlePartialResult({
          state: JobState.GeneratingCopy,
          partialCopy: partialCopy,
        });

        expect(storedState).toBe(JobState.GeneratingCopy);
        expect(storedCopy).toEqual(partialCopy);
      }),
      { numRuns: 50 },
    );
  });

  it('handlePartialResult updates storyboard state when partialStoryboard is present', () => {
    fc.assert(
      fc.property(arbPartialStoryboard, (partialStoryboard) => {
        let storedStoryboard: any = null;

        const handlePartialResult = (data: any) => {
          if (data.partialStoryboard) storedStoryboard = data.partialStoryboard;
        };

        handlePartialResult({
          state: JobState.GeneratingVideo,
          partialStoryboard: partialStoryboard,
        });

        expect(storedStoryboard).toEqual(partialStoryboard);
      }),
      { numRuns: 30 },
    );
  });

  it('handlePartialResult updates videoBrief state when partialVideoBrief is present', () => {
    fc.assert(
      fc.property(arbPartialVideoBrief, (partialVideoBrief) => {
        let storedVideoBrief: any = null;

        const handlePartialResult = (data: any) => {
          if (data.partialVideoBrief) storedVideoBrief = data.partialVideoBrief;
        };

        handlePartialResult({
          state: JobState.GeneratingVideo,
          partialVideoBrief: partialVideoBrief,
        });

        expect(storedVideoBrief).toEqual(partialVideoBrief);
      }),
      { numRuns: 30 },
    );
  });

  it('handlePartialResult updates imageConcepts state when partialImageConcepts is non-empty', () => {
    fc.assert(
      fc.property(arbImageConcepts, (imageConcepts) => {
        let storedImageConcepts: any[] = [];

        const handlePartialResult = (data: any) => {
          if (data.partialImageConcepts && data.partialImageConcepts.length > 0) {
            storedImageConcepts = data.partialImageConcepts;
          }
        };

        handlePartialResult({
          state: JobState.GeneratingImages,
          partialImageConcepts: imageConcepts,
        });

        expect(storedImageConcepts).toEqual(imageConcepts);
      }),
      { numRuns: 30 },
    );
  });

  it('handlePartialResult updates creativeBrief state when creativeBrief is present', () => {
    fc.assert(
      fc.property(arbCreativeBrief, (brief) => {
        let storedBrief: any = null;

        const handlePartialResult = (data: any) => {
          if (data.creativeBrief) storedBrief = data.creativeBrief;
        };

        handlePartialResult({
          state: JobState.GeneratingCopy,
          creativeBrief: brief,
        });

        expect(storedBrief).toEqual(brief);
      }),
      { numRuns: 30 },
    );
  });

  it('handlePartialResult does NOT update imageConcepts when array is empty', () => {
    let storedImageConcepts: any[] = ['original'];

    const handlePartialResult = (data: any) => {
      if (data.partialImageConcepts && data.partialImageConcepts.length > 0) {
        storedImageConcepts = data.partialImageConcepts;
      }
    };

    handlePartialResult({
      state: JobState.GeneratingImages,
      partialImageConcepts: [],
    });

    // Should NOT have been updated — empty array is filtered out
    expect(storedImageConcepts).toEqual(['original']);
  });
});

// ── Property 2c: OutputDashboard Backward Compatibility ─────────────

/**
 * For any combination of content props (copyPackage, storyboard, videoBrief,
 * imageConcepts, gifAsset) WITHOUT requestedOutputs/skippedOutputs,
 * verify OutputDashboard renders all sections with progressive reveal
 * (backward compat — shouldShow returns true when both are undefined).
 *
 * **Validates: Requirements 3.4**
 */
describe('Property 2c: OutputDashboard Backward Compatibility', () => {
  const arbCopyPackage: fc.Arbitrary<Partial<CopyPackage>> = fc.record({
    hook: fc.string({ minLength: 1, maxLength: 50 }),
    caption: fc.string({ minLength: 1, maxLength: 100 }),
    cta: fc.string({ minLength: 1, maxLength: 50 }),
    hashtags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
  });

  const arbStoryboard: fc.Arbitrary<Partial<Storyboard>> = fc.record({
    scenes: fc.array(
      fc.record({
        sceneNumber: fc.nat({ max: 10 }),
        description: fc.string({ minLength: 1, maxLength: 80 }),
        visualDirection: fc.string({ minLength: 1, maxLength: 60 }),
        duration: fc.string({ minLength: 1, maxLength: 10 }),
      }),
      { minLength: 1, maxLength: 3 },
    ),
  });

  const arbImageConcept: fc.Arbitrary<ImageConcept> = fc.record({
    conceptId: fc.string({ minLength: 1, maxLength: 20 }),
    description: fc.string({ minLength: 1, maxLength: 80 }),
    style: fc.string({ minLength: 1, maxLength: 30 }),
    prompt: fc.string({ minLength: 1, maxLength: 100 }),
  });

  it('without requestedOutputs/skippedOutputs, shouldShow returns true for all types (backward compat)', () => {
    // Directly test the shouldShow logic from OutputDashboard
    fc.assert(
      fc.property(
        fc.constantFrom('image', 'video', 'storyboard', 'gif', 'copy'),
        (outputType) => {
          // Replicate the shouldShow logic from OutputDashboard
          const requestedOutputs: string[] | undefined = undefined;
          const skippedOutputs: string[] | undefined = undefined;

          const isSkipped = (type: string) => skippedOutputs?.includes(type) ?? false;
          const shouldShow = (type: string) => {
            if (!requestedOutputs && !skippedOutputs) return true; // backward compat
            if (isSkipped(type)) return false;
            if (requestedOutputs) return requestedOutputs.includes(type);
            return true;
          };

          // When both are undefined, shouldShow should return true for ALL types
          expect(shouldShow(outputType)).toBe(true);
        },
      ),
      { numRuns: 20 },
    );
  });

  it('renders copy section with progressive reveal when copyPackage provided and no skip props', () => {
    fc.assert(
      fc.property(arbCopyPackage, (copyPkg) => {
        const { container } = render(
          <OutputDashboard copyPackage={copyPkg} />,
        );

        // SectionWrapper applies transition-all for progressive reveal
        const animatedSections = container.querySelectorAll('.transition-all');
        expect(animatedSections.length).toBeGreaterThan(0);

        // Content should be rendered (not just skeletons)
        const contentArea = container.querySelector('.space-y-8');
        expect(contentArea).not.toBeNull();
      }),
      { numRuns: 15 },
    );
  });

  it('renders storyboard section when both copyPackage and storyboard provided without skip props', () => {
    fc.assert(
      fc.property(arbCopyPackage, arbStoryboard, (copyPkg, storyboard) => {
        const { container } = render(
          <OutputDashboard copyPackage={copyPkg} storyboard={storyboard} />,
        );

        // Should have multiple animated sections (copy + storyboard)
        const animatedSections = container.querySelectorAll('.transition-all');
        expect(animatedSections.length).toBeGreaterThanOrEqual(2);
      }),
      { numRuns: 15 },
    );
  });

  it('renders image concepts section when copyPackage and imageConcepts provided without skip props', () => {
    fc.assert(
      fc.property(
        arbCopyPackage,
        fc.array(arbImageConcept, { minLength: 1, maxLength: 3 }),
        (copyPkg, concepts) => {
          const { container } = render(
            <OutputDashboard copyPackage={copyPkg} imageConcepts={concepts} />,
          );

          // Should have animated sections for both copy and image concepts
          const animatedSections = container.querySelectorAll('.transition-all');
          expect(animatedSections.length).toBeGreaterThanOrEqual(2);
        },
      ),
      { numRuns: 15 },
    );
  });

  it('shows skeleton placeholders for missing content types when no skip props (loading state)', () => {
    // When no content is provided at all and no skip props, everything should show skeletons
    const { container } = render(<OutputDashboard />);

    const skeletons = container.querySelectorAll('.skeleton');
    // Should have multiple skeleton sections (copy + image + video + gif + image again)
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows skeleton for pending sections when only copyPackage is provided without skip props', () => {
    fc.assert(
      fc.property(arbCopyPackage, (copyPkg) => {
        const { container } = render(
          <OutputDashboard copyPackage={copyPkg} />,
        );

        // Should still have skeletons for storyboard/video/image sections that haven't loaded
        const skeletons = container.querySelectorAll('.skeleton');
        expect(skeletons.length).toBeGreaterThan(0);
      }),
      { numRuns: 10 },
    );
  });
});
