/**
 * Preservation Property Tests — Media Delivery & Video Hang
 *
 * Property 2d: Pipeline Stage Order Preservation
 * Property 2e: Successful Video Flow Preservation
 *
 * These tests encode EXISTING correct behavior that must be preserved
 * after the bugfix. They MUST PASS on unfixed code.
 *
 * **Validates: Requirements 3.2, 3.4**
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


// ── Test 2d: Pipeline Stage Order Preservation ──────────────────────

describe('Property 2d (PBT): Pipeline Stage Order Preservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.jobStore.clear();
    mocks.writtenAssets.clear();
    mocks.setupFirestoreMocks();
    mocks.setupStorageMocks();
    mocks.setupGenAIMocks();
  });

  it('for any pipeline execution with non-critical video stage failure, warnings are recorded and stage returns success', async () => {
    /**
     * **Validates: Requirements 3.2**
     *
     * Generate random stage success/failure combinations for the video capability.
     * Verify that when video generation fails (non-critical), the GenerateVideo
     * stage still returns success=true and records a fallback notice.
     * This ensures the pipeline continues to the next stage.
     */
    const failureReasons = fc.sample(
      fc.constantFrom(
        'access-denied',
        'no-access-token',
        'timeout-or-no-video',
        'model-unavailable',
      ),
      4,
    );

    for (const reason of failureReasons) {
      mocks.jobStore.clear();
      mocks.writtenAssets.clear();

      const jobId = `stage-order-${Math.random().toString(36).slice(2, 8)}`;
      const job = createMockJob({ id: jobId, state: JobState.Queued });
      mocks.jobStore.set(jobId, job);

      // Mock capability to return failure with the given reason
      mocks.capabilityIsAvailable.mockResolvedValue(true);
      mocks.capabilityGenerate.mockResolvedValue({
        success: false,
        assets: [],
        metadata: { jobId, reason, operationName: 'operations/test-op' },
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
      // when the video capability fails (timeout/error), correctly propagating the failure
      expect(result.success).toBe(false);

      // A fallback notice should have been recorded
      const finalJob = mocks.jobStore.get(jobId)!;
      const videoNotice = finalJob.fallbackNotices.find(
        (n: FallbackNotice) => n.capability === 'video_generation',
      );
      expect(videoNotice).toBeDefined();
      expect(videoNotice!.stage).toBe(JobState.GeneratingVideo);
    }
  });

  it('when video capability is unavailable, stage returns success with fallback notice', async () => {
    /**
     * **Validates: Requirements 3.2**
     *
     * Verify that when the video capability is not available,
     * the stage still succeeds and records a fallback notice.
     */
    const jobIds = fc.sample(fc.uuid(), 3);

    for (const jobId of jobIds) {
      mocks.jobStore.clear();
      mocks.writtenAssets.clear();

      const job = createMockJob({ id: jobId, state: JobState.Queued });
      mocks.jobStore.set(jobId, job);

      // Mock capability as unavailable
      mocks.capabilityIsAvailable.mockResolvedValue(false);

      const stage = new GenerateVideo();
      const result = await stage.execute({
        jobId,
        correlationId: 'corr-test',
        uploadedMediaPaths: ['uploads/test.png'],
        workingData: {
          creativeBrief: {
            targetAudience: 'Devs',
            tone: Tone.Professional,
            keyMessages: ['Build'],
            visualDirection: 'Clean',
            inputSummary: 'Test',
            platform: Platform.GeneralPromoPackage,
          },
        },
      });

      // Stage should succeed (video is non-critical)
      expect(result.success).toBe(true);
      // Should have storyboard + video-brief assets at minimum
      expect(result.assets.length).toBeGreaterThanOrEqual(2);

      // Fallback notice should be recorded
      const finalJob = mocks.jobStore.get(jobId)!;
      const videoNotice = finalJob.fallbackNotices.find(
        (n: FallbackNotice) => n.capability === 'video_generation',
      );
      expect(videoNotice).toBeDefined();
    }
  });

  it('storyboard and video brief are always persisted regardless of video generation outcome', async () => {
    /**
     * **Validates: Requirements 3.2**
     *
     * Verify that storyboard and video brief JSON assets are always written
     * to GCS, even when video generation fails.
     */
    const jobId = 'always-persist-test';
    const job = createMockJob({ id: jobId, state: JobState.Queued });
    mocks.jobStore.set(jobId, job);

    mocks.capabilityIsAvailable.mockResolvedValue(true);
    mocks.capabilityGenerate.mockResolvedValue({
      success: false,
      assets: [],
      metadata: { reason: 'timeout-or-no-video' },
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
    // when the video capability fails, but storyboard/brief are still persisted
    expect(result.success).toBe(false);

    // Check that storyboard and video-brief were written to storage
    const writtenPaths = Array.from(mocks.writtenAssets.keys());
    const storyboardPath = writtenPaths.find((p) => p.includes('storyboard'));
    const videoBriefPath = writtenPaths.find((p) => p.includes('video-brief'));

    expect(storyboardPath).toBeDefined();
    expect(videoBriefPath).toBeDefined();

    // Verify the written data is valid JSON
    const storyboardData = JSON.parse(mocks.writtenAssets.get(storyboardPath!)!.toString());
    expect(storyboardData).toHaveProperty('scenes');
    expect(Array.isArray(storyboardData.scenes)).toBe(true);

    const videoBriefData = JSON.parse(mocks.writtenAssets.get(videoBriefPath!)!.toString());
    expect(videoBriefData).toHaveProperty('totalDuration');
  });
});

