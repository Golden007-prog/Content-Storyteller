import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Platform, Tone, JobState } from '@content-storyteller/shared';
import { LandingPage } from '../components/LandingPage';
import { UploadForm } from '../components/UploadForm';
import { GenerationTimeline } from '../components/GenerationTimeline';
import { OutputDashboard } from '../components/OutputDashboard';
import { ExportPanel } from '../components/ExportPanel';

afterEach(() => {
  cleanup();
});

describe('LandingPage', () => {
  it('renders hero heading and form elements', () => {
    const onStartJob = vi.fn().mockResolvedValue('job-1');
    render(<LandingPage onStartJob={onStartJob} error={null} isSubmitting={false} />);

    expect(screen.getByText(/Batch Mode Creator/i)).toBeDefined();
    expect(screen.getByLabelText(/What are you promoting/i)).toBeDefined();
    expect(screen.getByText(/Generate Package/i)).toBeDefined();
  });

  it('shows validation error when submitting empty prompt', async () => {
    const onStartJob = vi.fn().mockResolvedValue('job-1');
    const { container } = render(<LandingPage onStartJob={onStartJob} error={null} isSubmitting={false} />);

    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(submitBtn);

    expect(screen.getByText(/Please enter a text prompt/i)).toBeDefined();
    expect(onStartJob).not.toHaveBeenCalled();
  });

  it('displays error prop when provided', () => {
    const onStartJob = vi.fn().mockResolvedValue('job-1');
    render(<LandingPage onStartJob={onStartJob} error="Something went wrong" isSubmitting={false} />);

    expect(screen.getByText('Something went wrong')).toBeDefined();
  });

  it('disables submit button when isSubmitting is true', () => {
    const onStartJob = vi.fn().mockResolvedValue('job-1');
    render(<LandingPage onStartJob={onStartJob} error={null} isSubmitting={true} />);

    const btn = screen.getByText(/Generating/i);
    expect(btn).toBeDefined();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});


describe('UploadForm', () => {
  it('renders drop zone with browse prompt', () => {
    const { container } = render(<UploadForm files={[]} onFilesChange={() => {}} />);
    expect(container.textContent).toContain('Drag & drop files or click to browse');
  });

  it('renders file thumbnails when files are provided', () => {
    const files = [
      new File(['content'], 'photo.png', { type: 'image/png' }),
      new File(['audio'], 'voice.mp3', { type: 'audio/mpeg' }),
    ];
    const { container } = render(<UploadForm files={files} onFilesChange={() => {}} />);

    // Component renders thumbnails with remove buttons, not filenames as text
    const removeButtons = container.querySelectorAll('button[aria-label]');
    const labels = Array.from(removeButtons).map((b) => b.getAttribute('aria-label'));
    expect(labels).toContain('Remove photo.png');
    expect(labels).toContain('Remove voice.mp3');
  });

  it('calls onFilesChange when remove button is clicked', () => {
    const onFilesChange = vi.fn();
    const files = [new File(['a'], 'test.png', { type: 'image/png' })];
    render(<UploadForm files={files} onFilesChange={onFilesChange} />);

    const removeBtn = screen.getByLabelText(/Remove test.png/i);
    fireEvent.click(removeBtn);

    expect(onFilesChange).toHaveBeenCalledWith([]);
  });
});

describe('GenerationTimeline', () => {
  it('shows pending state for stages after current', () => {
    const { container } = render(<GenerationTimeline currentState={JobState.ProcessingInput} />);
    const items = container.querySelectorAll('[role="listitem"]');
    expect(items.length).toBe(6);
  });

  it('shows all stages completed when state is Completed', () => {
    const { container } = render(<GenerationTimeline currentState={JobState.Completed} />);
    const doneLabels = Array.from(container.querySelectorAll('p')).filter(
      (p) => p.textContent === 'Done',
    );
    expect(doneLabels.length).toBe(6);
  });

  it('shows active indicator with "In progress" text', () => {
    const { container } = render(<GenerationTimeline currentState={JobState.GeneratingCopy} />);
    const inProgressElements = Array.from(container.querySelectorAll('p')).filter(
      (p) => p.textContent === 'In progress…',
    );
    expect(inProgressElements.length).toBeGreaterThanOrEqual(1);
  });
});

describe('ExportPanel', () => {
  it('shows empty state when no assets', () => {
    render(<ExportPanel jobId="j1" assets={[]} />);
    expect(screen.getByText(/No assets available/i)).toBeDefined();
  });

  it('renders Download All button when assets exist', () => {
    const assets = [
      {
        assetId: 'a1',
        jobId: 'j1',
        assetType: 'copy' as any,
        storagePath: 'j1/copy/a1.json',
        generationTimestamp: new Date(),
        status: 'completed' as const,
        signedUrl: 'https://example.com/a1',
      },
    ];
    render(<ExportPanel jobId="j1" assets={assets} />);
    expect(screen.getByText(/Download All/i)).toBeDefined();
  });
});

describe('API client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('createJob sends correct payload format', async () => {
    const mockResponse = { jobId: 'test-job-123', correlationId: 'corr-1' };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const { createJob } = await import('../api/client');
    const result = await createJob({
      uploadedMediaPaths: ['path/to/file.png'],
      idempotencyKey: 'key-1',
      promptText: 'Test prompt',
      platform: Platform.InstagramReel,
      tone: Tone.Cinematic,
    });

    expect(result.jobId).toBe('test-job-123');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, options] = fetchSpy.mock.calls[0];
    expect((url as string).endsWith('/api/v1/jobs')).toBe(true);
    expect(options?.method).toBe('POST');

    const body = JSON.parse(options?.body as string);
    expect(body.promptText).toBe('Test prompt');
    expect(body.platform).toBe(Platform.InstagramReel);
    expect(body.tone).toBe(Tone.Cinematic);
  });

  it('createJob throws on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: { message: 'MISSING_PROMPT' } }),
    } as any);

    const { createJob } = await import('../api/client');
    await expect(
      createJob({
        uploadedMediaPaths: [],
        idempotencyKey: 'key-2',
        promptText: '',
        platform: Platform.InstagramReel,
        tone: Tone.Cinematic,
      }),
    ).rejects.toThrow('MISSING_PROMPT');
  });
});


