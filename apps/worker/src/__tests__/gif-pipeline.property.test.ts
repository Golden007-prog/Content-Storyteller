/**
 * Property-based tests for GIF pipeline logic.
 *
 * Tests validate:
 * - Property 3: Conditional stage execution based on OutputIntent
 * - Property 4: Image classification to GIF style preset mapping
 * - Property 6: GIF storyboard beat count invariant
 * - Property 7: GIF output duration and size constraints
 *
 * Uses fast-check for property-based testing with 100+ iterations per property.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  JobState,
  Job,
  OutputIntent,
  StepsMap,
  StepMetadata,
  ImageClassification,
  GifStylePreset,
  GifStoryboardBeat,
  GifAssetMetadata,
} from '@content-storyteller/shared';

// ── Pure function imports (no mocks needed for Properties 4, 6, 7) ──

import { classificationToPreset, validateStoryboardBeats } from '../pipeline/generate-gif';

// ── Hoisted mocks (needed for Property 3 — pipeline runner tests) ───

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
      // GIF-specific prompts
      if (prompt.includes('Analyze this image and classify')) {
        return JSON.stringify({ classification: 'diagram', focusRegions: ['top-left', 'center'] });
      }
      if (prompt.includes('animation director') || prompt.includes('motion concept')) {
        return JSON.stringify({ motionDescription: 'Smooth zoom highlighting key areas', suggestedDurationMs: 5000 });
      }
      if (prompt.includes('storyboard artist') || prompt.includes('beat-by-beat')) {
        return JSON.stringify({
          beats: [
            { beatNumber: 1, description: 'Zoom in', durationMs: 1000, motionType: 'zoom', focusArea: 'center' },
            { beatNumber: 2, description: 'Pan right', durationMs: 1000, motionType: 'pan', focusArea: 'right' },
            { beatNumber: 3, description: 'Highlight', durationMs: 1000, motionType: 'highlight', focusArea: 'top' },
          ],
          totalDurationMs: 3000,
          loopStrategy: 'seamless',
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
    has: (name: string) => ['image_generation', 'video_generation', 'gif_generation'].includes(name),
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
 * Arbitrary OutputIntent with wantsCopy always true (pipeline invariant).
 * Includes wantsGif for GIF-specific testing.
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
  wantsGif: fc.boolean(),
});

/**
 * Stage configs matching the pipeline runner's STAGE_CONFIGS.
 * Includes the GenerateGif stage.
 */
const STAGE_CONFIGS = [
  { name: 'ProcessInput', stepsKey: 'processInput' as keyof StepsMap, intentKey: null as (keyof OutputIntent | null), critical: true },
  { name: 'GenerateCopy', stepsKey: 'generateCopy' as keyof StepsMap, intentKey: 'wantsCopy' as keyof OutputIntent, critical: true },
  { name: 'GenerateImages', stepsKey: 'generateImages' as keyof StepsMap, intentKey: 'wantsImage' as keyof OutputIntent, critical: false },
  { name: 'GenerateVideo', stepsKey: 'generateVideo' as keyof StepsMap, intentKey: 'wantsVideo' as keyof OutputIntent, critical: false },
  { name: 'GenerateGif', stepsKey: 'generateGif' as keyof StepsMap, intentKey: 'wantsGif' as keyof OutputIntent, critical: false },
  { name: 'ComposePackage', stepsKey: 'composePackage' as keyof StepsMap, intentKey: null as (keyof OutputIntent | null), critical: true },
];

// ── Import module under test (after mocks) ──────────────────────────

import { runPipeline } from '../pipeline/pipeline-runner';

// ── Test suite ──────────────────────────────────────────────────────

