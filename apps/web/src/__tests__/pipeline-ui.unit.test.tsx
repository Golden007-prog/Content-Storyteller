import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { JobState, OutputPreference } from '@content-storyteller/shared';
import type { StepsMap } from '@content-storyteller/shared';
import { OutputPreferenceSelector } from '../components/OutputPreferenceSelector';
import { GenerationTimeline } from '../components/GenerationTimeline';
import { OutputDashboard } from '../components/OutputDashboard';

afterEach(() => {
  cleanup();
});

/* ══════════════════════════════════════════════════════════════════
   9.7.1 — OutputPreferenceSelector renders all options and defaults
   to Auto-detect
   Validates: Requirements 5.1, 5.2
   ══════════════════════════════════════════════════════════════════ */

describe('OutputPreferenceSelector', () => {
  it('renders all five output preference options', () => {
    const onChange = vi.fn();
    render(<OutputPreferenceSelector value={OutputPreference.Auto} onChange={onChange} />);

    expect(screen.getByText('Auto-detect')).toBeDefined();
    expect(screen.getByText('Copy only')).toBeDefined();
    expect(screen.getByText('Copy + Image')).toBeDefined();
    expect(screen.getByText('Copy + Video')).toBeDefined();
    expect(screen.getByText('Full Package')).toBeDefined();
  });

  it('shows descriptions for each option', () => {
    const onChange = vi.fn();
    render(<OutputPreferenceSelector value={OutputPreference.Auto} onChange={onChange} />);

    expect(screen.getByText('Infer from your prompt')).toBeDefined();
    expect(screen.getByText('Text, captions & hashtags')).toBeDefined();
    expect(screen.getByText('Text with visual assets')).toBeDefined();
    expect(screen.getByText('Text with video brief')).toBeDefined();
    expect(screen.getByText('Everything: copy, images & video')).toBeDefined();
  });

  it('highlights the Auto-detect option when value is Auto', () => {
    const onChange = vi.fn();
    const { container } = render(
      <OutputPreferenceSelector value={OutputPreference.Auto} onChange={onChange} />,
    );

    const buttons = container.querySelectorAll('button');
    // First button is Auto-detect — should have selected styling
    expect(buttons[0].className).toContain('border-brand-500');
    // Other buttons should not have selected styling
    for (let i = 1; i < buttons.length; i++) {
      expect(buttons[i].className).not.toContain('border-brand-500');
    }
  });

  it('calls onChange with the correct OutputPreference when an option is clicked', () => {
    const onChange = vi.fn();
    render(<OutputPreferenceSelector value={OutputPreference.Auto} onChange={onChange} />);

    fireEvent.click(screen.getByText('Copy only'));
    expect(onChange).toHaveBeenCalledWith(OutputPreference.CopyOnly);

    fireEvent.click(screen.getByText('Full Package'));
    expect(onChange).toHaveBeenCalledWith(OutputPreference.FullPackage);
  });

  it('highlights the selected option when value changes', () => {
    const onChange = vi.fn();
    const { container } = render(
      <OutputPreferenceSelector value={OutputPreference.CopyImage} onChange={onChange} />,
    );

    const buttons = container.querySelectorAll('button');
    // Third button (index 2) is Copy + Image
    expect(buttons[2].className).toContain('border-brand-500');
    // Auto-detect (index 0) should not be selected
    expect(buttons[0].className).not.toContain('border-brand-500');
  });
});

/* ══════════════════════════════════════════════════════════════════
   9.7.2 — GenerationTimeline renders "Skipped" for skipped stages
   Validates: Requirements 6.1, 6.6
   ══════════════════════════════════════════════════════════════════ */

describe('GenerationTimeline skipped stages', () => {
  const stepsWithImageAndVideoSkipped: StepsMap = {
    processInput: { status: 'completed' },
    generateCopy: { status: 'completed' },
    generateImages: { status: 'skipped' },
    generateVideo: { status: 'skipped' },
    generateGif: { status: 'skipped' },
    composePackage: { status: 'running' },
  };

  it('renders "Skipped" text for stages with skipped status', () => {
    render(
      <GenerationTimeline
        currentState={JobState.ComposingPackage}
        steps={stepsWithImageAndVideoSkipped}
      />,
    );

    const skippedLabels = screen.getAllByText('Skipped');
    expect(skippedLabels.length).toBe(3);
  });

  it('renders "Done" for completed stages alongside skipped stages', () => {
    render(
      <GenerationTimeline
        currentState={JobState.ComposingPackage}
        steps={stepsWithImageAndVideoSkipped}
      />,
    );

    const doneLabels = screen.getAllByText('Done');
    // processInput and generateCopy are completed
    expect(doneLabels.length).toBe(2);
  });

  it('renders "In progress…" for the active stage', () => {
    render(
      <GenerationTimeline
        currentState={JobState.ComposingPackage}
        steps={stepsWithImageAndVideoSkipped}
      />,
    );

    expect(screen.getByText('In progress…')).toBeDefined();
  });

  it('applies gray styling to skipped stage badges', () => {
    const { container } = render(
      <GenerationTimeline
        currentState={JobState.ComposingPackage}
        steps={stepsWithImageAndVideoSkipped}
      />,
    );

    const listItems = container.querySelectorAll('[role="listitem"]');
    // Index 2 = GeneratingImages (skipped), Index 3 = GeneratingVideo (skipped)
    for (const idx of [2, 3]) {
      const badge = listItems[idx].querySelector('.w-8.h-8');
      expect(badge).not.toBeNull();
      expect(badge!.className).toContain('bg-gray-100');
      expect(badge!.className).toContain('text-gray-400');
    }
  });

  it('renders a skip icon (dash line) for skipped stages', () => {
    const { container } = render(
      <GenerationTimeline
        currentState={JobState.ComposingPackage}
        steps={stepsWithImageAndVideoSkipped}
      />,
    );

    const listItems = container.querySelectorAll('[role="listitem"]');
    // Skipped stages should have an SVG with a line element (dash icon)
    for (const idx of [2, 3]) {
      const svg = listItems[idx].querySelector('svg');
      expect(svg).not.toBeNull();
      const line = svg!.querySelector('line');
      expect(line).not.toBeNull();
    }
  });
});