describe('UploadForm — drag-and-drop', () => {
  it('calls onFilesChange when files are dropped', () => {
    const onFilesChange = vi.fn();
    const { container } = render(<UploadForm files={[]} onFilesChange={onFilesChange} />);

    const dropZone = container.querySelector('[role="button"]') as HTMLElement;
    const file = new File(['img'], 'dropped.png', { type: 'image/png' });

    const dataTransfer = {
      files: [file],
      items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
      types: ['Files'],
    };

    fireEvent.dragOver(dropZone, { dataTransfer });
    fireEvent.drop(dropZone, { dataTransfer });

    expect(onFilesChange).toHaveBeenCalledTimes(1);
    const newFiles = onFilesChange.mock.calls[0][0] as File[];
    expect(newFiles.length).toBe(1);
    expect(newFiles[0].name).toBe('dropped.png');
  });

  it('shows drag-over visual feedback', () => {
    const { container } = render(<UploadForm files={[]} onFilesChange={() => {}} />);
    const dropZone = container.querySelector('[role="button"]') as HTMLElement;

    fireEvent.dragOver(dropZone, {
      dataTransfer: { files: [], items: [], types: ['Files'] },
    });

    // Drag-over applies brand styling (border-brand-400, bg-brand-50)
    expect(dropZone.className).toContain('border-brand-400');
  });
});

