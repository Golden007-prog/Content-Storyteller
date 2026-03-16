/**
 * Preservation Property Tests — Media Pipeline Asset Fix (Worker)
 *
 * Property 2: Preservation — Text Outputs, Fallback Behavior
 *
 * These tests verify EXISTING working behavior that must NOT be broken
 * by the upcoming fixes. They MUST PASS on the current unfixed code.
 *
 * Preservation A — Text Output Generation
 * Preservation B — Fallback Behavior
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
  JobState,
  AssetType,
  Platform,
  Tone,
  Job,
  AssetReference,
  FallbackNotice,
  CopyPackage,
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

import { GenerateCopy } from '../pipeline/generate-copy';
import { GenerateVideo } from '../pipeline/generate-video';

// ── Preservation A: Text Output Generation ──────────────────────────

describe('Preservation A (PBT): Text-based outputs generated and persisted correctly', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.jobStore.clear();
    mocks.writtenAssets.clear();
    mocks.setupFirestoreMocks();
    mocks.setupStorageMocks();
  });

  it('for any platform/tone combo, GenerateCopy produces a valid CopyPackage with all required fields', async () => {
    /**
     * **Validates: Requirements 3.1**
     *
     * For each Platform × Tone combination, run GenerateCopy.execute()
     * and verify it produces a CopyPackage with hook, caption, cta,
     * hashtags, voiceoverScript, onScreenText, and threadCopy fields.
     * The asset is persisted to storage as JSON.
     */
    const platforms = Object.values(Platform);
    const tones = Object.values(Tone);

    // Pick a subset of combos via fast-check
    const combos = fc.sample(
      fc.record({
        platform: fc.constantFrom(...platforms),
        tone: fc.constantFrom(...tones),
        prompt: fc.string({ minLength: 5, maxLength: 40 }),
      }),
      4,
    );

    for (const combo of combos) {
      mocks.jobStore.clear();
      mocks.writtenAssets.clear();

      const jobId = `copy-test-${combo.platform}-${combo.tone}`;
      const job = createMockJob({ id: jobId });
      mocks.jobStore.set(jobId, job);

      // Mock GenAI to return a valid CopyPackage JSON
      mocks.mockGenerateContent.mockResolvedValueOnce(JSON.stringify({
        hook: 'Test hook line',
        caption: 'Test caption text',
        cta: 'Learn more',
        hashtags: ['marketing', 'content'],
        threadCopy: ['Thread post 1'],
        voiceoverScript: 'Here is the voiceover.',
        onScreenText: ['Key message'],
      }));

      const stage = new GenerateCopy();
      const context = {
        jobId,
        correlationId: 'corr-test',
        uploadedMediaPaths: ['uploads/test.png'],
        workingData: {
          creativeBrief: {
            targetAudience: 'Developers',
            tone: combo.tone,
            keyMessages: ['Build great software'],
            visualDirection: 'Clean and modern',
            inputSummary: combo.prompt || 'Test product launch',
            platform: combo.platform,
          },
        } as Record<string, unknown>,
      };

      const result = await stage.execute(context);

      // Text output generation should succeed
      expect(result.success).toBe(true);
      expect(result.assets.length).toBeGreaterThan(0);

      // Asset should be written to storage
      expect(mocks.writtenAssets.size).toBeGreaterThan(0);

      // The written asset should be valid JSON with CopyPackage fields
      const writtenEntry = Array.from(mocks.writtenAssets.entries())[0];
      const parsed = JSON.parse(writtenEntry[1].toString('utf-8')) as CopyPackage;
      expect(parsed.hook).toBeDefined();
      expect(typeof parsed.hook).toBe('string');
      expect(parsed.caption).toBeDefined();
      expect(parsed.cta).toBeDefined();
      expect(Array.isArray(parsed.hashtags)).toBe(true);
      expect(parsed.voiceoverScript).toBeDefined();
      expect(Array.isArray(parsed.onScreenText)).toBe(true);

      // Working data should have copyPackage and copyAssetPath
      expect(context.workingData.copyPackage).toBeDefined();
      expect(context.workingData.copyAssetPath).toBeDefined();

      // Asset reference should be recorded in Firestore
      const updatedJob = mocks.jobStore.get(jobId);
      expect(updatedJob?.assets.length).toBeGreaterThan(0);
      expect(updatedJob?.assets[0].assetType).toBe(AssetType.Copy);
      expect(updatedJob?.assets[0].status).toBe('completed');
    }
  });

  it('GenerateCopy falls back gracefully when GenAI returns invalid JSON', async () => {
    /**
     * **Validates: Requirements 3.1**
     *
     * When GenAI returns non-JSON text, GenerateCopy should still produce
     * a valid CopyPackage with fallback values rather than crashing.
     */
    const jobId = 'copy-fallback-test';
    const job = createMockJob({ id: jobId });
    mocks.jobStore.set(jobId, job);

    // Return non-JSON text
    mocks.mockGenerateContent.mockResolvedValueOnce('This is not valid JSON at all.');

    const stage = new GenerateCopy();
    const context = {
      jobId,
      correlationId: 'corr-test',
      uploadedMediaPaths: [],
      workingData: {
        creativeBrief: {
          targetAudience: 'Marketers',
          tone: Tone.Punchy,
          keyMessages: ['Go fast'],
          visualDirection: 'Bold',
          inputSummary: 'Speed campaign',
          platform: Platform.InstagramReel,
        },
      } as Record<string, unknown>,
    };

    const result = await stage.execute(context);

    // Should still succeed with fallback values
    expect(result.success).toBe(true);
    expect(context.workingData.copyPackage).toBeDefined();

    const cp = context.workingData.copyPackage as CopyPackage;
    expect(typeof cp.hook).toBe('string');
    expect(cp.hook.length).toBeGreaterThan(0);
    expect(typeof cp.caption).toBe('string');
    expect(typeof cp.cta).toBe('string');
  });
});

