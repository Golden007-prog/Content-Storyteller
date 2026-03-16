/**
 * Bug Condition Exploration Property Tests — Media Delivery & Video Hang
 *
 * Property 1: Bug Condition — Video Poll Silent Timeout, Video Timeout Reason
 *
 * These tests encode the EXPECTED (correct) behavior.
 * They are EXPECTED TO FAIL on unfixed code, confirming the bugs exist.
 *
 * Test 1b: pollForCompletion must emit structured log entries per poll iteration
 * Test 1c: Video timeout must surface reason 'video-generation-timeout' in stage
 *
 * **Validates: Requirements 1.4, 1.5, 1.6**
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  JobState,
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


// ── Test 1b: Video Poll Logging ─────────────────────────────────────

describe('Test 1b (PBT): Video poll emits structured log entries per iteration', () => {
  let logMessages: string[] = [];
  let originalWrite: typeof process.stdout.write;

  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.jobStore.clear();
    mocks.writtenAssets.clear();
    mocks.setupFirestoreMocks();
    mocks.setupStorageMocks();
    mocks.setupGenAIMocks();
    logMessages = [];
    originalWrite = process.stdout.write;
    // Capture structured log output from both process.stdout.write and console.log
    process.stdout.write = ((chunk: string | Uint8Array) => {
      const str = typeof chunk === 'string' ? chunk : chunk.toString();
      logMessages.push(str);
      return true;
    }) as typeof process.stdout.write;
    // Also spy on console.log since pollForCompletion uses it directly
    consoleSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logMessages.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
    consoleSpy.mockRestore();
  });

  it('for N poll iterations, N structured log entries with pollCount/elapsedMs are emitted', async () => {
    /**
     * **Validates: Requirements 1.4, 1.6**
     *
     * Test the VideoGenerationCapability's generate() with mocked fetch.
     * The fetch mock returns pending for 1 iteration then done with no video.
     * We accept the real 15s sleep per iteration and verify that each poll
     * iteration emits a structured log entry with pollCount, elapsedMs, status.
     *
     * WILL FAIL on unfixed code: pollForCompletion emits zero log messages.
     */

    // Test with N=1 to keep test duration reasonable (~15s for one sleep)
    const N = 1;
    let pollFetchCount = 0;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, options?: RequestInit) => {
      // Submit call (POST) — return operation name
      if (options?.method === 'POST') {
        return new Response(JSON.stringify({ name: 'operations/poll-test-op' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // Poll calls (GET) — return pending for N iterations, then done
      pollFetchCount++;
      if (pollFetchCount <= N) {
        return new Response(JSON.stringify({ done: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ done: true, response: { predictions: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

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

    const { VideoGenerationCapability } = await import('../capabilities/video-generation');
    const capability = new VideoGenerationCapability();
    (capability as unknown as Record<string, unknown>).cachedAvailability = true;

    await capability.generate({
      jobId: 'poll-log-test',
      data: {
        brief: {
          targetAudience: 'test',
          tone: 'professional',
          keyMessages: ['test'],
          visualDirection: 'test',
          inputSummary: 'test',
        },
      },
    });

    globalThis.fetch = originalFetch;

    // Parse log messages looking for poll iteration entries
    const pollLogs = logMessages
      .filter((msg) => {
        try {
          const parsed = JSON.parse(msg.trim());
          return (
            parsed.msg === 'Veo poll iteration' ||
            parsed.msg === 'Veo poll non-OK response' ||
            (parsed.pollCount !== undefined && parsed.elapsedMs !== undefined)
          );
        } catch {
          return false;
        }
      })
      .map((msg) => JSON.parse(msg.trim()));

    // EXPECTED: At least N structured log entries with pollCount, elapsedMs
    // WILL FAIL on unfixed code: pollForCompletion emits zero log messages
    expect(pollLogs.length).toBeGreaterThanOrEqual(N);

    for (const log of pollLogs) {
      expect(log).toHaveProperty('pollCount');
      expect(log).toHaveProperty('elapsedMs');
      expect(typeof log.pollCount).toBe('number');
      expect(typeof log.elapsedMs).toBe('number');
      expect(log.pollCount).toBeGreaterThan(0);
      expect(log).toHaveProperty('operationName');
      if (log.status !== undefined) {
        expect(['pending', 'done', 'error', 'transient-error']).toContain(log.status);
      }
    }
  }, 60_000); // 60s timeout to accommodate real 15s sleep interval
});


// ── Test 1c: Video Timeout Reason ───────────────────────────────────

describe('Test 1c (PBT): Video timeout surfaces video-generation-timeout reason in stage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.jobStore.clear();
    mocks.writtenAssets.clear();
    mocks.setupFirestoreMocks();
    mocks.setupStorageMocks();
    mocks.setupGenAIMocks();
  });

  it('when video generation returns timeout-or-no-video, the stage records video-generation-timeout fallback', async () => {
    /**
     * **Validates: Requirements 1.4, 1.5**
     *
     * Mock video capability to return { success: false, reason: 'timeout-or-no-video' }.
     * Assert that the GenerateVideo stage records a fallback notice with
     * reason 'video-generation-timeout' (not the raw 'timeout-or-no-video').
     *
     * WILL FAIL on unfixed code: reason stays as generic 'timeout-or-no-video'
     * without the mapping in generate-video.ts.
     */
    const jobIds = fc.sample(fc.uuid(), 5);

    for (const jobId of jobIds) {
      mocks.jobStore.clear();
      mocks.writtenAssets.clear();

      const job = createMockJob({ id: jobId, state: JobState.Queued });
      mocks.jobStore.set(jobId, job);

      // Mock capability to return timeout-or-no-video
      mocks.capabilityIsAvailable.mockResolvedValue(true);
      mocks.capabilityGenerate.mockResolvedValue({
        success: false,
        assets: [],
        metadata: { jobId, reason: 'timeout-or-no-video', operationName: 'operations/test-op' },
      });

      const stage = new GenerateVideo();
      const result = await stage.execute({
        jobId,
        correlationId: 'corr-test',
        uploadedMediaPaths: ['uploads/test.png'],
        workingData: {
          creativeBrief: {
            targetAudience: 'Devs',
            tone: Tone.Cinematic,
            keyMessages: ['Build'],
            visualDirection: 'Clean',
            inputSummary: 'Test',
            platform: Platform.GeneralPromoPackage,
          },
        },
      });

      // After the asset-delivery-rendering-fix, GenerateVideo returns success: false
      // when the video capability returns failure/timeout
      expect(result.success).toBe(false);

      // Check the fallback notice recorded in Firestore
      const finalJob = mocks.jobStore.get(jobId)!;
      const videoNotice = finalJob.fallbackNotices.find(
        (n: FallbackNotice) => n.capability === 'video_generation',
      );

      expect(videoNotice).toBeDefined();

      // EXPECTED: reason should be 'video-generation-timeout' (mapped from 'timeout-or-no-video')
      // WILL FAIL on unfixed code: reason is the raw 'timeout-or-no-video' or
      // a generic message without the specific timeout mapping
      expect(videoNotice!.reason).toBe('video-generation-timeout');
    }
  });
});
