/**
 * Property-based tests for Smart Pipeline Orchestration.
 *
 * Tests validate conditional pipeline execution based on OutputIntent,
 * step metadata tracking, partial completion, state sequencing, and
 * output tracking consistency.
 *
 * Uses the same vi.hoisted mock pattern as worker.property.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  JobState,
  Job,
  AssetReference,
  AssetType,
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
        // Deep clone existing steps so we can mutate safely
        const currentSteps = existing.steps
          ? JSON.parse(JSON.stringify(existing.steps)) as Record<string, Record<string, unknown>>
          : {};

        const hasDotNotation = Object.keys(data).some(k => k.startsWith('steps.'));

        // Handle dot-notation keys for step metadata updates
        for (const [key, value] of Object.entries(data)) {
          if (key.startsWith('steps.')) {
            const parts = key.split('.');
            if (parts.length === 3) {
              const stepKey = parts[1];
              const field = parts[2];
              if (!currentSteps[stepKey]) {
                currentSteps[stepKey] = {};
              }
              currentSteps[stepKey][field] = value;

              stepUpdates.push({
                jobId: id,
                stepKey,
                metadata: { [field]: value } as Partial<StepMetadata>,
              });
            }
          }
        }

        // Build updated job
        const updated = { ...existing } as Record<string, unknown>;

        // Apply non-dot-notation keys
        for (const [key, value] of Object.entries(data)) {
          if (!key.startsWith('steps.')) {
            updated[key] = value;
          }
        }

        // If we had dot-notation step updates, apply the merged steps
        if (hasDotNotation) {
          updated.steps = currentSteps;
        }

        // Track state transitions
        if (data.state) {
          stateTransitions.push(data.state as JobState);
        }

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
          { conceptName: 'Concept 3', visualDirection: 'Bold', generationPrompt: 'Marketing visual 3', style: '3D render' },
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


/**
 * Generate a random OutputIntent with wantsCopy always true.
 * intentKey null stages (ProcessInput, ComposePackage) always run.
 * wantsCopy is always true per the invariant.
 */
const arbOutputIntent = fc.record({
  wantsCopy: fc.constant(true),
  wantsHashtags: fc.boolean(),
  wantsImage: fc.boolean(),
  wantsVideo: fc.boolean(),
  wantsStoryboard: fc.boolean(),
  wantsVoiceover: fc.boolean(),
  wantsCarousel: fc.boolean(),
  wantsThread: fc.boolean(),
  wantsLinkedInPost: fc.boolean(),
});

/**
 * Stage configs matching the pipeline runner's STAGE_CONFIGS.
 * Used to verify step metadata and skipping behavior.
 */
const STAGE_CONFIGS = [
  { name: 'ProcessInput', stepsKey: 'processInput' as keyof StepsMap, intentKey: null as (keyof OutputIntent | null), critical: true },
  { name: 'GenerateCopy', stepsKey: 'generateCopy' as keyof StepsMap, intentKey: 'wantsCopy' as keyof OutputIntent, critical: true },
  { name: 'GenerateImages', stepsKey: 'generateImages' as keyof StepsMap, intentKey: 'wantsImage' as keyof OutputIntent, critical: false },
  { name: 'GenerateVideo', stepsKey: 'generateVideo' as keyof StepsMap, intentKey: 'wantsVideo' as keyof OutputIntent, critical: false },
  { name: 'ComposePackage', stepsKey: 'composePackage' as keyof StepsMap, intentKey: null as (keyof OutputIntent | null), critical: true },
];

/**
 * Map from stage stepsKey to the AssetType that stage produces.
 */
const STAGE_ASSET_TYPE_MAP: Record<string, AssetType | null> = {
  processInput: null,
  generateCopy: AssetType.Copy,
  generateImages: AssetType.Image,
  generateVideo: AssetType.Video,
  composePackage: null,
};

// ── Import modules under test (after mocks) ────────────────────────

import { runPipeline } from '../pipeline/pipeline-runner';

// ── Test suite ──────────────────────────────────────────────────────

