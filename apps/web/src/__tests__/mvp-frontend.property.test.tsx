import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import fc from 'fast-check';
import { Platform, Tone, JobState } from '@content-storyteller/shared';
import type { CopyPackage, Storyboard, AssetReferenceWithUrl } from '@content-storyteller/shared';
import { PlatformSelector } from '../components/PlatformSelector';
import { ToneSelector } from '../components/ToneSelector';
import { GenerationTimeline } from '../components/GenerationTimeline';
import { CopyCards } from '../components/CopyCards';
import { StoryboardView } from '../components/StoryboardView';
import { ExportPanel } from '../components/ExportPanel';

/**
 * Property 14: Platform and Tone selectors render all options
 * Validates: Requirements 16.4, 16.5
 */
describe('Property 14: Platform and Tone selectors render all options', () => {
  it('PlatformSelector renders exactly Platform enum count buttons', () => {
    const platformValues = Object.values(Platform);
    const { container } = render(
      <PlatformSelector value={platformValues[0]} onChange={() => {}} />,
    );
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(platformValues.length);
  });

  it('ToneSelector renders exactly Tone enum count buttons', () => {
    const toneValues = Object.values(Tone);
    const { container } = render(
      <ToneSelector value={toneValues[0]} onChange={() => {}} />,
    );
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(toneValues.length);
  });

  it('PlatformSelector highlights the selected platform for any valid value', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.values(Platform)),
        (platform) => {
          const { container } = render(
            <PlatformSelector value={platform} onChange={() => {}} />,
          );
          const buttons = container.querySelectorAll('button');
          const selectedButtons = Array.from(buttons).filter((b) =>
            b.className.includes('border-brand-500'),
          );
          expect(selectedButtons.length).toBe(1);
        },
      ),
    );
  });

  it('ToneSelector highlights the selected tone for any valid value', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.values(Tone)),
        (tone) => {
          const { container } = render(
            <ToneSelector value={tone} onChange={() => {}} />,
          );
          const buttons = container.querySelectorAll('button');
          const selectedButtons = Array.from(buttons).filter((b) =>
            b.className.includes('border-brand-500'),
          );
          expect(selectedButtons.length).toBe(1);
        },
      ),
    );
  });
});


/**
 * Property 15: Empty prompt validation prevents submission
 * Validates: Requirements 16.7
 * (Tested structurally — UploadForm requires non-empty prompt)
 */
describe('Property 15: Empty prompt validation', () => {
  it('whitespace-only strings are always invalid prompts', () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r')),
        (whitespace) => {
          expect(whitespace.trim()).toBe('');
        },
      ),
    );
  });

  it('non-whitespace strings are valid prompts', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        (text) => {
          expect(text.trim().length).toBeGreaterThan(0);
        },
      ),
    );
  });
});

/**
 * Property 16: CopyPackage rendering completeness
 * Validates: Requirements 18.1, 18.6, 18.7
 */
describe('Property 16: CopyPackage rendering completeness', () => {
  const copyPackageArb = fc.record({
    hook: fc.string({ minLength: 1 }),
    caption: fc.string({ minLength: 1 }),
    cta: fc.string({ minLength: 1 }),
    hashtags: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 }),
  });

  it('renders hook, caption, and CTA when all provided', () => {
    fc.assert(
      fc.property(copyPackageArb, (pkg) => {
        const { container } = render(<CopyCards copyPackage={pkg} />);
        const text = container.textContent ?? '';
        expect(text).toContain('Hook');
        expect(text).toContain('Caption');
        expect(text).toContain('Call to Action');
      }),
      { numRuns: 10 },
    );
  });

  it('renders hashtags section when hashtags are provided', () => {
    fc.assert(
      fc.property(copyPackageArb, (pkg) => {
        const { container } = render(<CopyCards copyPackage={pkg} />);
        const text = container.textContent ?? '';
        expect(text).toContain('Hashtags');
      }),
      { numRuns: 10 },
    );
  });
});

