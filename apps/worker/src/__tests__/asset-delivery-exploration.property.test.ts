/**
 * Bug Condition Exploration Property Tests — Asset Delivery & Rendering
 *
 * Property 1: Bug Condition — Metadata Assets Misclassified as Renderable & Video Timeout Swallowed
 *
 * These tests encode the EXPECTED (correct) behavior.
 * They are EXPECTED TO FAIL on unfixed code, confirming the bugs exist.
 *
 * Test A: Image concept JSON must NOT be recorded as AssetType.Image
 * Test B: VideoBrief JSON must NOT be recorded as AssetType.Video
 * Test C: Video timeout must return { success: false }
 * Test D: GIF creative direction JSON must NOT be recorded as AssetType.Gif
 *
 * **Validates: Requirements 1.1, 1.4, 1.5, 1.10**
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

  return {
    jobStore, writtenAssets,
    mockDocUpdate, mockDocGet, mockDoc, mockCollection,
    mockFileSave, mockBucketFile, mockBucket,
    mockGenerateContent,
    capabilityIsAvailable, capabilityGenerate,
    setupFirestoreMocks, setupStorageMocks,
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

function createMockContext(jobId: string) {
  return {
    jobId,
    correlationId: 'corr-test',
    uploadedMediaPaths: ['uploads/test.png'],
    workingData: {
      creativeBrief: {
        targetAudience: 'Developers',
        tone: Tone.Professional,
        keyMessages: ['Build fast'],
        visualDirection: 'Clean and modern',
        inputSummary: 'Test input',
        platform: Platform.GeneralPromoPackage,
      },
    },
  };
}


// ── Test A: Image concept misclassification ─────────────────────────

// Mock capability registry for image tests — no image capability available
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
      if (name === 'gif_generation') {
        return {
          name,
          isAvailable: mocks.capabilityIsAvailable,
          generate: mocks.capabilityGenerate,
        };
      }
      // image_generation returns undefined (unavailable)
      return undefined;
    },
    has: (name: string) => ['video_generation', 'gif_generation'].includes(name),
    init: vi.fn(),
    all: vi.fn().mockReturnValue([]),
    register: vi.fn(),
  },
}));

import { GenerateImages } from '../pipeline/generate-images';
import { GenerateVideo } from '../pipeline/generate-video';
import { GenerateGif } from '../pipeline/generate-gif';

describe('Test A (PBT): Image concept JSON must NOT be recorded as AssetType.Image', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.jobStore.clear();
    mocks.writtenAssets.clear();
    mocks.setupFirestoreMocks();
    mocks.setupStorageMocks();

    // Mock GenAI to return valid image concepts JSON
    mocks.mockGenerateContent.mockResolvedValue(JSON.stringify([
      { conceptName: 'Hero Shot', visualDirection: 'Bold colors', generationPrompt: 'Create hero image', style: 'photorealistic' },
      { conceptName: 'Detail View', visualDirection: 'Close-up', generationPrompt: 'Create detail image', style: 'cinematic' },
      { conceptName: 'Lifestyle', visualDirection: 'Natural light', generationPrompt: 'Create lifestyle image', style: 'editorial' },
    ]));
  });

  it('for any job, image-concepts JSON asset is recorded with a non-renderable type (not AssetType.Image)', async () => {
    /**
     * **Validates: Requirements 1.1**
     *
     * Call GenerateImages.execute() with a mock context.
     * Assert the image-concepts JSON asset is recorded with a type OTHER than AssetType.Image.
     *
     * WILL FAIL on unfixed code: the asset is recorded as AssetType.Image.
     */
    const jobIds = fc.sample(fc.uuid(), 5);

    for (const jobId of jobIds) {
      mocks.jobStore.clear();
      mocks.writtenAssets.clear();
      vi.clearAllMocks();
      mocks.setupFirestoreMocks();
      mocks.setupStorageMocks();
      mocks.mockGenerateContent.mockResolvedValue(JSON.stringify([
        { conceptName: 'Hero Shot', visualDirection: 'Bold', generationPrompt: 'Create hero', style: 'photorealistic' },
      ]));

      const job = createMockJob({ id: jobId });
      mocks.jobStore.set(jobId, job);

      const stage = new GenerateImages();
      await stage.execute(createMockContext(jobId));

      // Find the recordAssetReference call for the image-concepts JSON
      const updateCalls = mocks.mockDocUpdate.mock.calls;
      const assetCalls = updateCalls.filter(
        ([_id, data]: [string, Partial<Job>]) =>
          data.assets && Array.isArray(data.assets),
      );

      // Get all recorded assets from the job store
      const finalJob = mocks.jobStore.get(jobId)!;
      const conceptAssets = finalJob.assets.filter(
        (a: AssetReference) => a.storagePath.includes('image-concept'),
      );

      expect(conceptAssets.length).toBeGreaterThan(0);

      // EXPECTED: image-concepts JSON should NOT be AssetType.Image
      // WILL FAIL on unfixed code: it IS recorded as AssetType.Image
      for (const asset of conceptAssets) {
        expect(asset.assetType).not.toBe(AssetType.Image);
      }
    }
  });
});

