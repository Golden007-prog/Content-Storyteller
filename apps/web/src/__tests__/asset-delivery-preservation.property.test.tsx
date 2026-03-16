/**
 * Preservation Property Tests — Asset Delivery & Rendering (Frontend)
 *
 * Property 2: Preservation — Existing Pipeline Behavior Unchanged
 *
 * These tests capture the BASELINE behavior on UNFIXED code.
 * They MUST PASS on unfixed code to confirm the behavior we want to preserve.
 *
 * Property 2.4: For all GenerationTimeline renders with states in
 *   [ProcessingInput, GeneratingCopy, GeneratingImages, GeneratingVideo, ComposingPackage],
 *   exactly one stage shows as active and all prior stages show as completed
 *
 * Property 2.5: For all OutputDashboard renders with skippedOutputs containing a type,
 *   a SkippedNote is rendered for that type
 *
 * **Validates: Requirements 3.7, 3.8**
 */
import { describe, it, expect, afterEach } from 'vitest';
import fc from 'fast-check';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { JobState } from '@content-storyteller/shared';

import { GenerationTimeline } from '../components/GenerationTimeline';
import { OutputDashboard } from '../components/OutputDashboard';

// ── Property 2.4: GenerationTimeline existing stages ────────────────

describe('Property 2.4 (PBT): GenerationTimeline shows correct active/completed/pending for existing 5 stages', () => {
  afterEach(() => {
    cleanup();
  });

  /**
   * The existing 5 pipeline stages in order:
   * ProcessingInput, GeneratingCopy, GeneratingImages, GeneratingVideo, ComposingPackage
   */
  const EXISTING_STAGES: JobState[] = [
    JobState.ProcessingInput,
    JobState.GeneratingCopy,
    JobState.GeneratingImages,
    JobState.GeneratingVideo,
    JobState.GeneratingGif,
    JobState.ComposingPackage,
  ];

  const STAGE_LABELS = [
    'Processing Input',
    'Generating Copy',
    'Generating Images',
    'Generating Video',
    'Generating GIF',
    'Composing Package',
  ];

  it('for all existing pipeline states, exactly one stage shows as active and all prior stages show as completed', () => {
    /**
     * **Validates: Requirements 3.8**
     *
     * Observe: GenerationTimeline shows completed/active/pending/skipped
     * for existing 5 stages based on STATE_ORDER index comparison.
     *
     * MUST PASS on unfixed code — this is baseline behavior to preserve.
     */
    const stateArb = fc.constantFrom(...EXISTING_STAGES);
    const samples = fc.sample(stateArb, 10);

    for (const currentState of samples) {
      const { container } = render(
        React.createElement(GenerationTimeline, { currentState }),
      );

      const listItems = container.querySelectorAll('[role="listitem"]');
      expect(listItems.length).toBe(6);

      const stateIndex = EXISTING_STAGES.indexOf(currentState);

      let activeCount = 0;
      let completedBeforeActive = 0;

      for (let i = 0; i < STAGE_LABELS.length; i++) {
        const item = listItems[i];
        const texts = item.querySelectorAll('p');
        const labelText = texts[0]?.textContent || '';
        const statusText = texts[1]?.textContent || '';

        expect(labelText).toBe(STAGE_LABELS[i]);

        if (i < stateIndex) {
          // Prior stages should be completed
          expect(statusText).toBe('Done');
          completedBeforeActive++;
        } else if (i === stateIndex) {
          // Current stage should be active
          expect(statusText).toContain('In progress');
          activeCount++;
        } else {
          // Later stages should be pending (no status text like Done or In progress)
          expect(statusText).not.toContain('Done');
          expect(statusText).not.toContain('In progress');
        }
      }

      // Exactly one active stage
      expect(activeCount).toBe(1);
      // All prior stages completed
      expect(completedBeforeActive).toBe(stateIndex);

      cleanup();
    }
  });
});

// ── Property 2.5: OutputDashboard SkippedNote rendering ─────────────

describe('Property 2.5 (PBT): OutputDashboard renders SkippedNote for skipped output types', () => {
  afterEach(() => {
    cleanup();
  });

  it('for all OutputDashboard renders with skippedOutputs containing a type, a SkippedNote is rendered for that type', () => {
    /**
     * **Validates: Requirements 3.7**
     *
     * Observe: OutputDashboard renders SkippedNote components for skipped outputs.
     * When skippedOutputs contains 'image', 'video', 'storyboard', or 'gif',
     * a note saying "X generation was not requested for this package" appears.
     *
     * MUST PASS on unfixed code — this is baseline behavior to preserve.
     */
    // Test with various combinations of skipped output types
    const skippableTypes = ['image', 'video', 'gif'] as const;
    const skippedArb = fc.subarray([...skippableTypes], { minLength: 1 });
    const samples = fc.sample(skippedArb, 10);

    for (const skippedOutputs of samples) {
      // For video skipping, we also need 'storyboard' in skipped to trigger the note
      const fullSkipped = skippedOutputs.includes('video')
        ? [...new Set([...skippedOutputs, 'storyboard'])]
        : [...skippedOutputs];

      const { container } = render(
        React.createElement(OutputDashboard, {
          skippedOutputs: fullSkipped,
          requestedOutputs: ['copy'], // Only copy requested
        }),
      );

      // Check that SkippedNote is rendered for each skipped type
      const noteElements = container.querySelectorAll('.bg-gray-50.border-gray-200');

      for (const skippedType of skippedOutputs) {
        const expectedText = `${skippedType.charAt(0).toUpperCase() + skippedType.slice(1)} generation was not requested for this package`;
        const found = Array.from(noteElements).some(
          (el) => el.textContent?.includes(expectedText),
        );
        expect(found).toBe(true);
      }

      cleanup();
    }
  });

  it('OutputDashboard renders skeleton placeholders when no content is available', () => {
    /**
     * **Validates: Requirements 3.7**
     *
     * Observe: OutputDashboard shows skeleton placeholders when no content
     * is provided and outputs are requested.
     *
     * MUST PASS on unfixed code — this is baseline behavior to preserve.
     */
    const { container } = render(
      React.createElement(OutputDashboard, {
        requestedOutputs: ['copy', 'image', 'video', 'storyboard'],
      }),
    );

    // Skeleton sections should be present
    const skeletons = container.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(0);

    cleanup();
  });
});
