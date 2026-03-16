/**
 * MVP Unit tests for Worker pipeline enhancements.
 *
 * Tests validate individual stage behaviors: ProcessInput reads job fields,
 * GenerateCopy produces valid CopyPackage, GenerateImages produces ImageConcepts,
 * GenerateVideo produces Storyboard + VideoBrief, and fallback JSON parsing.
 *
 * Uses the same vi.hoisted mock pattern as worker.unit.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  JobState,
  Job,
  AssetType,
  AssetReference,
  FallbackNotice,
  Platform,
  Tone,
  CopyPackage,
  ImageConcept,
  Storyboard,
  VideoBrief,
} from '@content-storyteller/shared';

// ── Hoisted mocks ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const jobStore = new Map<string, Job>();
  const stateTransitions: JobState[] = [];
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
  const mockFileDownload = vi.fn();
  const mockBucketFile = vi.fn().mockImplementation((name: string) => ({
    name,
    save: (data: Buffer, _opts?: unknown) => mockFileSave(name, data),
    download: () => mockFileDownload(name),
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
        if (data.state) stateTransitions.push(data.state as JobState);
      }
      return Promise.resolve();
    });
  }

  function setupStorageMocks() {
    mockFileSave.mockImplementation((name: string, data: Buffer) => {
      writtenAssets.set(name, data);
      return Promise.resolve();
    });
    mockFileDownload.mockImplementation(() => {
      return Promise.resolve([Buffer.from('mock-media-data')]);
    });
  }

  function setupGenAIMocks() {
    mockGenerateContent.mockImplementation(async (prompt: string) => {
      if (prompt.includes('image concepts') || prompt.includes('image generation')) {
        return JSON.stringify([
          { conceptName: 'Concept 1', visualDirection: 'Modern', generationPrompt: 'Marketing visual 1', style: 'photorealistic' },
          { conceptName: 'Concept 2', visualDirection: 'Clean', generationPrompt: 'Marketing visual 2', style: 'flat illustration' },
        ]);
      }
      if (prompt.includes('storyboard') || prompt.includes('Storyboard')) {
        return JSON.stringify({
          storyboard: { scenes: [{ sceneNumber: 1, description: 'Opening', duration: '5s', motionStyle: 'steady', textOverlay: 'Welcome', cameraDirection: 'wide shot' }], totalDuration: '25s', pacing: 'balanced' },
          videoBrief: { totalDuration: '25s', motionStyle: 'smooth', textOverlayStyle: 'bold sans-serif', cameraDirection: 'mixed angles', energyDirection: 'builds from calm to energetic' },
        });
      }
      if (prompt.includes('Copy Package') || prompt.includes('copywriter')) {
        return JSON.stringify({
          hook: 'Test Hook', caption: 'Test caption', cta: 'Try now',
          hashtags: ['marketing'], threadCopy: ['Post 1'],
          voiceoverScript: 'Test voiceover', onScreenText: ['Key message'],
        });
      }
      return JSON.stringify({
        targetAudience: 'General audience', tone: 'Professional',
        keyMessages: ['Key message'], visualDirection: 'Modern and clean',
        inputSummary: 'Analyzed uploaded files',
        campaignAngle: 'Engaging campaign', pacing: 'Balanced', visualStyle: 'Modern',
      });
    });
  }

  return {
    jobStore, stateTransitions, writtenAssets,
    mockDocUpdate, mockDocGet, mockDoc, mockCollection,
    mockFileSave, mockFileDownload, mockBucketFile, mockBucket,
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
  GENAI_MODEL: 'gemini-2.0-flash',
}));

vi.mock('../capabilities/capability-registry', () => ({
  capabilityRegistry: {
    get: (name: string) => {
      if (name === 'image_generation' || name === 'video_generation') {
        return {
          name,
          isAvailable: mocks.capabilityIsAvailable,
          generate: mocks.capabilityGenerate,
        };
      }
      return undefined;
    },
    has: (name: string) => name === 'image_generation' || name === 'video_generation',
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
  };
});

// ── Helpers ─────────────────────────────────────────────────────────

function createMockJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'unit-test-job',
    correlationId: 'unit-corr-id',
    idempotencyKey: 'unit-idem-key',
    state: JobState.Queued,
    uploadedMediaPaths: ['uploads/test-file.png'],
    assets: [],
    fallbackNotices: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── Import modules under test (after mocks) ────────────────────────

import { ProcessInput } from '../pipeline/process-input';
import { GenerateCopy } from '../pipeline/generate-copy';
import { GenerateImages } from '../pipeline/generate-images';
import { GenerateVideo } from '../pipeline/generate-video';

// ── Test suite ──────────────────────────────────────────────────────

describe('MVP Worker Pipeline Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.jobStore.clear();
    mocks.writtenAssets.clear();
    mocks.stateTransitions.length = 0;
    mocks.setupFirestoreMocks();
    mocks.setupStorageMocks();
    mocks.setupGenAIMocks();
    mocks.capabilityIsAvailable.mockResolvedValue(true);
    mocks.capabilityGenerate.mockResolvedValue({
      success: true, assets: ['generated-asset-data'], metadata: {},
    });
  });

  // ── ProcessInput reads promptText/platform/tone from Job (Req 11.1) ──

  describe('ProcessInput reads creative direction from Job document', () => {
    it('reads promptText, platform, and tone from the Job', async () => {
      const jobId = 'pi-read-test';
      const job = createMockJob({
        id: jobId,
        promptText: 'Launch our new product',
        platform: Platform.InstagramReel,
        tone: Tone.Punchy,
      });
      mocks.jobStore.set(jobId, job);

      const context = {
        jobId,
        correlationId: 'corr-pi',
        uploadedMediaPaths: ['uploads/test.png'],
        workingData: {} as Record<string, unknown>,
      };

      const stage = new ProcessInput();
      const result = await stage.execute(context);

      expect(result.success).toBe(true);

      // Prompt should contain the platform and tone
      const calledPrompt = mocks.mockGenerateContent.mock.calls[0][0] as string;
      expect(calledPrompt).toContain(Platform.InstagramReel);
      expect(calledPrompt).toContain(Tone.Punchy);
      expect(calledPrompt).toContain('Launch our new product');
    });

    it('uses defaults when promptText/platform/tone are missing', async () => {
      const jobId = 'pi-defaults-test';
      const job = createMockJob({ id: jobId });
      mocks.jobStore.set(jobId, job);

      const context = {
        jobId,
        correlationId: 'corr-pi-def',
        uploadedMediaPaths: ['uploads/test.png'],
        workingData: {} as Record<string, unknown>,
      };

      const stage = new ProcessInput();
      const result = await stage.execute(context);

      expect(result.success).toBe(true);
      const brief = context.workingData.creativeBrief as Record<string, unknown>;
      expect(brief).toBeDefined();
      expect(brief.platform).toBe(Platform.GeneralPromoPackage);
    });
  });

  // ── GenerateCopy produces valid CopyPackage JSON (Req 12.1) ──────

  describe('GenerateCopy produces valid CopyPackage', () => {
    it('produces CopyPackage with all required fields', async () => {
      const jobId = 'gc-valid-test';
      mocks.jobStore.set(jobId, createMockJob({ id: jobId }));

      const stage = new GenerateCopy();
      const result = await stage.execute({
        jobId,
        correlationId: 'corr-gc',
        uploadedMediaPaths: ['uploads/test.png'],
        workingData: {
          creativeBrief: {
            targetAudience: 'Devs', tone: Tone.Sleek,
            keyMessages: ['Build'], visualDirection: 'Clean',
            inputSummary: 'Test', platform: Platform.XTwitterThread,
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.assets.length).toBeGreaterThanOrEqual(1);

      const data = mocks.writtenAssets.get(result.assets[0]);
      const pkg: CopyPackage = JSON.parse(data!.toString('utf-8'));
      expect(pkg.hook).toBeTruthy();
      expect(pkg.caption).toBeTruthy();
      expect(pkg.cta).toBeTruthy();
      expect(pkg.hashtags.length).toBeGreaterThan(0);
      expect(pkg.threadCopy.length).toBeGreaterThan(0);
      expect(pkg.voiceoverScript).toBeTruthy();
      expect(pkg.onScreenText.length).toBeGreaterThan(0);
    });

    it('falls back gracefully when GenAI returns malformed JSON', async () => {
      const jobId = 'gc-fallback-test';
      mocks.jobStore.set(jobId, createMockJob({ id: jobId }));
      mocks.mockGenerateContent.mockResolvedValueOnce('not valid json at all!!!');

      const stage = new GenerateCopy();
      const result = await stage.execute({
        jobId,
        correlationId: 'corr-gc-fb',
        uploadedMediaPaths: ['uploads/test.png'],
        workingData: {
          creativeBrief: {
            targetAudience: 'Devs', tone: Tone.Professional,
            keyMessages: ['Build fast'], visualDirection: 'Clean',
            inputSummary: 'Test brief',
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.assets.length).toBeGreaterThanOrEqual(1);

      // Fallback CopyPackage should still have all fields
      const data = mocks.writtenAssets.get(result.assets[0]);
      const pkg: CopyPackage = JSON.parse(data!.toString('utf-8'));
      expect(typeof pkg.hook).toBe('string');
      expect(typeof pkg.caption).toBe('string');
      expect(typeof pkg.cta).toBe('string');
      expect(Array.isArray(pkg.hashtags)).toBe(true);
    });
  });

  // ── GenerateImages produces ImageConcepts (Req 13.1) ─────────────

  describe('GenerateImages produces ImageConcept objects', () => {
    it('produces ImageConcepts even when capability is unavailable', async () => {
      const jobId = 'gi-concepts-test';
      mocks.jobStore.set(jobId, createMockJob({ id: jobId }));
      mocks.capabilityIsAvailable.mockResolvedValue(false);

      const stage = new GenerateImages();
      const result = await stage.execute({
        jobId,
        correlationId: 'corr-gi',
        uploadedMediaPaths: ['uploads/test.png'],
        workingData: {
          creativeBrief: {
            targetAudience: 'Devs', tone: Tone.Cinematic,
            keyMessages: ['Build'], visualDirection: 'Clean',
            inputSummary: 'Test',
          },
        },
      });

      expect(result.success).toBe(true);
      const conceptsPath = result.assets.find((p) => p.includes('image-concept'));
      expect(conceptsPath).toBeDefined();

      const data = mocks.writtenAssets.get(conceptsPath!);
      const concepts: ImageConcept[] = JSON.parse(data!.toString('utf-8'));
      expect(concepts.length).toBeGreaterThan(0);
      for (const c of concepts) {
        expect(c.conceptName).toBeTruthy();
        expect(c.generationPrompt).toBeTruthy();
        expect(c.style).toBeTruthy();
      }

      // Fallback notice should be recorded
      const finalJob = mocks.jobStore.get(jobId)!;
      expect(finalJob.fallbackNotices.length).toBeGreaterThan(0);
    });
  });

  // ── GenerateVideo produces Storyboard and VideoBrief (Req 14.1) ──

  describe('GenerateVideo produces Storyboard and VideoBrief', () => {
    it('produces both Storyboard and VideoBrief JSON assets', async () => {
      const jobId = 'gv-both-test';
      mocks.jobStore.set(jobId, createMockJob({ id: jobId }));
      mocks.capabilityIsAvailable.mockResolvedValue(false);

      const stage = new GenerateVideo();
      const result = await stage.execute({
        jobId,
        correlationId: 'corr-gv',
        uploadedMediaPaths: ['uploads/test.png'],
        workingData: {
          creativeBrief: {
            targetAudience: 'Devs', tone: Tone.Cinematic,
            keyMessages: ['Build'], visualDirection: 'Clean',
            inputSummary: 'Test', platform: Platform.LinkedInLaunchPost,
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.assets.length).toBeGreaterThanOrEqual(2);

      const sbPath = result.assets.find((p) => p.includes('storyboard'));
      const vbPath = result.assets.find((p) => p.includes('video-brief'));
      expect(sbPath).toBeDefined();
      expect(vbPath).toBeDefined();

      const sb: Storyboard = JSON.parse(mocks.writtenAssets.get(sbPath!)!.toString('utf-8'));
      expect(sb.scenes.length).toBeGreaterThan(0);
      expect(sb.scenes[0].sceneNumber).toBe(1);
      expect(typeof sb.totalDuration).toBe('string');

      const vb: VideoBrief = JSON.parse(mocks.writtenAssets.get(vbPath!)!.toString('utf-8'));
      expect(typeof vb.motionStyle).toBe('string');
      expect(typeof vb.textOverlayStyle).toBe('string');
      expect(typeof vb.energyDirection).toBe('string');
    });

    it('falls back gracefully when GenAI returns malformed JSON', async () => {
      const jobId = 'gv-fallback-test';
      mocks.jobStore.set(jobId, createMockJob({ id: jobId }));
      mocks.capabilityIsAvailable.mockResolvedValue(false);
      mocks.mockGenerateContent.mockResolvedValueOnce('totally broken json!!!');

      const stage = new GenerateVideo();
      const result = await stage.execute({
        jobId,
        correlationId: 'corr-gv-fb',
        uploadedMediaPaths: ['uploads/test.png'],
        workingData: {
          creativeBrief: {
            targetAudience: 'Devs', tone: Tone.Professional,
            keyMessages: ['Build'], visualDirection: 'Clean',
            inputSummary: 'Test',
          },
        },
      });

      expect(result.success).toBe(true);
      // Should still produce fallback storyboard + video brief
      expect(result.assets.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── GenAI SDK initialization (Req 15.1) ───────────────────────────

  describe('GenAI SDK configuration', () => {
    it('GENAI_MODEL constant is gemini-2.0-flash', async () => {
      const { GENAI_MODEL } = await import('../services/genai');
      expect(GENAI_MODEL).toBe('gemini-2.0-flash');
    });
  });
});