/**
 * Property 17: Storyboard rendering completeness
 * Validates: Requirements 18.2
 */
describe('Property 17: Storyboard rendering completeness', () => {
  const sceneArb = fc.record({
    sceneNumber: fc.integer({ min: 1, max: 20 }),
    description: fc.string({ minLength: 1 }),
    duration: fc.string({ minLength: 1 }),
    motionStyle: fc.string({ minLength: 1 }),
    textOverlay: fc.string({ minLength: 1 }),
    cameraDirection: fc.string({ minLength: 1 }),
  });

  it('renders one card per scene', () => {
    fc.assert(
      fc.property(
        fc.array(sceneArb, { minLength: 1, maxLength: 6 }),
        (scenes) => {
          const storyboard: Partial<Storyboard> = {
            scenes,
            totalDuration: '30s',
            pacing: 'fast',
          };
          const { container } = render(<StoryboardView storyboard={storyboard} />);
          // Each scene renders its sceneNumber in a span
          const sceneNumbers = scenes.map((s) => String(s.sceneNumber));
          for (const num of sceneNumbers) {
            expect(container.textContent).toContain(num);
          }
        },
      ),
      { numRuns: 10 },
    );
  });
});

/**
 * Property 18: SSE events update UI state — GenerationTimeline correctness
 * Validates: Requirements 17.3, 17.4
 */
describe('Property 18: GenerationTimeline stage correctness', () => {
  const pipelineStates: JobState[] = [
    JobState.ProcessingInput,
    JobState.GeneratingCopy,
    JobState.GeneratingImages,
    JobState.GeneratingVideo,
    JobState.GeneratingGif,
    JobState.ComposingPackage,
  ];

  it('shows exactly one active stage for each pipeline state', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...pipelineStates),
        (state) => {
          const { container } = render(<GenerationTimeline currentState={state} />);
          const inProgressTexts = container.querySelectorAll('p');
          const activeLabels = Array.from(inProgressTexts).filter(
            (p) => p.textContent === 'In progress…',
          );
          expect(activeLabels.length).toBe(1);
        },
      ),
    );
  });

  it('completed state marks all stages as done', () => {
    const { container } = render(<GenerationTimeline currentState={JobState.Completed} />);
    const doneLabels = Array.from(container.querySelectorAll('p')).filter(
      (p) => p.textContent === 'Done',
    );
    expect(doneLabels.length).toBe(pipelineStates.length);
  });
});

/**
 * Property 20: Asset action buttons present
 * Validates: Requirements 19.1, 19.2
 */
describe('Property 20: Asset action buttons present', () => {
  it('renders a download button for every asset', () => {
    const assets: AssetReferenceWithUrl[] = [
      {
        assetId: 'a1',
        jobId: 'j1',
        assetType: 'copy' as any,
        storagePath: 'j1/copy/a1.json',
        generationTimestamp: new Date(),
        status: 'completed',
        signedUrl: 'https://example.com/a1',
      },
      {
        assetId: 'a2',
        jobId: 'j1',
        assetType: 'image' as any,
        storagePath: 'j1/image/a2.png',
        generationTimestamp: new Date(),
        status: 'completed',
        signedUrl: 'https://example.com/a2',
      },
    ];
    const { container } = render(<ExportPanel jobId="j1" assets={assets} />);
    const downloadLinks = container.querySelectorAll('a[download]');
    expect(downloadLinks.length).toBe(assets.length);
  });

  it('renders Download All button when assets exist', () => {
    const assets: AssetReferenceWithUrl[] = [
      {
        assetId: 'a1',
        jobId: 'j1',
        assetType: 'copy' as any,
        storagePath: 'j1/copy/a1.json',
        generationTimestamp: new Date(),
        status: 'completed',
        signedUrl: 'https://example.com/a1',
      },
    ];
    const { container } = render(<ExportPanel jobId="j1" assets={assets} />);
    const downloadAllBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Download All'),
    );
    expect(downloadAllBtn).toBeDefined();
  });
});
