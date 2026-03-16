/**
 * Preservation Property Tests — Media Pipeline Asset Fix (Frontend)
 *
 * Property 2: Preservation — Frontend Text Component Rendering
 *
 * These tests verify EXISTING working behavior that must NOT be broken
 * by the upcoming fixes. They MUST PASS on the current unfixed code.
 *
 * Preservation G — Frontend Text Component Rendering
 *
 * **Validates: Requirements 18.1**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { render, screen } from '@testing-library/react';
import { CopyCards } from '../components/CopyCards';
import { StoryboardView } from '../components/StoryboardView';
import { VoiceoverView } from '../components/VoiceoverView';
import type { CopyPackage, Storyboard } from '@content-storyteller/shared';

// ── Generators ──────────────────────────────────────────────────────

const copyPackageArb = fc.record({
  hook: fc.string({ minLength: 1, maxLength: 60 }),
  caption: fc.string({ minLength: 1, maxLength: 120 }),
  cta: fc.string({ minLength: 1, maxLength: 40 }),
  hashtags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
  voiceoverScript: fc.string({ minLength: 1, maxLength: 100 }),
  onScreenText: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 4 }),
  threadCopy: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 3 }),
});

const storyboardArb = fc.record({
  scenes: fc.array(
    fc.record({
      sceneNumber: fc.integer({ min: 1, max: 10 }),
      description: fc.string({ minLength: 1, maxLength: 60 }),
      duration: fc.constantFrom('3s', '5s', '8s', '10s'),
      motionStyle: fc.string({ minLength: 1, maxLength: 20 }),
      textOverlay: fc.string({ minLength: 1, maxLength: 30 }),
      cameraDirection: fc.string({ minLength: 1, maxLength: 20 }),
    }),
    { minLength: 1, maxLength: 4 },
  ),
  totalDuration: fc.constantFrom('15s', '25s', '30s', '60s'),
  pacing: fc.constantFrom('balanced', 'fast', 'slow', 'dynamic'),
});

// ── Preservation G: CopyCards Rendering ─────────────────────────────

describe('Preservation G (PBT): CopyCards renders text content correctly', () => {
  it('for any valid CopyPackage, CopyCards renders hook, caption, cta, and hashtags', () => {
    /**
     * **Validates: Requirements 18.1**
     *
     * CopyCards must continue to render text-based copy content
     * identically with no visual or functional changes.
     */
    fc.assert(
      fc.property(copyPackageArb, (cp) => {
        const { container, unmount } = render(<CopyCards copyPackage={cp} />);

        // Hook should be rendered
        expect(container.textContent).toContain(cp.hook);

        // Caption should be rendered
        expect(container.textContent).toContain(cp.caption);

        // CTA should be rendered
        expect(container.textContent).toContain(cp.cta);

        // Hashtags should be rendered (with # prefix)
        for (const tag of cp.hashtags) {
          const displayTag = tag.startsWith('#') ? tag : `#${tag}`;
          expect(container.textContent).toContain(displayTag);
        }

        // Section header should be present
        expect(container.textContent).toContain('Copy Package');

        // Copy buttons should be present
        const copyButtons = container.querySelectorAll('button');
        expect(copyButtons.length).toBeGreaterThan(0);

        unmount();
      }),
      { numRuns: 10 },
    );
  });

  it('CopyCards renders nothing problematic with empty/partial CopyPackage', () => {
    /**
     * **Validates: Requirements 18.1**
     */
    const { container, unmount } = render(<CopyCards copyPackage={{}} />);

    // Should still render the section header
    expect(container.textContent).toContain('Copy Package');

    // Should not crash
    expect(container).toBeDefined();

    unmount();
  });
});

// ── Preservation G: StoryboardView Rendering ────────────────────────

describe('Preservation G (PBT): StoryboardView renders storyboard content correctly', () => {
  it('for any valid Storyboard, StoryboardView renders scenes with descriptions', () => {
    /**
     * **Validates: Requirements 18.1**
     *
     * StoryboardView must continue to render storyboard scenes
     * identically with no visual or functional changes.
     */
    fc.assert(
      fc.property(storyboardArb, (sb) => {
        const { container, unmount } = render(<StoryboardView storyboard={sb} />);

        // Section header should be present
        expect(container.textContent).toContain('Storyboard');

        // Each scene description should be rendered
        for (const scene of sb.scenes) {
          expect(container.textContent).toContain(scene.description);
        }

        // Total duration should be rendered
        if (sb.totalDuration) {
          expect(container.textContent).toContain(sb.totalDuration);
        }

        // Pacing should be rendered
        if (sb.pacing) {
          expect(container.textContent).toContain(sb.pacing);
        }

        unmount();
      }),
      { numRuns: 10 },
    );
  });

  it('StoryboardView shows "No scenes available" for empty scenes', () => {
    /**
     * **Validates: Requirements 18.1**
     */
    const { container, unmount } = render(<StoryboardView storyboard={{ scenes: [] }} />);

    expect(container.textContent).toContain('No scenes available');

    unmount();
  });
});

// ── Preservation G: VoiceoverView Rendering ─────────────────────────

describe('Preservation G (PBT): VoiceoverView renders voiceover content correctly', () => {
  it('for any valid voiceover data, VoiceoverView renders script and on-screen text', () => {
    /**
     * **Validates: Requirements 18.1**
     *
     * VoiceoverView must continue to render voiceover script and
     * on-screen text identically with no visual or functional changes.
     */
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 4 }),
        (script, onScreenText) => {
          const { container, unmount } = render(
            <VoiceoverView voiceoverScript={script} onScreenText={onScreenText} />,
          );

          // Section header should be present
          expect(container.textContent).toContain('Voiceover');

          // Voiceover script should be rendered
          expect(container.textContent).toContain(script);

          // On-screen text items should be rendered
          for (const item of onScreenText) {
            expect(container.textContent).toContain(item);
          }

          unmount();
        },
      ),
      { numRuns: 10 },
    );
  });

  it('VoiceoverView returns null when no voiceover data provided', () => {
    /**
     * **Validates: Requirements 18.1**
     */
    const { container, unmount } = render(
      <VoiceoverView voiceoverScript={undefined} onScreenText={undefined} />,
    );

    // Should render nothing (null)
    expect(container.innerHTML).toBe('');

    unmount();
  });

  it('VoiceoverView renders only script when no on-screen text', () => {
    /**
     * **Validates: Requirements 18.1**
     */
    const { container, unmount } = render(
      <VoiceoverView voiceoverScript="Test voiceover script" onScreenText={[]} />,
    );

    expect(container.textContent).toContain('Test voiceover script');
    expect(container.textContent).toContain('Voiceover Script');

    unmount();
  });
});
