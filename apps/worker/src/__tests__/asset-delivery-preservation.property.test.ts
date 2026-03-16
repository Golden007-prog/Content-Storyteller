/**
 * Preservation Property Tests — Asset Delivery & Rendering (Worker)
 *
 * Property 2: Preservation — Existing Pipeline Behavior Unchanged
 *
 * These tests capture the BASELINE behavior on UNFIXED code.
 * They MUST PASS on unfixed code to confirm the behavior we want to preserve.
 *
 * Property 2.1: For all pipeline contexts with successful GenAI responses,
 *   GenerateImages.execute() always persists an ImageConcept JSON array and returns success: true
 *
 * Property 2.2: For all pipeline contexts with successful GenAI + successful Veo,
 *   GenerateVideo.execute() persists Storyboard as AssetType.Storyboard and returns success: true with MP4 assets
 *
 * Property 2.3: For all capability unavailability scenarios,
 *   a fallback notice is recorded and the stage does not throw
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
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

// ── Mock capability registry ────────────────────────────────────────

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
      // image_generation returns undefined (unavailable) by default
      return undefined;
    },
    has: (name: string) => ['video_generation', 'gif_generation'].includes(name),
    init: vi.fn(),
    all: vi.fn().mockReturnValue([]),
    register: vi.fn(),
  },
}));

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

// ── Imports (after mocks) ───────────────────────────────────────────

import { GenerateImages } from '../pipeline/generate-images';
import { GenerateVideo } from '../pipeline/generate-video';

// ── Property 2.1: GenerateImages persists ImageConcept JSON and returns success ──

describe('Property 2.1 (PBT): GenerateImages persists ImageConcept JSON array and returns success:true', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.jobStore.clear();
    mocks.writtenAssets.clear();
    mocks.setupFirestoreMocks();
    mocks.setupStorageMocks();
  });

  it('for all pipeline contexts with successful GenAI responses, persists image concepts and returns success', async () => {
    /**
     * **Validates: Requirements 3.1**
     *
     * Observe: GenerateImages.execute() persists ImageConcept JSON to GCS
     * and returns { success: true } with the asset path.
     *
     * MUST PASS on unfixed code — this is baseline behavior to preserve.
     */
    // Generate varied concept arrays using constantFrom for reliable string generation
    const conceptArb = fc.record({
      conceptName: fc.constantFrom('Hero Shot', 'Detail View', 'Lifestyle', 'Product Close-up', 'Brand Story'),
      visualDirection: fc.constantFrom('Bold colors', 'Natural light', 'Minimalist', 'High contrast'),
      generationPrompt: fc.constantFrom('Create hero image', 'Create detail shot', 'Create lifestyle scene'),
      style: fc.constantFrom('photorealistic', 'cinematic', 'flat illustration', '3D render'),
    });
    const conceptsArrayArb = fc.array(conceptArb, { minLength: 1, maxLength: 5 });
    const samples = fc.sample(conceptsArrayArb, 5);

    for (const concepts of samples) {
      mocks.jobStore.clear();
      mocks.writtenAssets.clear();
      vi.clearAllMocks();
      mocks.setupFirestoreMocks();
      mocks.setupStorageMocks();

      // GenAI returns valid concepts JSON
      mocks.mockGenerateContent.mockResolvedValue(JSON.stringify(concepts));

      const jobId = `job-${Math.random().toString(36).slice(2, 10)}`;
      const job = createMockJob({ id: jobId });
      mocks.jobStore.set(jobId, job);

      const stage = new GenerateImages();
      const result = await stage.execute(createMockContext(jobId));

      // Preservation: stage returns success: true
      expect(result.success).toBe(true);

      // Preservation: at least one asset path returned
      expect(result.assets.length).toBeGreaterThan(0);

      // Preservation: image-concepts JSON was written to storage
      const conceptPaths = Array.from(mocks.writtenAssets.keys()).filter(
        (k) => k.includes('image-concepts') && k.endsWith('.json'),
      );
      expect(conceptPaths.length).toBe(1);

      // Preservation: the written JSON is a valid array
      const writtenBuffer = mocks.writtenAssets.get(conceptPaths[0])!;
      const parsed = JSON.parse(writtenBuffer.toString('utf-8'));
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);

      // Preservation: each concept has the expected fields
      for (const c of parsed) {
        expect(typeof c.conceptName).toBe('string');
        expect(typeof c.visualDirection).toBe('string');
        expect(typeof c.generationPrompt).toBe('string');
        expect(typeof c.style).toBe('string');
      }
    }
  });
});