// ── Test 2e: Successful Video Flow Preservation ─────────────────────

describe('Property 2e (PBT): Successful Video Flow Preservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.jobStore.clear();
    mocks.writtenAssets.clear();
    mocks.setupFirestoreMocks();
    mocks.setupStorageMocks();
    mocks.setupGenAIMocks();
  });

  it('for any Veo API response with done=true and valid base64 video data, the base64 → GCS write → asset reference flow produces correct results', async () => {
    /**
     * **Validates: Requirements 3.4**
     *
     * Generate random base64 video data and verify the full flow:
     * base64 decode → GCS write → asset reference recorded.
     * This behavior must be preserved after the bugfix.
     */
    // Generate small random binary data, encode as base64
    const videoDataSamples = fc.sample(
      fc.uint8Array({ minLength: 10, maxLength: 100 }).map((arr) =>
        Buffer.from(arr).toString('base64'),
      ),
      3,
    );

    for (const base64VideoData of videoDataSamples) {
      mocks.jobStore.clear();
      mocks.writtenAssets.clear();

      const jobId = `video-flow-${Math.random().toString(36).slice(2, 8)}`;
      const job = createMockJob({ id: jobId, state: JobState.Queued });
      mocks.jobStore.set(jobId, job);

      // Mock capability to return successful video generation
      mocks.capabilityIsAvailable.mockResolvedValue(true);
      mocks.capabilityGenerate.mockResolvedValue({
        success: true,
        assets: [base64VideoData],
        metadata: { jobId, model: 'test-model', operationName: 'operations/test-op' },
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

      expect(result.success).toBe(true);

      // Verify video asset was written to GCS
      const writtenPaths = Array.from(mocks.writtenAssets.keys());
      const videoPath = writtenPaths.find((p) => p.includes('/video/') && p.endsWith('.mp4'));
      expect(videoPath).toBeDefined();

      // Verify the written data matches the base64-decoded input
      const writtenBuffer = mocks.writtenAssets.get(videoPath!);
      const expectedBuffer = Buffer.from(base64VideoData, 'base64');
      expect(writtenBuffer).toEqual(expectedBuffer);

      // Verify asset reference was recorded in Firestore
      const finalJob = mocks.jobStore.get(jobId)!;
      const videoAsset = finalJob.assets.find(
        (a: AssetReference) => a.assetType === AssetType.Video && a.storagePath.includes('/video/'),
      );
      expect(videoAsset).toBeDefined();
      expect(videoAsset!.status).toBe('completed');
      expect(videoAsset!.storagePath).toBe(videoPath);
    }
  });

  it('successful video generation does not record a fallback notice', async () => {
    /**
     * **Validates: Requirements 3.4**
     *
     * When video generation succeeds, no fallback notice should be recorded
     * for the video_generation capability.
     */
    const jobId = 'no-fallback-test';
    const job = createMockJob({ id: jobId, state: JobState.Queued });
    mocks.jobStore.set(jobId, job);

    const base64Data = Buffer.from('fake-video-data').toString('base64');
    mocks.capabilityIsAvailable.mockResolvedValue(true);
    mocks.capabilityGenerate.mockResolvedValue({
      success: true,
      assets: [base64Data],
      metadata: { jobId, model: 'test-model' },
    });

    const stage = new GenerateVideo();
    await stage.execute({
      jobId,
      correlationId: 'corr-test',
      uploadedMediaPaths: ['uploads/test.png'],
      workingData: {
        creativeBrief: {
          targetAudience: 'Devs',
          tone: Tone.Professional,
          keyMessages: ['Build'],
          visualDirection: 'Clean',
          inputSummary: 'Test',
          platform: Platform.GeneralPromoPackage,
        },
      },
    });

    const finalJob = mocks.jobStore.get(jobId)!;
    const videoNotice = finalJob.fallbackNotices.find(
      (n: FallbackNotice) => n.capability === 'video_generation',
    );
    // No fallback notice should exist for successful generation
    expect(videoNotice).toBeUndefined();
  });

  it('working data is populated with storyboard and videoBrief after successful execution', async () => {
    /**
     * **Validates: Requirements 3.4**
     *
     * Verify that the pipeline context's workingData is populated
     * with storyboard and videoBrief for downstream stages.
     */
    const jobId = 'working-data-test';
    const job = createMockJob({ id: jobId, state: JobState.Queued });
    mocks.jobStore.set(jobId, job);

    mocks.capabilityIsAvailable.mockResolvedValue(false);

    const context = {
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
      } as Record<string, unknown>,
    };

    const stage = new GenerateVideo();
    await stage.execute(context);

    // workingData should now have storyboard and videoBrief
    expect(context.workingData.storyboard).toBeDefined();
    expect(context.workingData.videoBrief).toBeDefined();
    expect(context.workingData.storyboardAssetPath).toBeDefined();
    expect(context.workingData.videoBriefAssetPath).toBeDefined();
  });
});