// ── Test B: VideoBrief misclassification ────────────────────────────

describe('Test B (PBT): VideoBrief JSON must NOT be recorded as AssetType.Video', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.jobStore.clear();
    mocks.writtenAssets.clear();
    mocks.setupFirestoreMocks();
    mocks.setupStorageMocks();

    // Mock GenAI to return valid storyboard + video brief JSON
    mocks.mockGenerateContent.mockResolvedValue(JSON.stringify({
      storyboard: {
        scenes: [{ sceneNumber: 1, description: 'Opening', duration: '5s', motionStyle: 'steady', textOverlay: 'Welcome', cameraDirection: 'wide shot' }],
        totalDuration: '25s',
        pacing: 'balanced',
      },
      videoBrief: {
        totalDuration: '25s', motionStyle: 'smooth',
        textOverlayStyle: 'bold sans-serif', cameraDirection: 'mixed angles',
        energyDirection: 'builds from calm to energetic',
      },
    }));

    // Video capability unavailable for this test
    mocks.capabilityIsAvailable.mockResolvedValue(false);
  });

  it('for any job, video-brief JSON asset is recorded with a non-renderable type (not AssetType.Video)', async () => {
    /**
     * **Validates: Requirements 1.4**
     *
     * Call GenerateVideo.execute() with a mock context.
     * Assert the video-brief JSON asset is recorded with a type OTHER than AssetType.Video.
     *
     * WILL FAIL on unfixed code: the video-brief is recorded as AssetType.Video.
     */
    const jobIds = fc.sample(fc.uuid(), 5);

    for (const jobId of jobIds) {
      mocks.jobStore.clear();
      mocks.writtenAssets.clear();
      vi.clearAllMocks();
      mocks.setupFirestoreMocks();
      mocks.setupStorageMocks();
      mocks.mockGenerateContent.mockResolvedValue(JSON.stringify({
        storyboard: {
          scenes: [{ sceneNumber: 1, description: 'Opening', duration: '5s', motionStyle: 'steady', textOverlay: 'Welcome', cameraDirection: 'wide shot' }],
          totalDuration: '25s', pacing: 'balanced',
        },
        videoBrief: {
          totalDuration: '25s', motionStyle: 'smooth',
          textOverlayStyle: 'bold sans-serif', cameraDirection: 'mixed angles',
          energyDirection: 'builds from calm to energetic',
        },
      }));
      mocks.capabilityIsAvailable.mockResolvedValue(false);

      const job = createMockJob({ id: jobId });
      mocks.jobStore.set(jobId, job);

      const stage = new GenerateVideo();
      await stage.execute(createMockContext(jobId));

      // Get all recorded assets from the job store
      const finalJob = mocks.jobStore.get(jobId)!;
      const videoBriefAssets = finalJob.assets.filter(
        (a: AssetReference) => a.storagePath.includes('video-brief'),
      );

      expect(videoBriefAssets.length).toBeGreaterThan(0);

      // EXPECTED: video-brief JSON should NOT be AssetType.Video
      // WILL FAIL on unfixed code: it IS recorded as AssetType.Video
      for (const asset of videoBriefAssets) {
        expect(asset.assetType).not.toBe(AssetType.Video);
      }
    }
  });
});

// ── Test C: Video timeout returns success ───────────────────────────

describe('Test C (PBT): Video timeout must return { success: false }', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.jobStore.clear();
    mocks.writtenAssets.clear();
    mocks.setupFirestoreMocks();
    mocks.setupStorageMocks();

    mocks.mockGenerateContent.mockResolvedValue(JSON.stringify({
      storyboard: {
        scenes: [{ sceneNumber: 1, description: 'Opening', duration: '5s', motionStyle: 'steady', textOverlay: 'Welcome', cameraDirection: 'wide shot' }],
        totalDuration: '25s', pacing: 'balanced',
      },
      videoBrief: {
        totalDuration: '25s', motionStyle: 'smooth',
        textOverlayStyle: 'bold sans-serif', cameraDirection: 'mixed angles',
        energyDirection: 'builds from calm to energetic',
      },
    }));
  });

  it('when video capability returns success:false with timeout reason, stage returns success:false', async () => {
    /**
     * **Validates: Requirements 1.5**
     *
     * Call GenerateVideo.execute() with a mock capability returning
     * { success: false, metadata: { reason: 'timeout-or-no-video' } }.
     * Assert the stage returns { success: false }.
     *
     * WILL FAIL on unfixed code: the stage returns { success: true }.
     */
    const jobIds = fc.sample(fc.uuid(), 5);

    for (const jobId of jobIds) {
      mocks.jobStore.clear();
      mocks.writtenAssets.clear();
      vi.clearAllMocks();
      mocks.setupFirestoreMocks();
      mocks.setupStorageMocks();
      mocks.mockGenerateContent.mockResolvedValue(JSON.stringify({
        storyboard: {
          scenes: [{ sceneNumber: 1, description: 'Opening', duration: '5s', motionStyle: 'steady', textOverlay: 'Welcome', cameraDirection: 'wide shot' }],
          totalDuration: '25s', pacing: 'balanced',
        },
        videoBrief: {
          totalDuration: '25s', motionStyle: 'smooth',
          textOverlayStyle: 'bold sans-serif', cameraDirection: 'mixed angles',
          energyDirection: 'builds from calm to energetic',
        },
      }));

      // Mock video capability to return timeout failure
      mocks.capabilityIsAvailable.mockResolvedValue(true);
      mocks.capabilityGenerate.mockResolvedValue({
        success: false,
        assets: [],
        metadata: { jobId, reason: 'timeout-or-no-video' },
      });

      const job = createMockJob({ id: jobId });
      mocks.jobStore.set(jobId, job);

      const stage = new GenerateVideo();
      const result = await stage.execute(createMockContext(jobId));

      // EXPECTED: stage should return success: false when video capability fails
      // WILL FAIL on unfixed code: stage returns success: true
      expect(result.success).toBe(false);
    }
  });
});