// ── Property 2.2: GenerateVideo persists Storyboard as AssetType.Storyboard and returns success with MP4 ──

describe('Property 2.2 (PBT): GenerateVideo persists Storyboard as AssetType.Storyboard and returns success:true with MP4 assets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.jobStore.clear();
    mocks.writtenAssets.clear();
    mocks.setupFirestoreMocks();
    mocks.setupStorageMocks();
  });

  it('for all pipeline contexts with successful GenAI + successful Veo, persists Storyboard correctly and returns MP4 assets', async () => {
    /**
     * **Validates: Requirements 3.3, 3.5**
     *
     * Observe: GenerateVideo.execute() persists Storyboard as AssetType.Storyboard
     * and VideoBrief JSON to GCS, returns { success: true } when Veo returns actual video.
     * Successful Veo video generation writes MP4 files as AssetType.Video.
     *
     * MUST PASS on unfixed code — this is baseline behavior to preserve.
     */
    const sceneArb = fc.record({
      sceneNumber: fc.integer({ min: 1, max: 10 }),
      description: fc.constantFrom('Opening shot', 'Product reveal', 'CTA scene', 'Transition'),
      duration: fc.constantFrom('3s', '5s', '7s'),
      motionStyle: fc.constantFrom('steady', 'smooth', 'dynamic'),
      textOverlay: fc.constantFrom('Welcome', 'Learn More', 'Buy Now', ''),
      cameraDirection: fc.constantFrom('wide shot', 'close-up', 'pan left'),
    });

    const storyboardArb = fc.record({
      scenes: fc.array(sceneArb, { minLength: 1, maxLength: 5 }),
      totalDuration: fc.constantFrom('15s', '25s', '30s'),
      pacing: fc.constantFrom('balanced', 'fast', 'slow'),
    });

    const videoBriefArb = fc.record({
      totalDuration: fc.constantFrom('15s', '25s', '30s'),
      motionStyle: fc.constantFrom('smooth', 'dynamic'),
      textOverlayStyle: fc.constant('bold sans-serif'),
      cameraDirection: fc.constant('mixed angles'),
      energyDirection: fc.constant('builds from calm to energetic'),
    });

    const inputArb = fc.record({
      storyboard: storyboardArb,
      videoBrief: videoBriefArb,
    });

    const samples = fc.sample(inputArb, 5);

    for (const input of samples) {
      mocks.jobStore.clear();
      mocks.writtenAssets.clear();
      vi.clearAllMocks();
      mocks.setupFirestoreMocks();
      mocks.setupStorageMocks();

      // GenAI returns valid storyboard + video brief
      mocks.mockGenerateContent.mockResolvedValue(JSON.stringify({
        storyboard: input.storyboard,
        videoBrief: input.videoBrief,
      }));

      // Video capability available and returns success with base64 MP4
      mocks.capabilityIsAvailable.mockResolvedValue(true);
      const fakeBase64Mp4 = Buffer.from('fake-mp4-video-data').toString('base64');
      mocks.capabilityGenerate.mockResolvedValue({
        success: true,
        assets: [fakeBase64Mp4],
        metadata: {},
      });

      const jobId = `job-${Math.random().toString(36).slice(2, 10)}`;
      const job = createMockJob({ id: jobId });
      mocks.jobStore.set(jobId, job);

      const stage = new GenerateVideo();
      const result = await stage.execute(createMockContext(jobId));

      // Preservation: stage returns success: true
      expect(result.success).toBe(true);

      // Preservation: storyboard JSON was written to storage
      const storyboardPaths = Array.from(mocks.writtenAssets.keys()).filter(
        (k) => k.includes('storyboard') && k.endsWith('.json'),
      );
      expect(storyboardPaths.length).toBe(1);

      // Preservation: storyboard asset recorded as AssetType.Storyboard
      const finalJob = mocks.jobStore.get(jobId)!;
      const storyboardAssets = finalJob.assets.filter(
        (a: AssetReference) => a.storagePath.includes('storyboard'),
      );
      expect(storyboardAssets.length).toBe(1);
      expect(storyboardAssets[0].assetType).toBe(AssetType.Storyboard);

      // Preservation: MP4 video was written to storage
      const videoPaths = Array.from(mocks.writtenAssets.keys()).filter(
        (k) => k.includes('/video/') && k.endsWith('.mp4'),
      );
      expect(videoPaths.length).toBe(1);

      // Preservation: video asset recorded as AssetType.Video
      const videoAssets = finalJob.assets.filter(
        (a: AssetReference) => a.storagePath.includes('/video/') && a.storagePath.endsWith('.mp4'),
      );
      expect(videoAssets.length).toBe(1);
      expect(videoAssets[0].assetType).toBe(AssetType.Video);

      // Preservation: assets array includes storyboard, video-brief, and video paths
      expect(result.assets.length).toBeGreaterThanOrEqual(3);
    }
  });
});

