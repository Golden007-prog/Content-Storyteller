/**
 * Bug Condition Exploration Property Tests — Media Pipeline Asset Fix
 *
 * Property 1: Bug Condition — Media Pipeline Produces Only Metadata, No Real Binary Assets
 *
 * These tests encode the EXPECTED (correct) behavior.
 * They are EXPECTED TO FAIL on unfixed code, confirming the bugs exist.
 *
 * Defect 1: Image Generation Returns Text Not Binary
 * Defect 2: Video Polling Uses Fixed Interval (no exponential backoff)
 * Defect 3: videoAssetPath Never Set in working data
 * Defect 4: GIF Conversion Stub Returns Null
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
  JobState,
  AssetType,
  AssetReference,
  FallbackNotice,
  Platform,
  Tone,
  Job,
} from '@content-storyteller/shared';

// ── Hoisted mocks ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const jobStore = new Map<string, Job>();
  const writtenAssets = new Map<string, Buffer>();

  const mockDocUpdate = vi.fn();
  const mockDocGet = vi.fn();
  const mockDoc = vi.fn().mockImplementation((id: string) => ({
    id,
    get: () => mockDocGet(id),
    update: (data: Partial<Job>) => mockDocUpdate(id, data),
  }));
  const mockCollection = vi.fn().mockReturnValue({ doc: mockDoc });

  const mockFileSave = vi.fn();
  const mockBucketFile = vi.fn().mockImplementation((name: string) => ({
    name,
    save: (data: Buffer, _opts?: unknown) => mockFileSave(name, data),
    download: () => Promise.resolve([Buffer.from('mock-media')]),
  }));
  const mockBucket = vi.fn().mockReturnValue({ file: mockBucketFile });

  const mockGenerateContent = vi.fn();
  const capabilityIsAvailable = vi.fn();
  const capabilityGenerate = vi.fn();

  function setupFirestoreMocks() {
    mockDocGet.mockImplementation((id: string) => {
      const job = jobStore.get(id);
      return Promise.resolve({ exists: !!job, data: () => job });
    });
    mockDocUpdate.mockImplementation((id: string, data: Partial<Job>) => {
      const existing = jobStore.get(id);
      if (existing) {
        const updated = { ...existing, ...data } as Job;
        if (data.assets) updated.assets = data.assets as AssetReference[];
        if (data.fallbackNotices) updated.fallbackNotices = data.fallbackNotices as FallbackNotice[];
        jobStore.set(id, updated);
      }
      return Promise.resolve();
    });
  }

  function setupStorageMocks() {
    mockFileSave.mockImplementation((name: string, data: Buffer) => {
      writtenAssets.set(name, data);
      return Promise.resolve();
    });
  }

  function setupGenAIMocks() {
    mockGenerateContent.mockImplementation(async () => {
      return JSON.stringify({
        storyboard: {
          scenes: [
            { sceneNumber: 1, description: 'Opening', duration: '5s', motionStyle: 'steady', textOverlay: 'Welcome', cameraDirection: 'wide shot' },
          ],
          totalDuration: '25s',
          pacing: 'balanced',
        },
        videoBrief: {
          totalDuration: '25s', motionStyle: 'smooth',
          textOverlayStyle: 'bold sans-serif', cameraDirection: 'mixed angles',
          energyDirection: 'builds from calm to energetic',
        },
      });
    });
  }

  return {
    jobStore, writtenAssets,
    mockDocUpdate, mockDocGet, mockDoc, mockCollection,
    mockFileSave, mockBucketFile, mockBucket,
    mockGenerateContent,
    capabilityIsAvailable, capabilityGenerate,
    setupFirestoreMocks, setupStorageMocks, setupGenAIMocks,
  };
});

// ── Mock GCP services ───────────────────────────────────────────────

vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => ({
    collection: mocks.mockCollection,
  })),
}));

vi.mock('@google-cloud/storage', () => ({
  Storage: vi.fn().mockImplementation(() => ({ bucket: mocks.mockBucket })),
}));

vi.mock('../services/genai', () => ({
  generateContent: (...args: unknown[]) => mocks.mockGenerateContent(...args),
  generateContentMultimodal: (...args: unknown[]) => mocks.mockGenerateContent(...args),
}));

vi.mock('../capabilities/capability-registry', () => ({
  capabilityRegistry: {
    get: (name: string) => {
      if (name === 'video_generation') {
        return {
          name,
          isAvailable: mocks.capabilityIsAvailable,
          generate: mocks.capabilityGenerate,
        };
      }
      return undefined;
    },
    has: (name: string) => name === 'video_generation',
    init: vi.fn(),
    all: vi.fn().mockReturnValue([]),
    register: vi.fn(),
  },
}));

vi.mock('@content-storyteller/shared', async () => {
  const actual = await vi.importActual('@content-storyteller/shared');
  return {
    ...actual,
    getModel: vi.fn().mockReturnValue('test-text-model'),
    getLocation: vi.fn().mockReturnValue('us-central1'),
  };
});

// ── Helpers ─────────────────────────────────────────────────────────

function createMockJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'test-job-id',
    correlationId: 'test-correlation-id',
    idempotencyKey: 'test-idem-key',
    state: JobState.Queued,
    uploadedMediaPaths: ['uploads/test-file.png'],
    assets: [],
    fallbackNotices: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}


import { GenerateVideo } from '../pipeline/generate-video';

// ── Defect 1: Image Generation Returns Text Not Binary ──────────────

describe('Defect 1 (PBT): ImageGenerationCapability returns real base64 binary data, not text', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('for any valid prompt, generate() returns assets containing valid base64 binary data', async () => {
    /**
     * **Validates: Requirements 1.1**
     *
     * The fixed code uses the Imagen REST API (via fetch + google-auth-library)
     * instead of VertexAI.getGenerativeModel().generateContent().
     * Mock fetch to return Imagen-style base64 binary image data.
     * Assert assets[0] is valid base64 binary data, NOT plain text.
     *
     * WILL FAIL on unfixed code: current code calls text model (Gemini) which
     * returns text descriptions like "A vibrant marketing image..." instead of
     * base64-encoded binary image data.
     */
    const prompts = fc.sample(
      fc.record({
        prompt: fc.string({ minLength: 5, maxLength: 50 }),
        audience: fc.string({ minLength: 3, maxLength: 20 }),
        tone: fc.constantFrom('cinematic', 'punchy', 'sleek', 'professional'),
      }),
      3,
    );

    // Create a fake binary image (PNG header bytes) as base64
    const fakePngBytes = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 pixel
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    ]);
    const fakePngBase64 = fakePngBytes.toString('base64');

    vi.resetModules();

    // Mock google-auth-library for access token
    vi.doMock('google-auth-library', () => ({
      GoogleAuth: vi.fn().mockImplementation(() => ({
        getAccessToken: vi.fn().mockResolvedValue('mock-imagen-token'),
      })),
    }));

    // Mock GCP config
    vi.doMock('../config/gcp', () => ({
      getGcpConfig: vi.fn().mockReturnValue({
        projectId: 'test-project',
        location: 'us-central1',
      }),
    }));

    vi.doMock('@content-storyteller/shared', async () => {
      const actual = await vi.importActual('@content-storyteller/shared');
      return {
        ...actual,
        getModel: vi.fn().mockReturnValue('imagen-3.0-generate-001'),
        getLocation: vi.fn().mockReturnValue('us-central1'),
      };
    });

    // Mock fetch to return Imagen API response with base64 binary data
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return new Response(JSON.stringify({
        predictions: [{ bytesBase64Encoded: fakePngBase64, mimeType: 'image/png' }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    // Re-import after mocking
    const { ImageGenerationCapability } = await import('../capabilities/image-generation');
    const capability = new ImageGenerationCapability();
    // Force availability
    (capability as unknown as Record<string, unknown>).cachedAvailability = true;

    for (const sample of prompts) {
      const result = await capability.generate({
        jobId: 'img-test-job',
        data: {
          prompt: sample.prompt,
          brief: {
            targetAudience: sample.audience,
            tone: sample.tone,
            keyMessages: ['Test message'],
            visualDirection: 'Modern and clean',
            inputSummary: sample.prompt,
          },
        },
      });

      // EXPECTED: generate() returns success with base64 binary data
      expect(result.success).toBe(true);
      expect(result.assets.length).toBeGreaterThan(0);

      // The asset should be valid base64 binary data, NOT plain text
      const asset = result.assets[0];
      expect(typeof asset).toBe('string');

      // Verify it's base64 binary data: should decode to bytes that are NOT
      // readable ASCII text. Text descriptions will be readable ASCII.
      const decoded = Buffer.from(asset, 'base64');

      // A valid base64 binary image should round-trip cleanly
      // AND should not be plain readable text
      const isPlainText = /^[A-Za-z\s.,!?;:'"()\-\d]+$/.test(asset);
      expect(isPlainText).toBe(false);

      // Verify the decoded bytes match our fake PNG
      expect(decoded.length).toBeGreaterThan(0);
    }
  });
});

// ── Defect 2: Video Polling Uses Fixed Interval ─────────────────────

describe('Defect 2 (PBT): VideoGenerationCapability uses exponential backoff on transient errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('after 3 consecutive transient errors, sleep intervals increase (15s → 30s → 60s)', async () => {
    /**
     * **Validates: Requirements 1.2**
     *
     * Instrument pollForCompletion() by mocking fetch to return transient errors
     * and tracking the sleep durations. Assert that intervals increase after
     * each transient error.
     *
     * WILL FAIL on unfixed code: the system always sleeps exactly 15000ms
     * (VIDEO_POLL_INTERVAL_MS) regardless of error patterns.
     */
    const sleepDurations: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;

    // We need to intercept the sleep calls to track durations
    // The sleep function in video-generation.ts uses setTimeout
    vi.useFakeTimers({ shouldAdvanceTime: true });

    vi.resetModules();

    vi.doMock('@google-cloud/storage', () => ({
      Storage: vi.fn().mockImplementation(() => ({ bucket: mocks.mockBucket })),
    }));
    vi.doMock('@google-cloud/firestore', () => ({
      Firestore: vi.fn().mockImplementation(() => ({
        collection: mocks.mockCollection,
      })),
    }));
    vi.doMock('@content-storyteller/shared', async () => {
      const actual = await vi.importActual('@content-storyteller/shared');
      return {
        ...actual,
        getModel: vi.fn().mockReturnValue('test-model'),
        getLocation: vi.fn().mockReturnValue('us-central1'),
      };
    });
    vi.doMock('google-auth-library', () => ({
      GoogleAuth: vi.fn().mockImplementation(() => ({
        getAccessToken: vi.fn().mockResolvedValue('mock-token'),
      })),
    }));

    let pollCount = 0;
    // Mock fetch: POST submit succeeds, GET polls return 3 transient errors then success
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        return new Response(JSON.stringify({ name: 'operations/backoff-test' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      pollCount++;
      if (pollCount <= 3) {
        // Transient error
        return new Response('Service Unavailable', { status: 503 });
      }
      // Success with done
      return new Response(JSON.stringify({
        done: true,
        response: { predictions: [{ bytesBase64Encoded: 'dGVzdHZpZGVv', mimeType: 'video/mp4' }] },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    const { VideoGenerationCapability } = await import('../capabilities/video-generation');
    const capability = new VideoGenerationCapability();
    (capability as unknown as Record<string, unknown>).cachedAvailability = true;

    // Spy on the global setTimeout to capture sleep durations
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const generatePromise = capability.generate({
      jobId: 'backoff-test',
      data: {
        brief: {
          targetAudience: 'developers',
          tone: 'professional',
          keyMessages: ['test'],
          visualDirection: 'clean',
          inputSummary: 'test video',
        },
      },
    });

    // Advance timers to let the polling complete
    // We need to advance enough for 4 poll iterations
    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(30_000);
    }

    const result = await generatePromise;

    vi.useRealTimers();

    // Collect all setTimeout calls that look like sleep durations (>= 10000ms)
    const sleepCalls = setTimeoutSpy.mock.calls
      .filter(call => typeof call[1] === 'number' && call[1] >= 10000)
      .map(call => call[1] as number);

    // EXPECTED: intervals should increase after transient errors
    // e.g., 15000, 30000, 60000 (exponential backoff)
    // WILL FAIL on unfixed code: all intervals are exactly 15000
    expect(sleepCalls.length).toBeGreaterThanOrEqual(3);

    // Check that intervals increase
    const firstThree = sleepCalls.slice(0, 3);
    expect(firstThree[1]).toBeGreaterThan(firstThree[0]);
    expect(firstThree[2]).toBeGreaterThan(firstThree[1]);
  }, 60_000);
});

// ── Defect 3: videoAssetPath Never Set ──────────────────────────────

describe('Defect 3 (PBT): GenerateVideo sets context.workingData.videoAssetPath after success', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.jobStore.clear();
    mocks.writtenAssets.clear();
    mocks.setupFirestoreMocks();
    mocks.setupStorageMocks();
    mocks.setupGenAIMocks();
  });

  it('for any successful video generation, videoAssetPath is defined in working data', async () => {
    /**
     * **Validates: Requirements 1.3**
     *
     * Mock capabilityRegistry.get('video_generation') to return a successful
     * result with base64 video data. Run GenerateVideo.execute(). Assert
     * context.workingData.videoAssetPath is defined and is a valid GCS path.
     *
     * WILL FAIL on unfixed code: GenerateVideo never sets videoAssetPath
     * (only sets storyboardAssetPath and videoBriefAssetPath).
     */
    const jobIds = fc.sample(fc.uuid(), 3);

    for (const jobId of jobIds) {
      mocks.jobStore.clear();
      mocks.writtenAssets.clear();

      const job = createMockJob({ id: jobId, state: JobState.Queued });
      mocks.jobStore.set(jobId, job);

      // Mock video capability to return successful result with base64 video data
      mocks.capabilityIsAvailable.mockResolvedValue(true);
      mocks.capabilityGenerate.mockResolvedValue({
        success: true,
        assets: ['dGVzdHZpZGVvZGF0YQ=='], // base64 "testvideodata"
        metadata: { jobId, model: 'test-model', operationName: 'operations/test' },
      });

      const stage = new GenerateVideo();
      const context = {
        jobId,
        correlationId: 'corr-test',
        uploadedMediaPaths: ['uploads/test.png'],
        workingData: {
          creativeBrief: {
            targetAudience: 'Developers',
            tone: Tone.Professional,
            keyMessages: ['Build great software'],
            visualDirection: 'Clean and modern',
            inputSummary: 'Test product launch',
            platform: Platform.GeneralPromoPackage,
          },
        } as Record<string, unknown>,
      };

      const result = await stage.execute(context);

      // The stage should succeed
      expect(result.success).toBe(true);

      // EXPECTED: videoAssetPath should be defined and be a valid GCS path
      // WILL FAIL on unfixed code: videoAssetPath is never set
      expect(context.workingData.videoAssetPath).toBeDefined();
      expect(typeof context.workingData.videoAssetPath).toBe('string');
      expect((context.workingData.videoAssetPath as string)).toContain(`${jobId}/video/`);
      expect((context.workingData.videoAssetPath as string)).toMatch(/\.mp4$/);

      // storyboardAssetPath and videoBriefAssetPath should still be set
      expect(context.workingData.storyboardAssetPath).toBeDefined();
      expect(context.workingData.videoBriefAssetPath).toBeDefined();
    }
  });
});

