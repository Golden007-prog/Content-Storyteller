import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { OutputPreferenceSelector } from '../components/OutputPreferenceSelector';
import { OutputDashboard } from '../components/OutputDashboard';
import { ExportPanel } from '../components/ExportPanel';
import { OutputPreference } from '@content-storyteller/shared';
import type { GifAssetMetadata, AssetReferenceWithUrl } from '@content-storyteller/shared';

afterEach(() => {
  cleanup();
});

/* ══════════════════════════════════════════════════════════════════
   7.5.1 — OutputPreferenceSelector renders "Copy + GIF" option
   Validates: Requirements 4.1, 4.2
   ══════════════════════════════════════════════════════════════════ */

describe('OutputPreferenceSelector GIF option', () => {
  it('renders "Copy + GIF" label', () => {
    render(
      <OutputPreferenceSelector
        value={OutputPreference.Auto}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Copy + GIF')).toBeDefined();
  });

  it('renders "Text with animated GIF explainer" description', () => {
    render(
      <OutputPreferenceSelector
        value={OutputPreference.Auto}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Text with animated GIF explainer')).toBeDefined();
  });

  it('maintains all existing options alongside Copy + GIF', () => {
    render(
      <OutputPreferenceSelector
        value={OutputPreference.Auto}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Auto-detect')).toBeDefined();
    expect(screen.getByText('Copy only')).toBeDefined();
    expect(screen.getByText('Copy + Image')).toBeDefined();
    expect(screen.getByText('Copy + Video')).toBeDefined();
    expect(screen.getByText('Copy + GIF')).toBeDefined();
    expect(screen.getByText('Full Package')).toBeDefined();
  });
});

/* ══════════════════════════════════════════════════════════════════
   7.5.2 — OutputDashboard renders GifPreview when GIF asset present
   Validates: Requirements 8.1
   ══════════════════════════════════════════════════════════════════ */

const sampleGifAsset: GifAssetMetadata = {
  url: 'https://storage.example.com/test-job/gifs/abc123.gif',
  mimeType: 'image/gif',
  width: 480,
  height: 270,
  durationMs: 3000,
  loop: true,
  fileSizeBytes: 1024000,
};

describe('OutputDashboard GIF rendering', () => {
  it('renders GifPreview with "GIF Preview" heading when gifAsset is present', () => {
    render(
      <OutputDashboard
        copyPackage={{ hook: 'Test hook', caption: 'Test caption' }}
        gifAsset={sampleGifAsset}
      />,
    );
    expect(screen.getByText('GIF Preview')).toBeDefined();
  });

  it('renders the GIF image element with correct src', () => {
    render(
      <OutputDashboard
        copyPackage={{ hook: 'Test hook', caption: 'Test caption' }}
        gifAsset={sampleGifAsset}
      />,
    );
    const img = screen.getByAltText('Generated GIF preview');
    expect(img).toBeDefined();
    expect(img.getAttribute('src')).toBe(sampleGifAsset.url);
  });

  it('does NOT render GifPreview when gifAsset is null', () => {
    render(
      <OutputDashboard
        copyPackage={{ hook: 'Test hook', caption: 'Test caption' }}
        gifAsset={null}
      />,
    );
    expect(screen.queryByText('GIF Preview')).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════
   7.5.3 — OutputDashboard hides GIF section when "gif" is skipped
   Validates: Requirements 8.3
   ══════════════════════════════════════════════════════════════════ */

describe('OutputDashboard GIF skipped outputs', () => {
  it('hides GIF section when "gif" is in skippedOutputs', () => {
    render(
      <OutputDashboard
        copyPackage={{ hook: 'Test hook', caption: 'Test caption' }}
        gifAsset={sampleGifAsset}
        skippedOutputs={['gif']}
      />,
    );
    expect(screen.queryByText('GIF Preview')).toBeNull();
  });

  it('shows GIF section when skippedOutputs does not include "gif"', () => {
    render(
      <OutputDashboard
        copyPackage={{ hook: 'Test hook', caption: 'Test caption' }}
        gifAsset={sampleGifAsset}
        skippedOutputs={['video']}
      />,
    );
    expect(screen.getByText('GIF Preview')).toBeDefined();
  });
});

/* ══════════════════════════════════════════════════════════════════
   7.5.4 — ExportPanel includes GIF in asset list with "GIF" label
   Validates: Requirements 8.4
   ══════════════════════════════════════════════════════════════════ */

describe('ExportPanel GIF asset label', () => {
  const gifAssetRef: AssetReferenceWithUrl = {
    assetId: 'gif-001',
    jobId: 'test-job',
    assetType: 'gif' as any,
    storagePath: 'test-job/gifs/gif-001.gif',
    generationTimestamp: new Date(),
    status: 'completed',
    signedUrl: 'https://storage.example.com/test-job/gifs/gif-001.gif',
  };

  it('renders "GIF" label for gif asset type', () => {
    render(<ExportPanel jobId="test-job" assets={[gifAssetRef]} />);
    expect(screen.getByText('GIF')).toBeDefined();
  });

  it('renders download link for GIF asset', () => {
    render(<ExportPanel jobId="test-job" assets={[gifAssetRef]} />);
    expect(screen.getByText('Download')).toBeDefined();
  });
});