// ── Preservation B: Fallback Behavior ───────────────────────────────

describe('Preservation B (PBT): FallbackNotice recorded when capabilities unavailable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.jobStore.clear();
    mocks.writtenAssets.clear();
    mocks.setupFirestoreMocks();
    mocks.setupStorageMocks();
  });

  it('when video capability is unavailable, GenerateVideo records a FallbackNotice and persists metadata', async () => {
    /**
     * **Validates: Requirements 3.4**
     *
     * When the video generation capability reports unavailable,
     * GenerateVideo should still succeed by persisting storyboard/videoBrief
     * metadata and recording a FallbackNotice.
     */
    const jobId = 'video-fallback-test';
    const job = createMockJob({ id: jobId });
    mocks.jobStore.set(jobId, job);

    // Video capability is unavailable
    mocks.capabilityIsAvailable.mockResolvedValue(false);

    // GenAI returns storyboard/videoBrief metadata
    mocks.mockGenerateContent.mockResolvedValue(JSON.stringify({
      storyboard: {
        scenes: [{ sceneNumber: 1, description: 'Opening', duration: '5s', motionStyle: 'steady', textOverlay: 'Welcome', cameraDirection: 'wide' }],
        totalDuration: '25s',
        pacing: 'balanced',
      },
      videoBrief: {
        totalDuration: '25s',
        motionStyle: 'smooth',
        textOverlayStyle: 'bold',
        cameraDirection: 'mixed',
        energyDirection: 'builds',
      },
    }));

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

    // Stage should succeed (with fallback metadata)
    expect(result.success).toBe(true);

    // Storyboard and videoBrief metadata should be persisted
    expect(context.workingData.storyboardAssetPath).toBeDefined();
    expect(context.workingData.videoBriefAssetPath).toBeDefined();

    // FallbackNotice should be recorded
    const updatedJob = mocks.jobStore.get(jobId);
    expect(updatedJob?.fallbackNotices.length).toBeGreaterThan(0);
    const notice = updatedJob!.fallbackNotices[0];
    expect(notice.capability).toBeDefined();
    expect(notice.reason).toBeDefined();
  });
});