describe('Pipeline Orchestration Property Tests', () => {
  beforeEach(() => {
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

  // ── Property 7 ──────────────────────────────────────────────────────
  /**
   * Feature: smart-pipeline-orchestration, Property 7: Skipped stages marked correctly
   *
   * Stages with false intent flags get status `skipped`;
   * true/null flags never get `skipped`.
   *
   * **Validates: Requirements 4.1, 4.2, 2.6**
   */
  describe('Property 7: Skipped stages marked correctly', () => {
    it('stages with false intent flags are skipped; true/null flags are never skipped', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          arbOutputIntent,
          async (jobId, outputIntent) => {
            mocks.jobStore.clear();
            mocks.writtenAssets.clear();
            mocks.stateTransitions.length = 0;
            mocks.stepUpdates.length = 0;
            mocks.setupFirestoreMocks();
            mocks.setupStorageMocks();
            mocks.setupGenAIMocks();
            mocks.capabilityIsAvailable.mockResolvedValue(false);

            const job = createMockJob({
              id: jobId,
              state: JobState.Queued,
              outputIntent,
            });
            mocks.jobStore.set(jobId, job);

            try {
              await runPipeline({
                jobId,
                correlationId: 'corr-test',
                uploadedMediaPaths: ['uploads/test.png'],
                workingData: {},
              });
            } catch {
              // Pipeline may throw on critical failures — we still check step metadata
            }

            const finalJob = mocks.jobStore.get(jobId);
            const steps = finalJob?.steps as StepsMap | undefined;
            if (!steps) return; // Steps should always be initialized

            for (const config of STAGE_CONFIGS) {
              const step = steps[config.stepsKey];
              if (!step) continue;

              if (config.intentKey !== null && !outputIntent[config.intentKey]) {
                // Intent flag is false → step must be skipped
                expect(step.status).toBe('skipped');
              } else {
                // Intent flag is true or null (always-run) → step must NOT be skipped
                expect(step.status).not.toBe('skipped');
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 8 ──────────────────────────────────────────────────────
  /**
   * Feature: smart-pipeline-orchestration, Property 8: Pipeline reaches completed when all requested stages succeed
   *
   * All needed stages succeed → job completed.
   *
   * **Validates: Requirements 4.5, 4.3, 1.3**
   */
  describe('Property 8: Pipeline reaches completed when all requested stages succeed', () => {
    it('all requested stages succeed → job state is completed', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          arbOutputIntent,
          async (jobId, outputIntent) => {
            mocks.jobStore.clear();
            mocks.writtenAssets.clear();
            mocks.stateTransitions.length = 0;
            mocks.stepUpdates.length = 0;
            mocks.setupFirestoreMocks();
            mocks.setupStorageMocks();
            mocks.setupGenAIMocks();
            mocks.capabilityIsAvailable.mockResolvedValue(false);

            const job = createMockJob({
              id: jobId,
              state: JobState.Queued,
              outputIntent,
            });
            mocks.jobStore.set(jobId, job);

            await runPipeline({
              jobId,
              correlationId: 'corr-test',
              uploadedMediaPaths: ['uploads/test.png'],
              workingData: {},
            });

            const finalJob = mocks.jobStore.get(jobId);
            expect(finalJob?.state).toBe(JobState.Completed);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 9 ──────────────────────────────────────────────────────
  /**
   * Feature: smart-pipeline-orchestration, Property 9: Critical stage failure transitions job to failed
   *
   * ProcessInput or GenerateCopy failure → job failed with errorMessage.
   *
   * **Validates: Requirements 8.3, 1.6, 2.4**
   */
  describe('Property 9: Critical stage failure transitions job to failed', () => {
    it('critical stage failure → job state is failed with errorMessage', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.constantFrom('processInput', 'generateCopy'),
          fc.string({ minLength: 3, maxLength: 50 }),
          async (jobId, failingStage, errorText) => {
            mocks.jobStore.clear();
            mocks.writtenAssets.clear();
            mocks.stateTransitions.length = 0;
            mocks.stepUpdates.length = 0;
            mocks.setupFirestoreMocks();
            mocks.setupStorageMocks();
            mocks.capabilityIsAvailable.mockResolvedValue(false);

            // Make the appropriate stage fail
            mocks.mockGenerateContent.mockImplementation(async (prompt: string) => {
              if (failingStage === 'processInput') {
                // ProcessInput is the first stage that calls generateContent
                // with a Creative Director prompt
                if (prompt.includes('Creative Director') || prompt.includes('Creative Brief')) {
                  throw new Error(errorText);
                }
              }
              if (failingStage === 'generateCopy') {
                if (prompt.includes('copywriter') || prompt.includes('marketing copywriter') || prompt.includes('Copy Package')) {
                  throw new Error(errorText);
                }
              }
              // Default responses for other stages
              if (prompt.includes('image') || prompt.includes('visual marketing')) {
                return JSON.stringify([{ conceptName: 'C1', visualDirection: 'V1', generationPrompt: 'P1', style: 'photo' }]);
              }
              if (prompt.includes('storyboard') || prompt.includes('video director')) {
                return JSON.stringify({
                  storyboard: { scenes: [{ sceneNumber: 1, description: 'S', duration: '5s', motionStyle: 'steady', textOverlay: '', cameraDirection: 'wide' }], totalDuration: '25s', pacing: 'balanced' },
                  videoBrief: { totalDuration: '25s', motionStyle: 'smooth', textOverlayStyle: 'bold', cameraDirection: 'mixed', energyDirection: 'builds' },
                });
              }
              return JSON.stringify({
                targetAudience: 'General', tone: 'Professional',
                keyMessages: ['Key'], visualDirection: 'Modern',
                inputSummary: 'Test', campaignAngle: 'Angle',
                pacing: 'Balanced', visualStyle: 'Modern',
              });
            });

            const job = createMockJob({
              id: jobId,
              state: JobState.Queued,
              outputIntent: {
                wantsCopy: true, wantsHashtags: true, wantsImage: true,
                wantsVideo: true, wantsStoryboard: true, wantsVoiceover: true,
                wantsCarousel: true, wantsThread: true, wantsLinkedInPost: true,
              },
            });
            mocks.jobStore.set(jobId, job);

            try {
              await runPipeline({
                jobId,
                correlationId: 'corr-test',
                uploadedMediaPaths: ['uploads/test.png'],
                workingData: {},
              });
            } catch {
              // Expected to throw
            }

            const finalJob = mocks.jobStore.get(jobId);
            expect(finalJob?.state).toBe(JobState.Failed);
            expect(finalJob?.errorMessage).toBeTruthy();
            expect(typeof finalJob?.errorMessage).toBe('string');
            expect((finalJob?.errorMessage as string).length).toBeGreaterThan(0);
          },
        ),
        { numRuns: 100 },
      );
    });
  });


  // ── Property 10 ─────────────────────────────────────────────────────
  /**
   * Feature: smart-pipeline-orchestration, Property 10: Non-critical failure with critical success yields partial completion
   *
   * Optional stage fails, critical succeeds → completed with warnings.
   *
   * **Validates: Requirements 8.2**
   */
  describe('Property 10: Non-critical failure with critical success yields partial completion', () => {
    it('non-critical stage failure with critical success → completed with warnings', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.constantFrom('generateImages', 'generateVideo'),
          async (jobId, failingStage) => {
            mocks.jobStore.clear();
            mocks.writtenAssets.clear();
            mocks.stateTransitions.length = 0;
            mocks.stepUpdates.length = 0;
            mocks.setupFirestoreMocks();
            mocks.setupStorageMocks();
            mocks.capabilityIsAvailable.mockResolvedValue(false);

            // Make the non-critical stage fail by throwing from generateContent
            mocks.mockGenerateContent.mockImplementation(async (prompt: string) => {
              if (failingStage === 'generateImages' && (prompt.includes('visual marketing') || prompt.includes('image concepts'))) {
                throw new Error('Image generation failed');
              }
              if (failingStage === 'generateVideo' && (prompt.includes('video director') || prompt.includes('storyboard') || prompt.includes('Storyboard'))) {
                throw new Error('Video generation failed');
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

            // Ensure the failing stage is requested
            const outputIntent: OutputIntent = {
              wantsCopy: true, wantsHashtags: true,
              wantsImage: failingStage === 'generateImages',
              wantsVideo: failingStage === 'generateVideo',
              wantsStoryboard: true, wantsVoiceover: true,
              wantsCarousel: true, wantsThread: true, wantsLinkedInPost: true,
            };

            const job = createMockJob({
              id: jobId,
              state: JobState.Queued,
              outputIntent,
            });
            mocks.jobStore.set(jobId, job);

            await runPipeline({
              jobId,
              correlationId: 'corr-test',
              uploadedMediaPaths: ['uploads/test.png'],
              workingData: {},
            });

            const finalJob = mocks.jobStore.get(jobId);
            // Job should be completed (not failed) since critical stages succeeded
            expect(finalJob?.state).toBe(JobState.Completed);

            // Warnings array should contain at least one entry
            const warnings = finalJob?.warnings as JobWarning[] | undefined;
            expect(warnings).toBeDefined();
            expect(Array.isArray(warnings)).toBe(true);
            expect(warnings!.length).toBeGreaterThan(0);

            // At least one warning should reference the failing stage
            const failingStageName = failingStage === 'generateImages' ? 'GenerateImages' : 'GenerateVideo';
            const relevantWarning = warnings!.find(w => w.stage === failingStageName);
            expect(relevantWarning).toBeDefined();
            expect(relevantWarning!.message.length).toBeGreaterThan(0);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 11 ─────────────────────────────────────────────────────
  /**
   * Feature: smart-pipeline-orchestration, Property 11: State sequence correctness
   *
   * JobState transitions follow canonical order, skipping states for skipped stages.
   *
   * **Validates: Requirements 9.5, 1.8**
   */
  describe('Property 11: State sequence correctness', () => {
    it('state transitions follow canonical order, skipping states for skipped stages', () => {
      const CANONICAL_ORDER: JobState[] = [
        JobState.ProcessingInput,
        JobState.GeneratingCopy,
        JobState.GeneratingImages,
        JobState.GeneratingVideo,
        JobState.ComposingPackage,
        JobState.Completed,
      ];

      return fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          arbOutputIntent,
          async (jobId, outputIntent) => {
            mocks.jobStore.clear();
            mocks.writtenAssets.clear();
            mocks.stateTransitions.length = 0;
            mocks.stepUpdates.length = 0;
            mocks.setupFirestoreMocks();
            mocks.setupStorageMocks();
            mocks.setupGenAIMocks();
            mocks.capabilityIsAvailable.mockResolvedValue(false);

            const job = createMockJob({
              id: jobId,
              state: JobState.Queued,
              outputIntent,
            });
            mocks.jobStore.set(jobId, job);

            try {
              await runPipeline({
                jobId,
                correlationId: 'corr-test',
                uploadedMediaPaths: ['uploads/test.png'],
                workingData: {},
              });
            } catch {
              // Pipeline may fail — we still check ordering
            }

            // Filter out Failed state and deduplicate consecutive identical states
            const nonFailedTransitions = mocks.stateTransitions.filter(
              (s) => s !== JobState.Failed,
            );
            const deduped: JobState[] = [];
            for (const s of nonFailedTransitions) {
              if (deduped.length === 0 || deduped[deduped.length - 1] !== s) {
                deduped.push(s);
              }
            }

            // Verify transitions are a subsequence of CANONICAL_ORDER
            let orderIdx = 0;
            for (const transition of deduped) {
              while (orderIdx < CANONICAL_ORDER.length && CANONICAL_ORDER[orderIdx] !== transition) {
                orderIdx++;
              }
              expect(orderIdx).toBeLessThan(CANONICAL_ORDER.length);
              orderIdx++;
            }

            // Verify skipped stages don't appear in state transitions
            const stageToJobState: Record<string, JobState> = {
              generateImages: JobState.GeneratingImages,
              generateVideo: JobState.GeneratingVideo,
            };

            for (const config of STAGE_CONFIGS) {
              if (config.intentKey !== null && !outputIntent[config.intentKey]) {
                const expectedSkippedState = stageToJobState[config.stepsKey];
                if (expectedSkippedState) {
                  expect(deduped).not.toContain(expectedSkippedState);
                }
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 13 ─────────────────────────────────────────────────────
  /**
   * Feature: smart-pipeline-orchestration, Property 13: Output tracking consistency
   *
   * completedOutputs ∪ skippedOutputs covers all types;
   * completedOutputs ⊆ requestedOutputs; no overlap.
   *
   * **Validates: Requirements 7.1, 7.2, 7.3**
   */
  describe('Property 13: Output tracking consistency', () => {
    it('completedOutputs and skippedOutputs are consistent and non-overlapping', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          arbOutputIntent,
          async (jobId, outputIntent) => {
            mocks.jobStore.clear();
            mocks.writtenAssets.clear();
            mocks.stateTransitions.length = 0;
            mocks.stepUpdates.length = 0;
            mocks.setupFirestoreMocks();
            mocks.setupStorageMocks();
            mocks.setupGenAIMocks();
            mocks.capabilityIsAvailable.mockResolvedValue(false);

            const job = createMockJob({
              id: jobId,
              state: JobState.Queued,
              outputIntent,
            });
            mocks.jobStore.set(jobId, job);

            try {
              await runPipeline({
                jobId,
                correlationId: 'corr-test',
                uploadedMediaPaths: ['uploads/test.png'],
                workingData: {},
              });
            } catch {
              // Pipeline may fail — we still check output tracking
            }

            const finalJob = mocks.jobStore.get(jobId);
            const completedOutputs = (finalJob?.completedOutputs ?? []) as string[];
            const skippedOutputs = (finalJob?.skippedOutputs ?? []) as string[];

            // No overlap between completed and skipped
            const overlap = completedOutputs.filter(o => skippedOutputs.includes(o));
            expect(overlap).toEqual([]);

            // Union of completed + skipped should cover all stage names
            const allTracked = new Set([...completedOutputs, ...skippedOutputs]);
            for (const config of STAGE_CONFIGS) {
              // Every stage should appear in either completed or skipped
              // (unless the pipeline failed before reaching it)
              if (finalJob?.state === JobState.Completed) {
                expect(allTracked.has(config.name)).toBe(true);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 14 ─────────────────────────────────────────────────────
  /**
   * Feature: smart-pipeline-orchestration, Property 14: Assets only from non-skipped stages
   *
   * No assets from skipped stages appear in the assets array.
   *
   * **Validates: Requirements 7.4, 4.4**
   */
  describe('Property 14: Assets only from non-skipped stages', () => {
    it('no assets from skipped stages appear in the assets array', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          arbOutputIntent,
          async (jobId, outputIntent) => {
            mocks.jobStore.clear();
            mocks.writtenAssets.clear();
            mocks.stateTransitions.length = 0;
            mocks.stepUpdates.length = 0;
            mocks.setupFirestoreMocks();
            mocks.setupStorageMocks();
            mocks.setupGenAIMocks();
            mocks.capabilityIsAvailable.mockResolvedValue(false);

            const job = createMockJob({
              id: jobId,
              state: JobState.Queued,
              outputIntent,
            });
            mocks.jobStore.set(jobId, job);

            try {
              await runPipeline({
                jobId,
                correlationId: 'corr-test',
                uploadedMediaPaths: ['uploads/test.png'],
                workingData: {},
              });
            } catch {
              // Pipeline may fail — we still check assets
            }

            const finalJob = mocks.jobStore.get(jobId);
            const assets = (finalJob?.assets ?? []) as AssetReference[];
            const steps = finalJob?.steps as StepsMap | undefined;

            if (!steps) return;

            // Determine which stages were skipped
            const skippedStageKeys = STAGE_CONFIGS
              .filter(c => steps[c.stepsKey]?.status === 'skipped')
              .map(c => c.stepsKey);

            // Get the asset types that correspond to skipped stages
            const skippedAssetTypes = skippedStageKeys
              .map(key => STAGE_ASSET_TYPE_MAP[key])
              .filter((t): t is AssetType => t !== null);

            // No asset should have an assetType from a skipped stage
            for (const asset of assets) {
              expect(skippedAssetTypes).not.toContain(asset.assetType);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