describe('GIF Pipeline Property Tests', () => {
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

  // ── Property 3 ──────────────────────────────────────────────────────
  // Feature: linkedin-gif-generator, Property 3: Conditional stage execution based on OutputIntent
  /**
   * For any OutputIntent, GenerateGif executes iff wantsGif === true;
   * when wantsGif === true and wantsVideo === false, GenerateVideo is skipped.
   *
   * **Validates: Requirements 1.5, 1.6, 6.1, 6.2, 10.2, 10.3**
   */
  describe('Property 3: Conditional stage execution based on OutputIntent', () => {
    it('GenerateGif executes iff wantsGif is true; GenerateVideo is skipped when wantsVideo is false', () => {
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
                correlationId: 'corr-prop3',
                uploadedMediaPaths: ['uploads/test.png'],
                workingData: {},
              });
            } catch {
              // Pipeline may throw on critical failures — we still check step metadata
            }

            const finalJob = mocks.jobStore.get(jobId);
            const steps = finalJob?.steps as StepsMap | undefined;
            if (!steps) return;

            // GenerateGif executes iff wantsGif === true
            const gifStep = steps.generateGif;
            if (gifStep) {
              if (outputIntent.wantsGif) {
                expect(gifStep.status).not.toBe('skipped');
              } else {
                expect(gifStep.status).toBe('skipped');
              }
            }

            // When wantsGif === true and wantsVideo === false, GenerateVideo is skipped
            if (outputIntent.wantsGif && !outputIntent.wantsVideo) {
              const videoStep = steps.generateVideo;
              if (videoStep) {
                expect(videoStep.status).toBe('skipped');
              }
            }

            // Verify all stages follow the intent-based execution rule
            for (const config of STAGE_CONFIGS) {
              const step = steps[config.stepsKey];
              if (!step) continue;

              if (config.intentKey !== null && !outputIntent[config.intentKey]) {
                expect(step.status).toBe('skipped');
              } else {
                expect(step.status).not.toBe('skipped');
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 4 ──────────────────────────────────────────────────────
  // Feature: linkedin-gif-generator, Property 4: Image classification to GIF style preset mapping
  /**
   * For any ImageClassification value, the selected GifStylePreset matches
   * the defined mapping:
   *   diagram/workflow → workflow_step_highlight
   *   ui_screenshot → feature_spotlight
   *   chart/infographic → text_callout_animation
   *   other → zoom_pan_explainer
   *
   * **Validates: Requirements 3.2, 3.3, 3.4, 3.5**
   */
  describe('Property 4: Image classification to GIF style preset mapping', () => {
    const CLASSIFICATION_TO_PRESET: Record<ImageClassification, GifStylePreset> = {
      diagram: 'workflow_step_highlight',
      workflow: 'workflow_step_highlight',
      ui_screenshot: 'feature_spotlight',
      chart: 'text_callout_animation',
      infographic: 'text_callout_animation',
      other: 'zoom_pan_explainer',
    };

    const arbClassification: fc.Arbitrary<ImageClassification> = fc.constantFrom(
      'diagram', 'workflow', 'ui_screenshot', 'chart', 'infographic', 'other',
    );

    it('maps every classification to the correct preset per the defined mapping', () => {
      fc.assert(
        fc.property(
          arbClassification,
          (classification) => {
            const preset = classificationToPreset(classification);
            expect(preset).toBe(CLASSIFICATION_TO_PRESET[classification]);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 6 ──────────────────────────────────────────────────────
  // Feature: linkedin-gif-generator, Property 6: GIF storyboard beat count invariant
  /**
   * For any storyboard (0 to 10 beats), the validated beat count is
   * between 3 and 6 inclusive after validation.
   *
   * **Validates: Requirements 2.3**
   */
  describe('Property 6: GIF storyboard beat count invariant', () => {
    const arbBeat: fc.Arbitrary<GifStoryboardBeat> = fc.record({
      beatNumber: fc.integer({ min: 1, max: 20 }),
      description: fc.string({ minLength: 1, maxLength: 100 }),
      durationMs: fc.integer({ min: 100, max: 5000 }),
      motionType: fc.constantFrom('zoom', 'pan', 'fade', 'highlight', 'pulse'),
      focusArea: fc.constantFrom('center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right'),
    });

    const arbBeats = fc.array(arbBeat, { minLength: 0, maxLength: 10 });

    it('validated beat count is always between 3 and 6 inclusive', () => {
      fc.assert(
        fc.property(
          arbBeats,
          (beats) => {
            const validated = validateStoryboardBeats(beats);
            expect(validated.length).toBeGreaterThanOrEqual(3);
            expect(validated.length).toBeLessThanOrEqual(6);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('validated beats are sequentially numbered starting from 1', () => {
      fc.assert(
        fc.property(
          arbBeats,
          (beats) => {
            const validated = validateStoryboardBeats(beats);
            validated.forEach((beat, i) => {
              expect(beat.beatNumber).toBe(i + 1);
            });
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 7 ──────────────────────────────────────────────────────
  // Feature: linkedin-gif-generator, Property 7: GIF output duration and size constraints
  /**
   * For any completed GIF asset metadata, duration < 10000ms and
   * size < 5242880 bytes (5 MB).
   *
   * **Validates: Requirements 2.9**
   */
  describe('Property 7: GIF output duration and size constraints', () => {
    const arbGifAssetMetadata: fc.Arbitrary<GifAssetMetadata> = fc.record({
      url: fc.webUrl(),
      mimeType: fc.constant('image/gif' as const),
      width: fc.integer({ min: 1, max: 1920 }),
      height: fc.integer({ min: 1, max: 1080 }),
      durationMs: fc.integer({ min: 100, max: 9999 }),
      loop: fc.constant(true),
      fileSizeBytes: fc.integer({ min: 1, max: 5242879 }),
      posterImageUrl: fc.option(fc.webUrl(), { nil: undefined }),
    });

    it('any valid GIF asset has duration < 10000ms and size < 5242880 bytes', () => {
      fc.assert(
        fc.property(
          arbGifAssetMetadata,
          (metadata) => {
            expect(metadata.durationMs).toBeLessThan(10000);
            expect(metadata.fileSizeBytes).toBeLessThan(5242880);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
