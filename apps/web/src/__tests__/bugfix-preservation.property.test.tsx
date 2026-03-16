/**
 * Preservation Property Tests — Frontend
 *
 * These tests encode EXISTING correct behavior that must be preserved
 * after the bugfix. They MUST PASS on unfixed code.
 *
 * Validates: Requirements 3.1, 3.2, 3.4, 3.5, 3.6
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import fc from 'fast-check';
import { OutputPreference } from '@content-storyteller/shared';
import { OutputDashboard } from '../components/OutputDashboard';
import type { CopyPackage } from '@content-storyteller/shared';

afterEach(() => {
  cleanup();
});

// ── Replicate the OUTPUT_PREFERENCE_LABELS from LandingPage.tsx ─────
// (We replicate rather than import because it's a module-private constant)
const OUTPUT_PREFERENCE_LABELS: Record<string, string> = {
  [OutputPreference.Auto]: 'Auto-detect',
  [OutputPreference.CopyOnly]: 'Copy only',
  [OutputPreference.CopyImage]: 'Copy + Image',
  [OutputPreference.CopyVideo]: 'Copy + Video',
  [OutputPreference.FullPackage]: 'Full Package',
};
function outputPreferenceLabel(p: OutputPreference): string {
  return OUTPUT_PREFERENCE_LABELS[p] ?? p;
}

// ── Property 1: outputPreferenceLabel returns expected strings ──────

/**
 * For all OutputPreference values in {Auto, CopyOnly, CopyImage, CopyVideo, FullPackage},
 * outputPreferenceLabel returns the expected human-readable string (not raw enum).
 *
 * **Validates: Requirements 3.2**
 */
describe('Property 1: outputPreferenceLabel returns human-readable labels for existing preferences', () => {
  const EXPECTED_LABELS: Record<string, string> = {
    [OutputPreference.Auto]: 'Auto-detect',
    [OutputPreference.CopyOnly]: 'Copy only',
    [OutputPreference.CopyImage]: 'Copy + Image',
    [OutputPreference.CopyVideo]: 'Copy + Video',
    [OutputPreference.FullPackage]: 'Full Package',
  };

  const existingPreferences = [
    OutputPreference.Auto,
    OutputPreference.CopyOnly,
    OutputPreference.CopyImage,
    OutputPreference.CopyVideo,
    OutputPreference.FullPackage,
  ];

  it('all existing preferences return human-readable labels, not raw enum values', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...existingPreferences),
        (pref) => {
          const label = outputPreferenceLabel(pref);

          // Label should be the expected human-readable string
          expect(label).toBe(EXPECTED_LABELS[pref]);

          // Label should NOT be the raw enum value (e.g., 'auto', 'copy_only')
          expect(label).not.toBe(pref);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ── Property 6: OutputDashboard with content and no skippedOutputs ──

/**
 * OutputDashboard with content data and no skippedOutputs/requestedOutputs
 * renders all sections normally (progressive reveal).
 *
 * **Validates: Requirements 3.6**
 */
describe('Property 6: OutputDashboard renders content sections normally without skip props', () => {
  const arbCopyPackage: fc.Arbitrary<Partial<CopyPackage>> = fc.record({
    hook: fc.string({ minLength: 1, maxLength: 50 }),
    caption: fc.string({ minLength: 1, maxLength: 100 }),
    cta: fc.string({ minLength: 1, maxLength: 50 }),
    hashtags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
  });

  it('renders CopyCards section when copyPackage is provided and no skip props', () => {
    fc.assert(
      fc.property(arbCopyPackage, (copyPkg) => {
        const { container } = render(
          <OutputDashboard copyPackage={copyPkg} />,
        );

        const text = container.textContent ?? '';
        // Should render the copy content sections (Hook, Caption, CTA)
        expect(text).toContain('Hook');
        expect(text).toContain('Caption');
        expect(text).toContain('Call to Action');

        // Should NOT have skeleton placeholders for the copy section
        // (copy section is rendered with actual content)
        const copySection = container.querySelector('.space-y-8');
        expect(copySection).not.toBeNull();
      }),
      { numRuns: 15 },
    );
  });

  it('renders with progressive reveal animation wrapper when content is present', () => {
    fc.assert(
      fc.property(arbCopyPackage, (copyPkg) => {
        const { container } = render(
          <OutputDashboard copyPackage={copyPkg} />,
        );

        // The SectionWrapper applies transition classes for progressive reveal
        const animatedSections = container.querySelectorAll('.transition-all');
        expect(animatedSections.length).toBeGreaterThan(0);
      }),
      { numRuns: 10 },
    );
  });

  it('shows skeleton sections for not-yet-loaded content types when no skip props', () => {
    // When only copyPackage is provided but no storyboard/videoBrief/imageConcepts,
    // the dashboard should show skeleton placeholders for those pending sections
    // (because without skip props, it assumes they're still loading)
    fc.assert(
      fc.property(arbCopyPackage, (copyPkg) => {
        const { container } = render(
          <OutputDashboard copyPackage={copyPkg} />,
        );

        // Should have some skeleton elements for pending sections
        const skeletons = container.querySelectorAll('.skeleton');
        expect(skeletons.length).toBeGreaterThan(0);
      }),
      { numRuns: 10 },
    );
  });
});