// ── Property 2.3: Capability unavailability records fallback notice ──

describe('Property 2.3 (PBT): Capability unavailability records fallback notice without throwing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.jobStore.clear();
    mocks.writtenAssets.clear();
    mocks.setupFirestoreMocks();
    mocks.setupStorageMocks();
  });

  it('for all capability unavailability scenarios in GenerateImages, a fallback notice is recorded and stage does not throw', async () => {
    /**
     * **Validates: Requirements 3.2**
     *
     * Observe: When image generation capability is unavailable,
     * a fallback notice with { capability, reason, timestamp, stage } is recorded
     * and the stage returns success: true (does not throw).
     *
     * MUST PASS on unfixed code — this is baseline behavior to preserve.
     */
    const jobIds = fc.sample(fc.uuid(), 5);

    for (const jobId of jobIds) {
      mocks.jobStore.clear();
      mocks.writtenAssets.clear();
      vi.clearAllMocks();
      mocks.setupFirestoreMocks();
      mocks.setupStorageMocks();

      // GenAI returns valid concepts
      mocks.mockGenerateContent.mockResolvedValue(JSON.stringify([
        { conceptName: 'Hero', visualDirection: 'Bold', generationPrompt: 'Create hero', style: 'photorealistic' },
      ]));

      // Image capability is unavailable (registry returns undefined for image_generation)
      const job = createMockJob({ id: jobId });
      mocks.jobStore.set(jobId, job);

      const stage = new GenerateImages();
      const result = await stage.execute(createMockContext(jobId));

      // Preservation: stage returns success (does not throw)
      expect(result.success).toBe(true);

      // Preservation: fallback notice was recorded
      const finalJob = mocks.jobStore.get(jobId)!;
      expect(finalJob.fallbackNotices.length).toBeGreaterThan(0);

      const notice = finalJob.fallbackNotices[0];
      expect(notice.capability).toBe('image_generation');
      expect(typeof notice.reason).toBe('string');
      expect(notice.reason.length).toBeGreaterThan(0);
      expect(notice.timestamp).toBeDefined();
      expect(notice.stage).toBe(JobState.GeneratingImages);
    }
  });

  it('for all capability unavailability scenarios in GenerateVideo, a fallback notice is recorded and stage does not throw', async () => {
    /**
     * **Validates: Requirements 3.4**
     *
     * Observe: When video generation capability is unavailable,
     * a fallback notice with { capability, reason, timestamp, stage } is recorded
     * and the stage returns success: true (does not throw).
     *
     * MUST PASS on unfixed code — this is baseline behavior to preserve.
     */
    const jobIds = fc.sample(fc.uuid(), 5);

    for (const jobId of jobIds) {
      mocks.jobStore.clear();
      mocks.writtenAssets.clear();
      vi.clearAllMocks();
      mocks.setupFirestoreMocks();
      mocks.setupStorageMocks();

      // GenAI returns valid storyboard + video brief
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

      // Video capability unavailable
      mocks.capabilityIsAvailable.mockResolvedValue(false);

      const job = createMockJob({ id: jobId });
      mocks.jobStore.set(jobId, job);

      const stage = new GenerateVideo();
      const result = await stage.execute(createMockContext(jobId));

      // Preservation: stage returns success (does not throw)
      expect(result.success).toBe(true);

      // Preservation: fallback notice was recorded
      const finalJob = mocks.jobStore.get(jobId)!;
      expect(finalJob.fallbackNotices.length).toBeGreaterThan(0);

      const notice = finalJob.fallbackNotices[0];
      expect(notice.capability).toBe('video_generation');
      expect(typeof notice.reason).toBe('string');
      expect(notice.reason.length).toBeGreaterThan(0);
      expect(notice.timestamp).toBeDefined();
      expect(notice.stage).toBe(JobState.GeneratingVideo);
    }
  });
});