describe('OutputDashboard — progressive reveal', () => {
  it('renders skeleton loaders when no content is provided', () => {
    const { container } = render(<OutputDashboard />);
    const skeletons = container.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('reveals copy section when copyPackage is provided', () => {
    const { container } = render(
      <OutputDashboard
        copyPackage={{
          hook: 'Great hook',
          caption: 'Nice caption',
          cta: 'Buy now',
          hashtags: ['#test'],
          threadCopy: [],
          voiceoverScript: '',
          onScreenText: [],
        }}
      />,
    );
    expect(container.textContent).toContain('Great hook');
    expect(container.textContent).toContain('Nice caption');
  });

  it('shows storyboard section only after storyboard data arrives', () => {
    const { container, rerender } = render(
      <OutputDashboard
        copyPackage={{ hook: 'H', caption: 'C', cta: 'CTA', hashtags: [], threadCopy: [], voiceoverScript: '', onScreenText: [] }}
      />,
    );
    // Storyboard skeleton should be present
    expect(container.textContent).not.toContain('Scene 1');

    rerender(
      <OutputDashboard
        copyPackage={{ hook: 'H', caption: 'C', cta: 'CTA', hashtags: [], threadCopy: [], voiceoverScript: '', onScreenText: [] }}
        storyboard={{
          scenes: [{ sceneNumber: 1, description: 'Opening shot', duration: '3s', motionStyle: 'zoom', textOverlay: 'Title', cameraDirection: 'wide' }],
          totalDuration: '15s',
          pacing: 'fast',
        }}
      />,
    );
    expect(container.textContent).toContain('Opening shot');
  });

  it('renders image concepts when provided', () => {
    const { container } = render(
      <OutputDashboard
        copyPackage={{ hook: 'H', caption: 'C', cta: 'CTA', hashtags: [], threadCopy: [], voiceoverScript: '', onScreenText: [] }}
        imageConcepts={[
          { conceptName: 'Hero Shot', visualDirection: 'Bright and bold', generationPrompt: 'prompt', style: 'modern' },
        ]}
      />,
    );
    expect(container.textContent).toContain('Hero Shot');
  });
});

describe('ExportPanel — download buttons', () => {
  it('renders individual download links for each asset', () => {
    const assets = [
      {
        assetId: 'a1', jobId: 'j1', assetType: 'copy' as any,
        storagePath: 'j1/copy/a1.json', generationTimestamp: new Date(),
        status: 'completed' as const, signedUrl: 'https://example.com/a1',
      },
      {
        assetId: 'a2', jobId: 'j1', assetType: 'image' as any,
        storagePath: 'j1/images/a2.png', generationTimestamp: new Date(),
        status: 'completed' as const, signedUrl: 'https://example.com/a2',
      },
    ];
    const { container } = render(<ExportPanel jobId="j1" assets={assets} />);
    const downloadLinks = container.querySelectorAll('a[download]');
    expect(downloadLinks.length).toBe(2);
    expect((downloadLinks[0] as HTMLAnchorElement).href).toBe('https://example.com/a1');
    expect((downloadLinks[1] as HTMLAnchorElement).href).toBe('https://example.com/a2');
  });

  it('renders copy-to-clipboard button for text assets', () => {
    const assets = [
      {
        assetId: 'a1', jobId: 'j1', assetType: 'copy' as any,
        storagePath: 'j1/copy/a1.json', generationTimestamp: new Date(),
        status: 'completed' as const, signedUrl: 'https://example.com/a1',
      },
    ];
    render(<ExportPanel jobId="j1" assets={assets} />);
    expect(screen.getByText('Copy')).toBeDefined();
  });
});

describe('API client — uploadFiles, pollJob, getAssets', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uploadFiles sends FormData with files', async () => {
    const mockUploads = [{ uploadPath: 'uploads/corr/photo.png', fileName: 'photo.png', contentType: 'image/png', size: 100, storageBucket: 'bucket' }];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ uploads: mockUploads }),
    } as Response);

    const { uploadFiles } = await import('../api/client');
    const file = new File(['img'], 'photo.png', { type: 'image/png' });
    const result = await uploadFiles([file]);

    expect(result).toEqual(mockUploads);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect((url as string).endsWith('/api/v1/upload')).toBe(true);
    expect(options?.method).toBe('POST');
    expect(options?.body).toBeInstanceOf(FormData);
  });

  it('pollJob fetches correct URL and returns response', async () => {
    const mockPoll = { jobId: 'j1', state: 'completed', assets: [] };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPoll),
    } as Response);

    const { pollJob } = await import('../api/client');
    const result = await pollJob('j1');

    expect(result).toEqual(mockPoll);
    const [url] = fetchSpy.mock.calls[0];
    expect((url as string).endsWith('/api/v1/jobs/j1')).toBe(true);
  });

  it('getAssets fetches correct URL and returns response', async () => {
    const mockAssets = { assets: [{ assetId: 'a1', signedUrl: 'https://example.com/a1' }] };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockAssets),
    } as Response);

    const { getAssets } = await import('../api/client');
    const result = await getAssets('j1');

    expect(result).toEqual(mockAssets);
    const [url] = fetchSpy.mock.calls[0];
    expect((url as string).endsWith('/api/v1/jobs/j1/assets')).toBe(true);
  });

  it('uploadFiles throws on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: { message: 'UNSUPPORTED_FILE_TYPE' } }),
    } as any);

    const { uploadFiles } = await import('../api/client');
    await expect(uploadFiles([new File(['x'], 'bad.exe', { type: 'application/x-msdownload' })])).rejects.toThrow('UNSUPPORTED_FILE_TYPE');
  });
});