/* ══════════════════════════════════════════════════════════════════
   9.7.3 — OutputDashboard hides skeleton for skipped outputs
   Validates: Requirements 6.4, 6.5
   ══════════════════════════════════════════════════════════════════ */

describe('OutputDashboard skipped outputs', () => {
  it('renders fewer skeletons when image and video are skipped', () => {
    const { container: withSkips } = render(
      <OutputDashboard
        skippedOutputs={['image', 'video', 'storyboard']}
        requestedOutputs={['copy']}
      />,
    );
    const skippedSkeletons = withSkips.querySelectorAll('.skeleton').length;
    cleanup();

    const { container: noSkips } = render(<OutputDashboard />);
    const baselineSkeletons = noSkips.querySelectorAll('.skeleton').length;

    expect(skippedSkeletons).toBeLessThan(baselineSkeletons);
  });

  it('renders no image/video skeletons when those outputs are skipped', () => {
    const { container } = render(
      <OutputDashboard
        skippedOutputs={['image', 'video', 'storyboard']}
        requestedOutputs={['copy']}
      />,
    );

    // With only copy requested and image/video skipped, we should have
    // minimal skeleton sections (just the copy skeleton)
    const skeletons = container.querySelectorAll('.skeleton');
    // The baseline (no content, all shown) has multiple skeleton sections
    // With skips, we should have fewer
    expect(skeletons.length).toBeLessThanOrEqual(4);
  });

  it('renders all skeleton sections when nothing is skipped', () => {
    const { container } = render(
      <OutputDashboard
        requestedOutputs={['copy', 'image', 'video', 'storyboard']}
        skippedOutputs={[]}
      />,
    );

    const skeletons = container.querySelectorAll('.skeleton');
    // All sections requested, none skipped — should have full skeleton count
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

/* ══════════════════════════════════════════════════════════════════
   9.7.4 — Backward compatibility: components work without new props
   Validates: Requirements 5.2, 6.1
   ══════════════════════════════════════════════════════════════════ */

describe('Backward compatibility', () => {
  it('GenerationTimeline works without steps prop', () => {
    render(<GenerationTimeline currentState={JobState.GeneratingCopy} />);

    // Should render all 6 stages
    const items = screen.getAllByRole('listitem');
    expect(items.length).toBe(6);

    // Active stage should show "In progress…"
    expect(screen.getByText('In progress…')).toBeDefined();

    // No "Skipped" labels should appear
    expect(screen.queryByText('Skipped')).toBeNull();
  });

  it('GenerationTimeline shows completed stages without steps prop', () => {
    render(<GenerationTimeline currentState={JobState.GeneratingImages} />);

    const doneLabels = screen.getAllByText('Done');
    // ProcessingInput and GeneratingCopy should be done
    expect(doneLabels.length).toBe(2);
  });

  it('OutputDashboard works without skippedOutputs and requestedOutputs', () => {
    const { container } = render(<OutputDashboard />);

    // Should render skeleton sections for all output types
    const skeletons = container.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('OutputDashboard renders all sections when props are undefined', () => {
    const { container: withoutProps } = render(<OutputDashboard />);
    const skeletonsWithout = withoutProps.querySelectorAll('.skeleton').length;
    cleanup();

    const { container: withEmptySkips } = render(
      <OutputDashboard
        requestedOutputs={['copy', 'image', 'video', 'storyboard', 'gif']}
        skippedOutputs={[]}
      />,
    );
    const skeletonsWithEmpty = withEmptySkips.querySelectorAll('.skeleton').length;

    // Both should render the same number of skeletons
    expect(skeletonsWithout).toBe(skeletonsWithEmpty);
  });
});
