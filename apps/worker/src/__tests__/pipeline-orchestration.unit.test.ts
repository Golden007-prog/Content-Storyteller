/**
 * Unit tests for Smart Pipeline Orchestration.
 *
 * Tests validate concrete pipeline scenarios: copy-only, video, image-only,
 * full-package, partial completion with warnings, and global timeout enforcement.
 *
 * Uses the same vi.hoisted mock pattern as pipeline-orchestration.property.test.ts.
 *
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.6, 8.4
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  JobState,
  Job,
  AssetReference,
  OutputIntent,
  StepsMap,
  StepMetadata,
  JobWarning,
} from '@content-storyteller/shared';

// ── Hoisted mocks ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const jobStore = new Map<string, Job>();
  const stateTransitions: JobState[] = [];
  const writtenAssets = new Map<string, Buffer>();
  const stepUpdates: Array<{ jobId: string; stepKey: string; metadata: Partial<StepMetadata> }> = [];

  const mockDocUpdate = vi.fn();
  const mockDocGet = vi.fn();
  const mockDoc = vi.fn().mockImplementation((id: string) => ({
    id,
    get: () => mockDocGet(id),
    update: (data: Record<string, unknown>) => mockDocUpdate(id, data),
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
    mockDocUpdate.mockImplementation((id: string, data: Record<string, unknown>) => {
      const existing = jobStore.get(id);
      if (existing) {
        const currentSteps = existing.steps
          ? JSON.parse(JSON.stringify(existing.steps)) as Record<string, Record<string, unknown>>
          : {};

        const hasDotNotation = Object.keys(data).some(k => k.startsWith('steps.'));

        for (const [key, value] of Object.entries(data)) {
          if (key.startsWith('steps.')) {
            const parts = key.split('.');
            if (parts.length === 3) {
              const stepKey = parts[1];
              const field = parts[2];
              if (!currentSteps[stepKey]) currentSteps[stepKey] = {};
              currentSteps[stepKey][field] = value;
              stepUpdates.push({ jobId: id, stepKey, metadata: { [field]: value } as Partial<StepMetadata> });
            }
          }
        }

        const updated = { ...existing } as Record<string, unknown>;
        for (const [key, value] of Object.entries(data)) {
          if (!key.startsWith('steps.')) updated[key] = value;
        }
        if (hasDotNotation) updated.steps = currentSteps;
        if (data.state) stateTransitions.push(data.state as JobState);
        jobStore.set(id, updated as unknown as Job);
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
      if (prompt.includes('image concepts') || prompt.includes('image generation') || prompt.includes('visual marketing')) {
        return JSON.stringify([
          { conceptName: 'Concept 1', visualDirection: 'Modern', generationPrompt: 'Marketing visual 1', style: 'photorealistic' },
          { conceptName: 'Concept 2', visualDirection: 'Clean', generationPrompt: 'Marketing visual 2', style: 'flat illustration' },
        ]);
      }
      if (prompt.includes('storyboard') || prompt.includes('Storyboard') || prompt.includes('video director')) {
        return JSON.stringify({
          storyboard: { scenes: [{ sceneNumber: 1, description: 'Opening', duration: '5s', motionStyle: 'steady', textOverlay: 'Welcome', cameraDirection: 'wide shot' }], totalDuration: '25s', pacing: 'balanced' },
          videoBrief: { totalDuration: '25s', motionStyle: 'smooth', textOverlayStyle: 'bold sans-serif', cameraDirection: 'mixed angles', energyDirection: 'builds from calm to energetic' },
        });
      }
      if (prompt.includes('Copy Package') || prompt.includes('copywriter') || prompt.includes('marketing copywriter')) {
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
    jobStore, stateTransitions, writtenAssets, stepUpdates,
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
      if (name === 'image_generation' || name === 'video_generation' || name === 'gif_generation') {
        return {
          name,
          isAvailable: mocks.capabilityIsAvailable,
          generate: mocks.capabilityGenerate,
        };
      }
      return undefined;
    },
    has: (name: string) => name === 'image_generation' || name === 'video_generation' || name === 'gif_generation',
    init: vi.fn(),
    all: vi.fn().mockReturnValue([]),
    register: vi.fn(),
  },
}));

vi.mock('@content-storyteller/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@content-storyteller/shared')>();
  return {
    ...actual,
    getModel: vi.fn().mockReturnValue('test-model'),
  };
});

vi.mock('../middleware/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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

function makeContext(jobId: string) {
  return {
    jobId,
    correlationId: 'unit-corr',
    uploadedMediaPaths: ['uploads/test.png'],
    workingData: {},
  };
}

// ── Import module under test (after mocks) ──────────────────────────

import { runPipeline } from '../pipeline/pipeline-runner';

// ── Test suite ──────────────────────────────────────────────────────

describe('Pipeline Orchestration Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.jobStore.clear();
    mocks.writtenAssets.clear();
    mocks.stateTransitions.length = 0;
    mocks.stepUpdates.length = 0;
    mocks.setupFirestoreMocks();
    mocks.setupStorageMocks();
    mocks.setupGenAIMocks();
    mocks.capabilityIsAvailable.mockResolvedValue(false);
    mocks.capabilityGenerate.mockResolvedValue({
      success: false, assets: [], metadata: {},
    });
  });

  // ── Req 9.1: Copy-only request skips GenerateImages and GenerateVideo ──

  describe('Copy-only request (Req 9.1)', () => {
    it('skips GenerateImages and GenerateVideo, reaches completed', async () => {
      const jobId = 'copy-only-job';
      const outputIntent: OutputIntent = {
        wantsCopy: true,
        wantsHashtags: true,
        wantsImage: false,
        wantsVideo: false,
        wantsStoryboard: false,
        wantsVoiceover: false,
        wantsCarousel: false,
        wantsThread: false,
        wantsLinkedInPost: true,
        wantsGif: false,
      };

      mocks.jobStore.set(jobId, createMockJob({ id: jobId, outputIntent }));

      await runPipeline(makeContext(jobId));

      const finalJob = mocks.jobStore.get(jobId)!;
      expect(finalJob.state).toBe(JobState.Completed);

      // Steps metadata: images and video should be skipped
      const steps = finalJob.steps as StepsMap;
      expect(steps.processInput.status).toBe('completed');
      expect(steps.generateCopy.status).toBe('completed');
      expect(steps.generateImages.status).toBe('skipped');
      expect(steps.generateVideo.status).toBe('skipped');
      expect(steps.composePackage.status).toBe('completed');

      // State transitions should NOT include generating_images or generating_video
      expect(mocks.stateTransitions).not.toContain(JobState.GeneratingImages);
      expect(mocks.stateTransitions).not.toContain(JobState.GeneratingVideo);
      expect(mocks.stateTransitions).toContain(JobState.Completed);

      // Skipped outputs should list the skipped stages
      const skipped = finalJob.skippedOutputs as string[];
      expect(skipped).toContain('GenerateImages');
      expect(skipped).toContain('GenerateVideo');
    });
  });

  // ── Req 9.2: Video request executes GenerateCopy and GenerateVideo ──

  describe('Video request (Req 9.2)', () => {
    it('executes GenerateCopy and GenerateVideo, reaches completed', async () => {
      const jobId = 'video-request-job';
      const outputIntent: OutputIntent = {
        wantsCopy: true,
        wantsHashtags: true,
        wantsImage: false,
        wantsVideo: true,
        wantsStoryboard: true,
        wantsVoiceover: true,
        wantsCarousel: false,
        wantsThread: false,
        wantsLinkedInPost: false,
        wantsGif: false,
      };

      mocks.jobStore.set(jobId, createMockJob({ id: jobId, outputIntent }));

      await runPipeline(makeContext(jobId));

      const finalJob = mocks.jobStore.get(jobId)!;
      expect(finalJob.state).toBe(JobState.Completed);

      const steps = finalJob.steps as StepsMap;
      expect(steps.processInput.status).toBe('completed');
      expect(steps.generateCopy.status).toBe('completed');
      expect(steps.generateImages.status).toBe('skipped');
      expect(steps.generateVideo.status).toBe('completed');
      expect(steps.composePackage.status).toBe('completed');

      // State transitions should include generating_video but not generating_images
      expect(mocks.stateTransitions).toContain(JobState.GeneratingVideo);
      expect(mocks.stateTransitions).not.toContain(JobState.GeneratingImages);
      expect(mocks.stateTransitions).toContain(JobState.Completed);

      // Completed outputs should include GenerateVideo
      const completed = finalJob.completedOutputs as string[];
      expect(completed).toContain('GenerateVideo');
      expect(completed).toContain('GenerateCopy');
    });
  });

  // ── Req 9.3: Image-only request executes GenerateImages, skips GenerateVideo ──

  describe('Image-only request (Req 9.3)', () => {
    it('executes GenerateCopy and GenerateImages, skips GenerateVideo, reaches completed', async () => {
      const jobId = 'image-only-job';
      const outputIntent: OutputIntent = {
        wantsCopy: true,
        wantsHashtags: true,
        wantsImage: true,
        wantsVideo: false,
        wantsStoryboard: false,
        wantsVoiceover: false,
        wantsCarousel: false,
        wantsThread: false,
        wantsLinkedInPost: false,
        wantsGif: false,
      };

      mocks.jobStore.set(jobId, createMockJob({ id: jobId, outputIntent }));

      await runPipeline(makeContext(jobId));

      const finalJob = mocks.jobStore.get(jobId)!;
      expect(finalJob.state).toBe(JobState.Completed);

      const steps = finalJob.steps as StepsMap;
      expect(steps.processInput.status).toBe('completed');
      expect(steps.generateCopy.status).toBe('completed');
      expect(steps.generateImages.status).toBe('completed');
      expect(steps.generateVideo.status).toBe('skipped');
      expect(steps.composePackage.status).toBe('completed');

      // State transitions
      expect(mocks.stateTransitions).toContain(JobState.GeneratingImages);
      expect(mocks.stateTransitions).not.toContain(JobState.GeneratingVideo);
      expect(mocks.stateTransitions).toContain(JobState.Completed);

      const skipped = finalJob.skippedOutputs as string[];
      expect(skipped).toContain('GenerateVideo');
      expect(skipped).not.toContain('GenerateImages');
    });
  });

  // ── Req 9.4: Full-package request executes all stages ──

  describe('Full-package request (Req 9.4)', () => {
    it('executes all stages and reaches completed', async () => {
      const jobId = 'full-package-job';
      const outputIntent: OutputIntent = {
        wantsCopy: true,
        wantsHashtags: true,
        wantsImage: true,
        wantsVideo: true,
        wantsStoryboard: true,
        wantsVoiceover: true,
        wantsCarousel: true,
        wantsThread: true,
        wantsLinkedInPost: true,
        wantsGif: true,
      };

      mocks.jobStore.set(jobId, createMockJob({ id: jobId, outputIntent }));

      await runPipeline(makeContext(jobId));

      const finalJob = mocks.jobStore.get(jobId)!;
      expect(finalJob.state).toBe(JobState.Completed);

      const steps = finalJob.steps as StepsMap;
      expect(steps.processInput.status).toBe('completed');
      expect(steps.generateCopy.status).toBe('completed');
      expect(steps.generateImages.status).toBe('completed');
      expect(steps.generateVideo.status).toBe('completed');
      expect(steps.composePackage.status).toBe('completed');

      // All stage states should appear in transitions
      expect(mocks.stateTransitions).toContain(JobState.ProcessingInput);
      expect(mocks.stateTransitions).toContain(JobState.GeneratingCopy);
      expect(mocks.stateTransitions).toContain(JobState.GeneratingImages);
      expect(mocks.stateTransitions).toContain(JobState.GeneratingVideo);
      expect(mocks.stateTransitions).toContain(JobState.ComposingPackage);
      expect(mocks.stateTransitions).toContain(JobState.Completed);

      // No skipped outputs
      const skipped = finalJob.skippedOutputs as string[];
      expect(skipped).toEqual([]);
    });
  });

  // ── Req 9.6: Optional stage failure → partial completion with warnings ──

  describe('Optional stage failure with critical success (Req 9.6)', () => {
    it('GenerateImages fails but critical stages succeed → completed with warnings', async () => {
      const jobId = 'partial-completion-job';
      const outputIntent: OutputIntent = {
        wantsCopy: true,
        wantsHashtags: true,
        wantsImage: true,
        wantsVideo: false,
        wantsStoryboard: false,
        wantsVoiceover: false,
        wantsCarousel: false,
        wantsThread: false,
        wantsLinkedInPost: false,
        wantsGif: false,
      };

      mocks.jobStore.set(jobId, createMockJob({ id: jobId, outputIntent }));

      // Make GenerateImages fail
      mocks.mockGenerateContent.mockImplementation(async (prompt: string) => {
        if (prompt.includes('visual marketing') || prompt.includes('image concepts')) {
          throw new Error('Image generation service unavailable');
        }
        if (prompt.includes('copywriter') || prompt.includes('marketing copywriter') || prompt.includes('Copy Package')) {
          return JSON.stringify({
            hook: 'Hook', caption: 'Caption', cta: 'CTA',
            hashtags: ['tag'], threadCopy: ['Thread'],
            voiceoverScript: 'Script', onScreenText: ['Text'],
          });
        }
        return JSON.stringify({
          targetAudience: 'General', tone: 'Professional',
          keyMessages: ['Key'], visualDirection: 'Modern',
          inputSummary: 'Test', campaignAngle: 'Angle',
          pacing: 'Balanced', visualStyle: 'Modern',
        });
      });

      await runPipeline(makeContext(jobId));

      const finalJob = mocks.jobStore.get(jobId)!;

      // Job should be completed (not failed) since critical stages succeeded
      expect(finalJob.state).toBe(JobState.Completed);

      // Steps: generateImages should be failed, others completed
      const steps = finalJob.steps as StepsMap;
      expect(steps.processInput.status).toBe('completed');
      expect(steps.generateCopy.status).toBe('completed');
      expect(steps.generateImages.status).toBe('failed');
      expect(steps.composePackage.status).toBe('completed');

      // Warnings should contain an entry for GenerateImages
      const warnings = finalJob.warnings as JobWarning[];
      expect(warnings).toBeDefined();
      expect(warnings.length).toBeGreaterThan(0);
      const imageWarning = warnings.find(w => w.stage === 'GenerateImages');
      expect(imageWarning).toBeDefined();
      expect(imageWarning!.message).toContain('Image generation service unavailable');
      expect(imageWarning!.severity).toBe('warning');
    });

    it('GenerateVideo fails but critical stages succeed → completed with warnings', async () => {
      const jobId = 'partial-video-fail-job';
      const outputIntent: OutputIntent = {
        wantsCopy: true,
        wantsHashtags: true,
        wantsImage: false,
        wantsVideo: true,
        wantsStoryboard: true,
        wantsVoiceover: true,
        wantsCarousel: false,
        wantsThread: false,
        wantsLinkedInPost: false,
        wantsGif: false,
      };

      mocks.jobStore.set(jobId, createMockJob({ id: jobId, outputIntent }));

      // Make GenerateVideo fail
      mocks.mockGenerateContent.mockImplementation(async (prompt: string) => {
        if (prompt.includes('video director') || prompt.includes('storyboard') || prompt.includes('Storyboard')) {
          throw new Error('Video generation timed out');
        }
        if (prompt.includes('copywriter') || prompt.includes('marketing copywriter') || prompt.includes('Copy Package')) {
          return JSON.stringify({
            hook: 'Hook', caption: 'Caption', cta: 'CTA',
            hashtags: ['tag'], threadCopy: ['Thread'],
            voiceoverScript: 'Script', onScreenText: ['Text'],
          });
        }
        return JSON.stringify({
          targetAudience: 'General', tone: 'Professional',
          keyMessages: ['Key'], visualDirection: 'Modern',
          inputSummary: 'Test', campaignAngle: 'Angle',
          pacing: 'Balanced', visualStyle: 'Modern',
        });
      });

      await runPipeline(makeContext(jobId));

      const finalJob = mocks.jobStore.get(jobId)!;
      expect(finalJob.state).toBe(JobState.Completed);

      const warnings = finalJob.warnings as JobWarning[];
      expect(warnings).toBeDefined();
      const videoWarning = warnings.find(w => w.stage === 'GenerateVideo');
      expect(videoWarning).toBeDefined();
      expect(videoWarning!.message).toContain('Video generation timed out');
    });
  });

  // ── Req 8.4: Global timeout enforcement ──

  describe('Global timeout enforcement (Req 8.4)', () => {
    it('pipeline fails with timeout error when global timeout is exceeded', async () => {
      const jobId = 'timeout-job';
      const outputIntent: OutputIntent = {
        wantsCopy: true,
        wantsHashtags: true,
        wantsImage: true,
        wantsVideo: true,
        wantsStoryboard: true,
        wantsVoiceover: true,
        wantsCarousel: true,
        wantsThread: true,
        wantsLinkedInPost: true,
        wantsGif: true,
      };

      mocks.jobStore.set(jobId, createMockJob({ id: jobId, outputIntent }));

      // Mock Date.now to simulate timeout after first stage
      const realDateNow = Date.now;
      let callCount = 0;
      const startTime = realDateNow();
      vi.spyOn(Date, 'now').mockImplementation(() => {
        callCount++;
        // First few calls: normal time. After several calls (past first stage),
        // jump past the 10-minute timeout.
        if (callCount > 5) {
          return startTime + 11 * 60 * 1000; // 11 minutes
        }
        return startTime + callCount * 100;
      });

      try {
        await runPipeline(makeContext(jobId));
        // Should not reach here
        expect.unreachable('Pipeline should have thrown a timeout error');
      } catch (err) {
        expect((err as Error).message).toContain('timed out');
      }

      const finalJob = mocks.jobStore.get(jobId)!;
      expect(finalJob.state).toBe(JobState.Failed);
      expect(finalJob.errorMessage).toBeDefined();
      expect((finalJob.errorMessage as string)).toContain('timed out');

      // Restore Date.now
      vi.spyOn(Date, 'now').mockRestore();
    });
  });
});