// ── Defect 4: GIF Conversion Stub Returns Null ──────────────────────

describe('Defect 4 (PBT): GifGenerationCapability.convertVideoToGif returns real GIF data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('for a valid base64 video buffer, convertVideoToGif returns non-null base64 GIF data', async () => {
    /**
     * **Validates: Requirements 1.4**
     *
     * Call GifGenerationCapability.convertVideoToGif() with a valid base64
     * video buffer. Assert it returns non-null base64 GIF data.
     *
     * WILL FAIL on unfixed code: the stub always returns null regardless
     * of input. The method has a comment "this is a placeholder" and
     * returns null unconditionally.
     */
    vi.resetModules();

    // Mock ffmpeg as available
    vi.doMock('child_process', () => ({
      execFile: vi.fn().mockImplementation(
        (cmd: string, args: string[], _opts: unknown, cb: Function) => {
          if (cmd === 'ffmpeg' && args[0] === '-version') {
            cb(null, { stdout: 'ffmpeg version 6.0', stderr: '' });
          } else {
            // Simulate ffmpeg conversion success
            cb(null, { stdout: '', stderr: '' });
          }
        },
      ),
    }));

    const { GifGenerationCapability } = await import('../capabilities/gif-generation');
    const capability = new GifGenerationCapability();

    // Create a minimal valid video buffer (base64-encoded)
    const fakeVideoBuffer = Buffer.from('fake-mp4-video-content').toString('base64');

    // Access the private method via the capability's generate method
    // We'll call generate() with a videoBuffer to exercise convertVideoToGif
    const result = await capability.generate({
      jobId: 'gif-test-job',
      data: {
        videoBuffer: fakeVideoBuffer,
      },
    });

    // EXPECTED: generate() should succeed and return base64 GIF data
    // WILL FAIL on unfixed code: convertVideoToGif() returns null,
    // causing generate() to return { success: false, reason: 'conversion-failed' }
    expect(result.success).toBe(true);
    expect(result.assets.length).toBeGreaterThan(0);
    expect(typeof result.assets[0]).toBe('string');
    // The returned data should be non-empty base64
    expect(result.assets[0].length).toBeGreaterThan(0);
  });
});
