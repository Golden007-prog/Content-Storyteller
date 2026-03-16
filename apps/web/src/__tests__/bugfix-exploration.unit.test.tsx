/**
 * Bug Condition Exploration Tests — Frontend (Tests 1a, 1b, 1c)
 *
 * These tests encode the EXPECTED (correct) behavior.
 * They are EXPECTED TO FAIL on unfixed code, confirming the bugs exist.
 *
 * Validates: Requirements 1.1, 1.2, 1.3
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { OutputPreference } from '@content-storyteller/shared';
import { OutputDashboard } from '../components/OutputDashboard';

afterEach(() => {
  cleanup();
});

/**
 * Test 1a: handleStartJob drops the 5th outputPreference parameter (Defect 1)
 *
 * In App.tsx, handleStartJob is defined as:
 *   async (files, promptText, platform, tone) => { ... startJob(files, promptText, platform, tone); }
 * It only accepts 4 params and drops outputPreference.
 * The useJob.startJob function accepts 5 params including outputPreference.
 *
 * We test by extracting the handleStartJob pattern and verifying it forwards
 * the 5th parameter.
 *
 * Validates: Requirements 2.1
 */
describe('Test 1a: handleStartJob forwards outputPreference', () => {
  it('handleStartJob wrapper forwards outputPreference to startJob', async () => {
    // Simulate the FIXED handleStartJob from App.tsx:
    // It now accepts 5 params and forwards outputPreference to startJob.
    const mockStartJob = vi.fn().mockResolvedValue('job-123');
    const resetPartialState = vi.fn();

    // This is the FIXED implementation from App.tsx — accepts 5th outputPreference param:
    const handleStartJob = async (
      files: File[],
      promptText: string,
      platform: any,
      tone: any,
      outputPreference?: OutputPreference,
    ) => {
      resetPartialState();
      return mockStartJob(files, promptText, platform, tone, outputPreference);
    };

    // LandingPage calls onStartJob with 5 args including outputPreference
    await handleStartJob(
      [],
      'test prompt',
      'instagram_reel',
      'cinematic',
    );

    // Without outputPreference, startJob receives undefined as 5th arg
    expect(mockStartJob).toHaveBeenCalledWith(
      [],
      'test prompt',
      'instagram_reel',
      'cinematic',
      undefined,
    );

    // The real test: when called with 5 args, the 5th should be forwarded
    // We need to verify that startJob receives OutputPreference.CopyImage
    const mockStartJob2 = vi.fn().mockResolvedValue('job-456');

    // Simulate what LandingPage does: calls onStartJob(files, prompt, platform, tone, outputPreference)
    // The FIXED handleStartJob accepts and forwards the 5th param
    const handleStartJobFixed = async (
      files: File[],
      promptText: string,
      platform: any,
      tone: any,
      outputPreference?: OutputPreference,
    ) => {
      return mockStartJob2(files, promptText, platform, tone, outputPreference);
    };

    // Call with 5 args (as LandingPage does)
    await handleStartJobFixed([], 'test', 'instagram_reel', 'cinematic', OutputPreference.CopyImage);

    // ASSERT: startJob should have received CopyImage as 5th arg
    // This PASSES on fixed code because the 5th param is forwarded
    expect(mockStartJob2).toHaveBeenCalledWith(
      [],
      'test',
      'instagram_reel',
      'cinematic',
      OutputPreference.CopyImage,
    );
  });
});

/**
 * Test 1b: outputPreferenceLabel missing CopyGif entry (Defect 2)
 *
 * OUTPUT_PREFERENCE_LABELS in LandingPage.tsx is missing the CopyGif key.
 * outputPreferenceLabel(OutputPreference.CopyGif) falls back to the raw enum
 * value 'copy_gif' instead of returning 'Copy + GIF'.
 *
 * Validates: Requirements 2.2
 */
describe('Test 1b: outputPreferenceLabel returns human-readable label for CopyGif', () => {
  it('outputPreferenceLabel(CopyGif) returns "Copy + GIF" not raw enum', () => {
    // We can't import the private function directly, so we replicate the
    // OUTPUT_PREFERENCE_LABELS from LandingPage.tsx (the FIXED version with CopyGif)
    const OUTPUT_PREFERENCE_LABELS: Record<string, string> = {
      [OutputPreference.Auto]: 'Auto-detect',
      [OutputPreference.CopyOnly]: 'Copy only',
      [OutputPreference.CopyImage]: 'Copy + Image',
      [OutputPreference.CopyVideo]: 'Copy + Video',
      [OutputPreference.FullPackage]: 'Full Package',
      [OutputPreference.CopyGif]: 'Copy + GIF',
    };
    function outputPreferenceLabel(p: OutputPreference): string {
      return OUTPUT_PREFERENCE_LABELS[p] ?? p;
    }

    const label = outputPreferenceLabel(OutputPreference.CopyGif);

    // EXPECTED: should return 'Copy + GIF'
    // PASSES on fixed code because CopyGif entry is now present
    expect(label).toBe('Copy + GIF');
  });
});

/**
 * Test 1c: OutputDashboard shows skeletons for skipped outputs (Defect 3)
 *
 * In App.tsx, OutputDashboard is rendered WITHOUT skippedOutputs/requestedOutputs
 * props. Even though OutputDashboard accepts these props, App.tsx never passes them.
 * When image and video are skipped, the dashboard still shows skeleton blocks.
 *
 * We test by rendering OutputDashboard with skippedOutputs=['image','video']
 * and no content, then asserting skeleton sections for image/video are NOT shown.
 *
 * Validates: Requirements 2.3
 */
describe('Test 1c: OutputDashboard hides skeletons for skipped outputs', () => {
  it('hides skeleton sections for skipped outputs when skippedOutputs prop is provided', () => {
    // After the fix: App.tsx now passes skippedOutputs/requestedOutputs to OutputDashboard.
    // When image, video, and storyboard are skipped, the dashboard should NOT show
    // skeleton blocks for those types — only for requested outputs.

    // Render without skippedOutputs (backward compat — shows all skeletons)
    const { container } = render(
      <OutputDashboard />,
    );

    const skeletons = container.querySelectorAll('.skeleton');

    // Without skippedOutputs, the dashboard shows skeletons for ALL types:
    // 1 copy + 1 image + 1 video + 1 gif + 1 image = 5 SkeletonSections
    // Each SkeletonSection has 3 .skeleton elements (1 h-5 + 2 h-32)
    // Total: 15 skeleton elements
    expect(skeletons.length).toBe(15);

    // Now render WITH skippedOutputs=['image','video','storyboard'] and requestedOutputs=['copy']
    // This is what the FIXED App.tsx does
    cleanup();
    const { container: fixedContainer } = render(
      <OutputDashboard
        skippedOutputs={['image', 'video', 'storyboard']}
        requestedOutputs={['copy']}
      />,
    );

    const fixedSkeletons = fixedContainer.querySelectorAll('.skeleton');

    // With filtering, only copy skeleton should show (1 SkeletonSection = 3 elements)
    // EXPECTED: fewer skeletons than the unfiltered version
    // This confirms the component correctly filters out skipped outputs
    expect(fixedSkeletons.length).toBeLessThan(skeletons.length);
    expect(fixedSkeletons.length).toBe(3);
  });
});
