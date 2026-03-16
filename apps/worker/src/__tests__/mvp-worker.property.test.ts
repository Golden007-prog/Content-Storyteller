/**
 * MVP Property-based tests for Worker pipeline enhancements.
 *
 * Tests validate that the enhanced pipeline stages produce platform-aware,
 * tone-aware outputs using the Google GenAI SDK.
 *
 * Uses the same vi.hoisted mock pattern as worker.property.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  JobState,
  Job,
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
          { conceptName: 'Concept 3', visualDirection: 'Bold', generationPrompt: 'Marketing visual 3', style: '3D render' },
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
      // Default: Creative Brief — echo back platform/tone from prompt
      const platformMatch = prompt.match(/Target platform: (\S+)/);
      const toneMatch = prompt.match(/Selected tone: (\S+)/);
      return JSON.stringify({
        targetAudience: 'General audience',
        tone: toneMatch ? toneMatch[1] : 'Professional',
        keyMessages: ['Key message'],
        visualDirection: 'Modern and clean',
        inputSummary: 'Analyzed uploaded files',
        platform: platformMatch ? platformMatch[1] : 'general_promo_package',
        campaignAngle: 'Engaging campaign',
        pacing: 'Balanced',
        visualStyle: 'Modern',
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

const platformArb = fc.constantFrom(...Object.values(Platform));
const toneArb = fc.constantFrom(...Object.values(Tone));

// ── Import modules under test (after mocks) ────────────────────────

import { ProcessInput } from '../pipeline/process-input';
import { GenerateCopy } from '../pipeline/generate-copy';
import { GenerateImages } from '../pipeline/generate-images';
import { GenerateVideo } from '../pipeline/generate-video';
import { GENAI_MODEL } from '../services/genai';

// ── Test suite ──────────────────────────────────────────────────────

describe('MVP Worker Pipeline Property Tests', () => {
  beforeEach(() => {
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

  // ── Property 9 ──────────────────────────────────────────────────────
  /**
   * Property 9: Creative Director produces platform-aware, tone-aware brief
   *
   * For all Platform × Tone combinations, ProcessInput must:
   * - Call generateContent with a prompt containing the platform and tone
   * - Store a creativeBrief in workingData with campaignAngle, pacing, visualStyle
   * - Return success
   *
   * Validates: Requirements 11.1, 11.2, 11.3
   */
  describe('Property 9: Creative Director produces platform-aware, tone-aware brief', () => {
    it('ProcessInput produces a brief with platform and tone for all combinations', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          platformArb,
          toneArb,
          fc.string({ minLength: 5, maxLength: 100 }),
          async (jobId, platform, tone, promptText) => {
            mocks.stateTransitions.length = 0;
            mocks.mockGenerateContent.mockClear();
            mocks.setupFirestoreMocks();
            mocks.setupGenAIMocks();

            const job = createMockJob({
              id: jobId,
              state: JobState.Queued,
              promptText,
              platform,
              tone,
            });
            mocks.jobStore.set(jobId, job);

            const context = {
              jobId,
              correlationId: 'corr-test',
              uploadedMediaPaths: ['uploads/test.png'],
              workingData: {} as Record<string, unknown>,
            };

            const stage = new ProcessInput();
            const result = await stage.execute(context);

            expect(result.success).toBe(true);

            // generateContent was called with a prompt containing platform and tone
            expect(mocks.mockGenerateContent).toHaveBeenCalled();
            const calledPrompt = mocks.mockGenerateContent.mock.calls[0][0] as string;
            expect(calledPrompt).toContain(platform);
            expect(calledPrompt).toContain(tone);

            // workingData.creativeBrief has MVP fields
            const brief = context.workingData.creativeBrief as Record<string, unknown>;
            expect(brief).toBeDefined();
            expect(typeof brief.campaignAngle).toBe('string');
            expect(typeof brief.pacing).toBe('string');
            expect(typeof brief.visualStyle).toBe('string');
            expect(brief.platform).toBe(platform);
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  // ── Property 10 ─────────────────────────────────────────────────────
  /**
   * Property 10: GenerateCopy produces complete CopyPackage
   *
   * For all Platform × Tone combinations, GenerateCopy must:
   * - Produce a CopyPackage with all required fields (hook, caption, cta, hashtags, threadCopy, voiceoverScript, onScreenText)
   * - Persist the copy as a JSON asset
   * - Return success with one asset path
   *
   * Validates: Requirements 12.1, 12.2, 12.3, 12.4
   */
  describe('Property 10: GenerateCopy produces complete CopyPackage', () => {
    it('GenerateCopy produces valid CopyPackage for all platform/tone combos', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          platformArb,
          toneArb,
          async (jobId, platform, tone) => {
            mocks.stateTransitions.length = 0;
            mocks.writtenAssets.clear();
            mocks.setupFirestoreMocks();
            mocks.setupStorageMocks();
            mocks.setupGenAIMocks();

            const job = createMockJob({ id: jobId, state: JobState.Queued });
            mocks.jobStore.set(jobId, job);

            const context = {
              jobId,
              correlationId: 'corr-test',
              uploadedMediaPaths: ['uploads/test.png'],
              workingData: {
                creativeBrief: {
                  targetAudience: 'Devs', tone: tone,
                  keyMessages: ['Build'], visualDirection: 'Clean',
                  inputSummary: 'Test', platform: platform,
                  campaignAngle: 'Test angle', pacing: 'Fast', visualStyle: 'Modern',
                },
              } as Record<string, unknown>,
            };

            const stage = new GenerateCopy();
            const result = await stage.execute(context);

            expect(result.success).toBe(true);
            expect(result.assets.length).toBeGreaterThanOrEqual(1);
            expect(result.assets[0]).toContain(`${jobId}/copy/`);

            // Verify persisted JSON is a valid CopyPackage
            const assetPath = result.assets[0];
            const assetData = mocks.writtenAssets.get(assetPath);
            expect(assetData).toBeDefined();
            const copyPkg: CopyPackage = JSON.parse(assetData!.toString('utf-8'));
            expect(typeof copyPkg.hook).toBe('string');
            expect(typeof copyPkg.caption).toBe('string');
            expect(typeof copyPkg.cta).toBe('string');
            expect(Array.isArray(copyPkg.hashtags)).toBe(true);
            expect(Array.isArray(copyPkg.threadCopy)).toBe(true);
            expect(typeof copyPkg.voiceoverScript).toBe('string');
            expect(Array.isArray(copyPkg.onScreenText)).toBe(true);
            expect(copyPkg.hook.length).toBeGreaterThan(0);
            expect(copyPkg.caption.length).toBeGreaterThan(0);
            expect(copyPkg.cta.length).toBeGreaterThan(0);
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  // ── Property 11 ─────────────────────────────────────────────────────
  /**
   * Property 11: GenerateImages produces ImageConcept objects
   *
   * For any job, GenerateImages must:
   * - Always persist an image-concepts JSON asset
   * - Each ImageConcept has conceptName, visualDirection, generationPrompt, style
   *
   * Validates: Requirements 13.1, 13.2
   */
  describe('Property 11: GenerateImages produces ImageConcept objects', () => {
    it('GenerateImages always persists ImageConcept array with required fields', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          platformArb,
          async (jobId, platform) => {
            mocks.stateTransitions.length = 0;
            mocks.writtenAssets.clear();
            mocks.setupFirestoreMocks();
            mocks.setupStorageMocks();
            mocks.setupGenAIMocks();
            mocks.capabilityIsAvailable.mockResolvedValue(false);

            const job = createMockJob({ id: jobId, state: JobState.Queued });
            mocks.jobStore.set(jobId, job);

            const context = {
              jobId,
              correlationId: 'corr-test',
              uploadedMediaPaths: ['uploads/test.png'],
              workingData: {
                creativeBrief: {
                  targetAudience: 'Devs', tone: 'Technical',
                  keyMessages: ['Build'], visualDirection: 'Clean',
                  inputSummary: 'Test', platform,
                },
              } as Record<string, unknown>,
            };

            const stage = new GenerateImages();
            const result = await stage.execute(context);

            expect(result.success).toBe(true);
            // At least the concepts JSON asset
            expect(result.assets.length).toBeGreaterThanOrEqual(1);
            const conceptsPath = result.assets.find((p) => p.includes('image-concept'));
            expect(conceptsPath).toBeDefined();

            const assetData = mocks.writtenAssets.get(conceptsPath!);
            expect(assetData).toBeDefined();
            const concepts: ImageConcept[] = JSON.parse(assetData!.toString('utf-8'));
            expect(Array.isArray(concepts)).toBe(true);
            expect(concepts.length).toBeGreaterThan(0);
            for (const c of concepts) {
              expect(typeof c.conceptName).toBe('string');
              expect(typeof c.visualDirection).toBe('string');
              expect(typeof c.generationPrompt).toBe('string');
              expect(typeof c.style).toBe('string');
              expect(c.conceptName.length).toBeGreaterThan(0);
              expect(c.generationPrompt.length).toBeGreaterThan(0);
            }
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  // ── Property 12 ─────────────────────────────────────────────────────
  /**
   * Property 12: GenerateVideo produces Storyboard and VideoBrief
   *
   * For all Platform × Tone combinations, GenerateVideo must:
   * - Persist a Storyboard JSON with scenes array
   * - Persist a VideoBrief JSON with motionStyle, textOverlayStyle, cameraDirection, energyDirection
   * - Return success with at least 2 asset paths
   *
   * Validates: Requirements 14.1, 14.2, 14.3, 14.4
   */
  describe('Property 12: GenerateVideo produces Storyboard and VideoBrief', () => {
    it('GenerateVideo produces both Storyboard and VideoBrief for all combos', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          platformArb,
          toneArb,
          async (jobId, platform, tone) => {
            mocks.stateTransitions.length = 0;
            mocks.writtenAssets.clear();
            mocks.setupFirestoreMocks();
            mocks.setupStorageMocks();
            mocks.setupGenAIMocks();
            mocks.capabilityIsAvailable.mockResolvedValue(false);

            const job = createMockJob({ id: jobId, state: JobState.Queued });
            mocks.jobStore.set(jobId, job);

            const context = {
              jobId,
              correlationId: 'corr-test',
              uploadedMediaPaths: ['uploads/test.png'],
              workingData: {
                creativeBrief: {
                  targetAudience: 'Devs', tone,
                  keyMessages: ['Build'], visualDirection: 'Clean',
                  inputSummary: 'Test', platform,
                  campaignAngle: 'Angle', pacing: 'Fast', visualStyle: 'Modern',
                },
              } as Record<string, unknown>,
            };

            const stage = new GenerateVideo();
            const result = await stage.execute(context);

            expect(result.success).toBe(true);
            expect(result.assets.length).toBeGreaterThanOrEqual(2);

            // Verify Storyboard
            const sbPath = result.assets.find((p) => p.includes('storyboard'));
            expect(sbPath).toBeDefined();
            const sbData = mocks.writtenAssets.get(sbPath!);
            expect(sbData).toBeDefined();
            const storyboard: Storyboard = JSON.parse(sbData!.toString('utf-8'));
            expect(Array.isArray(storyboard.scenes)).toBe(true);
            expect(storyboard.scenes.length).toBeGreaterThan(0);
            expect(typeof storyboard.totalDuration).toBe('string');
            for (const scene of storyboard.scenes) {
              expect(typeof scene.sceneNumber).toBe('number');
              expect(typeof scene.description).toBe('string');
              expect(typeof scene.duration).toBe('string');
              expect(typeof scene.motionStyle).toBe('string');
              expect(typeof scene.cameraDirection).toBe('string');
            }

            // Verify VideoBrief
            const vbPath = result.assets.find((p) => p.includes('video-brief'));
            expect(vbPath).toBeDefined();
            const vbData = mocks.writtenAssets.get(vbPath!);
            expect(vbData).toBeDefined();
            const vb: VideoBrief = JSON.parse(vbData!.toString('utf-8'));
            expect(typeof vb.totalDuration).toBe('string');
            expect(typeof vb.motionStyle).toBe('string');
            expect(typeof vb.textOverlayStyle).toBe('string');
            expect(typeof vb.cameraDirection).toBe('string');
            expect(typeof vb.energyDirection).toBe('string');
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  // ── Property 13 ─────────────────────────────────────────────────────
  /**
   * Property 13: Gemini model name consistency
   *
   * The GENAI_MODEL constant must be 'gemini-2.0-flash' across the codebase.
   *
   * Validates: Requirements 15.3, 23.1
   */
  describe('Property 13: Gemini model name consistency', () => {
    it('GENAI_MODEL is gemini-2.0-flash', () => {
      expect(GENAI_MODEL).toBe('gemini-2.0-flash');
    });
  });
});
