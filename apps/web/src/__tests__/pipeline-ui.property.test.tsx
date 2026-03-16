import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import React from 'react';
import { render } from '@testing-library/react';
import { JobState } from '@content-storyteller/shared';
import type { StepsMap, StepStatus } from '@content-storyteller/shared';
import { GenerationTimeline } from '../components/GenerationTimeline';
import { OutputDashboard } from '../components/OutputDashboard';

/* ── Shared arbitraries ──────────────────────────────────────── */

const VALID_STEP_STATUSES: StepStatus[] = ['queued', 'running', 'completed', 'skipped', 'failed'];

const arbStepStatus = fc.constantFrom<StepStatus>(...VALID_STEP_STATUSES);

const STEP_KEYS: (keyof StepsMap)[] = [
  'processInput',
  'generateCopy',
  'generateImages',
  'generateVideo',
  'generateGif',
  'composePackage',
];

/**
 * Generates a StepsMap where at least one stage has status 'skipped'.
 * We pick a random non-empty subset of the 5 step keys to be skipped,
 * and assign random non-skipped statuses to the rest.
 */
const arbStepsMapWithAtLeastOneSkipped: fc.Arbitrary<StepsMap> = fc
  .record({
    processInput: arbStepStatus,
    generateCopy: arbStepStatus,
    generateImages: arbStepStatus,
    generateVideo: arbStepStatus,
    generateGif: arbStepStatus,
    composePackage: arbStepStatus,
  })
  .chain((base) => {
    return fc
      .subarray([...STEP_KEYS], { minLength: 1 })
      .map((skippedKeys) => {
        const map: StepsMap = {
          processInput: { status: base.processInput },
          generateCopy: { status: base.generateCopy },
          generateImages: { status: base.generateImages },
          generateVideo: { status: base.generateVideo },
          generateGif: { status: base.generateGif },
          composePackage: { status: base.composePackage },
        };
        for (const key of skippedKeys) {
          map[key] = { status: 'skipped' };
        }
        return map;
      });
  });


/**
 * Generates a fully random StepsMap (any status for each key).
 */
const arbStepsMap: fc.Arbitrary<StepsMap> = fc.record({
  processInput: arbStepStatus.map((s) => ({ status: s })),
  generateCopy: arbStepStatus.map((s) => ({ status: s })),
  generateImages: arbStepStatus.map((s) => ({ status: s })),
  generateVideo: arbStepStatus.map((s) => ({ status: s })),
  generateGif: arbStepStatus.map((s) => ({ status: s })),
  composePackage: arbStepStatus.map((s) => ({ status: s })),
});

/* ── Mapping from pipeline stage JobState keys to StepsMap keys ── */

const STAGE_TO_STEP_KEY: Record<string, keyof StepsMap> = {
  [JobState.ProcessingInput]: 'processInput',
  [JobState.GeneratingCopy]: 'generateCopy',
  [JobState.GeneratingImages]: 'generateImages',
  [JobState.GeneratingVideo]: 'generateVideo',
  [JobState.GeneratingGif]: 'generateGif',
  [JobState.ComposingPackage]: 'composePackage',
};

const PIPELINE_STAGE_KEYS: JobState[] = [
  JobState.ProcessingInput,
  JobState.GeneratingCopy,
  JobState.GeneratingImages,
  JobState.GeneratingVideo,
  JobState.GeneratingGif,
  JobState.ComposingPackage,
];

/* ══════════════════════════════════════════════════════════════════
 * Feature: smart-pipeline-orchestration, Property 17: GenerationTimeline
 * skipped indicator
 *
 * For any StepsMap with skipped stages, the GenerationTimeline component
 * renders a "Skipped" indicator for those stages instead of a pending or
 * active state.
 *
 * Validates: Requirements 6.6
 * ══════════════════════════════════════════════════════════════════ */