// ── Test D: GIF creative direction misclassification ────────────────

describe('Test D (PBT): GIF creative direction JSON must NOT be recorded as AssetType.Gif', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.jobStore.clear();
    mocks.writtenAssets.clear();
    mocks.setupFirestoreMocks();
    mocks.setupStorageMocks();

    // Mock GenAI responses for classification, motion concept, and storyboard
    let callCount = 0;
    mocks.mockGenerateContent.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // Classification response
        return JSON.stringify({ classification: 'diagram', focusRegions: ['center'] });
      }
      if (callCount === 2) {
        // Motion concept response
        return JSON.stringify({ motionDescription: 'Smooth zoom animation', suggestedDurationMs: 5000 });
      }
      // Storyboard response
      return JSON.stringify({
        beats: [
          { beatNumber: 1, description: 'Zoom in', durationMs: 1000, motionType: 'zoom', focusArea: 'center' },
          { beatNumber: 2, description: 'Pan right', durationMs: 1000, motionType: 'pan', focusArea: 'right' },
          { beatNumber: 3, description: 'Fade out', durationMs: 1000, motionType: 'fade', focusArea: 'center' },
        ],
        totalDurationMs: 3000,
        loopStrategy: 'seamless',
      });
    });

    // GIF capability unavailable — triggers creative direction persistence
    mocks.capabilityIsAvailable.mockResolvedValue(false);
  });

  it('for any job with GIF capability unavailable, creative direction JSON is recorded with a non-renderable type (not AssetType.Gif)', async () => {
    /**
     * **Validates: Requirements 1.10**
     *
     * Call GenerateGif.execute() with GIF capability unavailable.
     * Assert creative direction JSON is recorded with a type OTHER than AssetType.Gif.
     *
     * WILL FAIL on unfixed code: creative direction is recorded as AssetType.Gif.
     */
    const jobIds = fc.sample(fc.uuid(), 5);

    for (const jobId of jobIds) {
      mocks.jobStore.clear();
      mocks.writtenAssets.clear();
      vi.clearAllMocks();
      mocks.setupFirestoreMocks();
      mocks.setupStorageMocks();

      let callCount = 0;
      mocks.mockGenerateContent.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return JSON.stringify({ classification: 'diagram', focusRegions: ['center'] });
        if (callCount === 2) return JSON.stringify({ motionDescription: 'Smooth zoom', suggestedDurationMs: 5000 });
        return JSON.stringify({
          beats: [
            { beatNumber: 1, description: 'Zoom in', durationMs: 1000, motionType: 'zoom', focusArea: 'center' },
            { beatNumber: 2, description: 'Pan', durationMs: 1000, motionType: 'pan', focusArea: 'right' },
            { beatNumber: 3, description: 'Fade', durationMs: 1000, motionType: 'fade', focusArea: 'center' },
          ],
          totalDurationMs: 3000,
          loopStrategy: 'seamless',
        });
      });
      mocks.capabilityIsAvailable.mockResolvedValue(false);

      const job = createMockJob({ id: jobId });
      mocks.jobStore.set(jobId, job);

      const stage = new GenerateGif();
      const ctx = createMockContext(jobId);
      // Provide a video asset path so the stage proceeds past the early-return guard
      ctx.workingData.videoAssetPath = `${jobId}/video/test-video.mp4`;
      await stage.execute(ctx);

      // Get all recorded assets from the job store
      const finalJob = mocks.jobStore.get(jobId)!;
      const gifDirectionAssets = finalJob.assets.filter(
        (a: AssetReference) =>
          a.storagePath.includes('gif-motion-concept') || a.storagePath.includes('gif-storyboard'),
      );

      expect(gifDirectionAssets.length).toBeGreaterThan(0);

      // EXPECTED: creative direction JSON should NOT be AssetType.Gif
      // WILL FAIL on unfixed code: it IS recorded as AssetType.Gif
      for (const asset of gifDirectionAssets) {
        expect(asset.assetType).not.toBe(AssetType.Gif);
      }
    }
  });
});