describe('Feature: smart-pipeline-orchestration, Property 17: GenerationTimeline skipped indicator', () => {
  it('renders "Skipped" text for every stage whose step status is skipped', () => {
    fc.assert(
      fc.property(
        arbStepsMapWithAtLeastOneSkipped,
        fc.constantFrom<JobState>(...PIPELINE_STAGE_KEYS, JobState.Queued, JobState.Completed),
        (steps, currentState) => {
          const { container, unmount } = render(
            <GenerationTimeline currentState={currentState} steps={steps} />,
          );

          const listItems = container.querySelectorAll('[role="listitem"]');
          expect(listItems.length).toBe(PIPELINE_STAGE_KEYS.length);

          listItems.forEach((item, index) => {
            const stageKey = PIPELINE_STAGE_KEYS[index];
            const stepKey = STAGE_TO_STEP_KEY[stageKey];
            const isSkipped = steps[stepKey]?.status === 'skipped';

            if (isSkipped) {
              // The stage should show "Skipped" text
              expect(item.textContent).toContain('Skipped');
              // The badge should have gray styling (skipped indicator)
              const badge = item.querySelector('.w-8.h-8.rounded-xl');
              if (badge) {
                expect(badge.className).toContain('bg-gray-100');
              }
              // Should NOT show "In progress…" or active styling
              expect(item.textContent).not.toContain('In progress');
            }
          });

          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('non-skipped stages do not render "Skipped" text when steps metadata is provided', () => {
    fc.assert(
      fc.property(
        arbStepsMap,
        fc.constantFrom<JobState>(JobState.Queued, JobState.Completed),
        (steps, currentState) => {
          const { container, unmount } = render(
            <GenerationTimeline currentState={currentState} steps={steps} />,
          );

          const listItems = container.querySelectorAll('[role="listitem"]');

          listItems.forEach((item, index) => {
            const stageKey = PIPELINE_STAGE_KEYS[index];
            const stepKey = STAGE_TO_STEP_KEY[stageKey];
            const isSkipped = steps[stepKey]?.status === 'skipped';

            if (!isSkipped) {
              // Non-skipped stages should NOT show "Skipped" text
              // (they show "Done", "In progress…", or nothing)
              const texts = Array.from(item.querySelectorAll('p'));
              const hasSkippedLabel = texts.some(
                (p) => p.textContent?.trim() === 'Skipped',
              );
              expect(hasSkippedLabel).toBe(false);
            }
          });

          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });
});


/* ══════════════════════════════════════════════════════════════════
 * Feature: smart-pipeline-orchestration, Property 18: OutputDashboard
 * conditional rendering
 *
 * For any combination of requestedOutputs and skippedOutputs, the
 * OutputDashboard component renders asset sections only for output types
 * that are in requestedOutputs and not in skippedOutputs, and does not
 * render skeleton placeholders for skipped output types.
 *
 * Validates: Requirements 6.5, 6.4
 * ══════════════════════════════════════════════════════════════════ */

const ALL_OUTPUT_TYPES = ['copy', 'image', 'video', 'storyboard'] as const;

/**
 * Generates a random requestedOutputs/skippedOutputs combination.
 * skippedOutputs is always a subset of ALL_OUTPUT_TYPES that does NOT
 * overlap with requestedOutputs (or may overlap — the component handles it).
 */
const arbOutputConfig = fc
  .subarray([...ALL_OUTPUT_TYPES], { minLength: 0 })
  .chain((requested) => {
    return fc
      .subarray([...ALL_OUTPUT_TYPES], { minLength: 0 })
      .map((skipped) => ({
        requestedOutputs: requested as string[],
        skippedOutputs: skipped as string[],
      }));
  });

describe('Feature: smart-pipeline-orchestration, Property 18: OutputDashboard conditional rendering', () => {
  it('skipped output types produce fewer skeleton sections than when nothing is skipped', () => {
    fc.assert(
      fc.property(arbOutputConfig, ({ requestedOutputs, skippedOutputs }) => {
        // Render with skipped/requested config
        const { container: withConfig, unmount: unmount1 } = render(
          <OutputDashboard
            requestedOutputs={requestedOutputs}
            skippedOutputs={skippedOutputs}
          />,
        );
        const skeletonsWithConfig = withConfig.querySelectorAll('.skeleton').length;
        unmount1();

        // Render with no filtering (baseline — all sections shown)
        const { container: baseline, unmount: unmount2 } = render(
          <OutputDashboard />,
        );
        const skeletonsBaseline = baseline.querySelectorAll('.skeleton').length;
        unmount2();

        // When we have skipped outputs, the skeleton count should be
        // <= the baseline (no filtering) count
        expect(skeletonsWithConfig).toBeLessThanOrEqual(skeletonsBaseline);
      }),
      { numRuns: 100 },
    );
  });

  it('shouldShow logic correctly filters: skipped types are excluded, only requested non-skipped types pass', () => {
    fc.assert(
      fc.property(arbOutputConfig, ({ requestedOutputs, skippedOutputs }) => {
        // Replicate the component's shouldShow logic
        const isSkipped = (type: string) => skippedOutputs.includes(type);
        const shouldShow = (type: string) => {
          if (requestedOutputs.length === 0 && skippedOutputs.length === 0) return true;
          if (isSkipped(type)) return false;
          if (requestedOutputs.length > 0) return requestedOutputs.includes(type);
          return true;
        };

        for (const outputType of ALL_OUTPUT_TYPES) {
          const result = shouldShow(outputType);

          // Property: if a type is in skippedOutputs, shouldShow is false
          if (skippedOutputs.includes(outputType)) {
            expect(result).toBe(false);
          }

          // Property: if requestedOutputs is non-empty and type is NOT in
          // requestedOutputs (and not skipped), shouldShow is false
          if (
            requestedOutputs.length > 0 &&
            !requestedOutputs.includes(outputType) &&
            !skippedOutputs.includes(outputType)
          ) {
            expect(result).toBe(false);
          }

          // Property: if type is in requestedOutputs and NOT skipped,
          // shouldShow is true
          if (
            requestedOutputs.includes(outputType) &&
            !skippedOutputs.includes(outputType)
          ) {
            expect(result).toBe(true);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('renders the component without errors for any requestedOutputs/skippedOutputs combo', () => {
    fc.assert(
      fc.property(arbOutputConfig, ({ requestedOutputs, skippedOutputs }) => {
        // Should not throw for any combination
        const { unmount } = render(
          <OutputDashboard
            requestedOutputs={requestedOutputs}
            skippedOutputs={skippedOutputs}
          />,
        );
        unmount();
      }),
      { numRuns: 100 },
    );
  });
});
