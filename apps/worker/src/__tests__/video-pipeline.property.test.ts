/**
 * Property-based tests for the video generation pipeline.
 *
 * Property 23: Video fallback produces Storyboard and VideoBrief when generation unavailable
 * Property 24: Completed video asset has mp4 content type and valid storage path
 *
 * Validates: Requirements 27.3, 27.5
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  JobState,
  Job,
  AssetType,
  AssetReference,
  FallbackNotice,
  Platform,
  Tone,
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
  }

  function setupGenAIMocks() {
    mockGenerateContent.mockImplementation(async () => {
      return JSON.stringify({
        storyboard: {
          scenes: [
            { sceneNumber: 1, description: 'Opening', duration: '5s', motionStyle: 'steady', textOverlay: 'Welcome', cameraDirection: 'wide shot' },
            { sceneNumber: 2, description: 'Middle', duration: '5s', motionStyle: 'pan', textOverlay: 'Key point', cameraDirection: 'close-up' },
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
    jobStore, stateTransitions, writtenAssets,
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

import { GenerateVideo } from '../pipeline/generate-video';

// ── Test suite ──────────────────────────────────────────────────────

describe('Video Pipeline Property Tests', () => {
  beforeEach(() => {
    mocks.jobStore.clear();
    mocks.writtenAssets.clear();
    mocks.stateTransitions.length = 0;
    mocks.setupFirestoreMocks();
    mocks.setupStorageMocks();
    mocks.setupGenAIMocks();
    mocks.capabilityIsAvailable.mockResolvedValue(false);
    mocks.capabilityGenerate.mockResolvedValue({
      success: true, assets: [], metadata: {},
    });
  });

  // ── Property 23 ─────────────────────────────────────────────────────
  /**
   * Property 23: Video fallback produces Storyboard and VideoBrief when generation unavailable
   *
   * When video generation capability is unavailable, the stage must still:
   * - Persist a Storyboard JSON with valid scenes
   * - Persist a VideoBrief JSON with all required fields
   * - Record a FallbackNotice for video_generation
   * - Return success
   *
   * Validates: Requirements 27.5
   */
  describe('Property 23: Video fallback produces Storyboard and VideoBrief', () => {
    it('produces Storyboard + VideoBrief and records fallback when capability unavailable', () => {
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

            const stage = new GenerateVideo();
            const result = await stage.execute({
              jobId,
              correlationId: 'corr-test',
              uploadedMediaPaths: ['uploads/test.png'],
              workingData: {
                creativeBrief: {
                  targetAudience: 'Devs', tone,
                  keyMessages: ['Build'], visualDirection: 'Clean',
                  inputSummary: 'Test', platform,
                },
              },
            });

            expect(result.success).toBe(true);

            // Storyboard persisted
            const sbPath = result.assets.find((p) => p.includes('storyboard'));
            expect(sbPath).toBeDefined();
            const sbData = mocks.writtenAssets.get(sbPath!);
            const sb: Storyboard = JSON.parse(sbData!.toString('utf-8'));
            expect(sb.scenes.length).toBeGreaterThan(0);
            expect(typeof sb.totalDuration).toBe('string');

            // VideoBrief persisted
            const vbPath = result.assets.find((p) => p.includes('video-brief'));
            expect(vbPath).toBeDefined();
            const vb: VideoBrief = JSON.parse(mocks.writtenAssets.get(vbPath!)!.toString('utf-8'));
            expect(typeof vb.motionStyle).toBe('string');
            expect(typeof vb.energyDirection).toBe('string');

            // FallbackNotice recorded
            const finalJob = mocks.jobStore.get(jobId)!;
            const notice = finalJob.fallbackNotices.find(
              (n: FallbackNotice) => n.capability === 'video_generation',
            );
            expect(notice).toBeDefined();
            expect(notice!.reason).toBeTruthy();

            // No mp4 video assets
            const videoAssets = finalJob.assets.filter(
              (a: AssetReference) => a.storagePath.endsWith('.mp4'),
            );
            expect(videoAssets.length).toBe(0);
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  // ── Property 24 ─────────────────────────────────────────────────────
  /**
   * Property 24: Completed video asset has mp4 content type and valid storage path
   *
   * When video generation capability IS available and returns assets,
   * the persisted video must have a .mp4 storage path and be recorded
   * as an AssetReference with type Video.
   *
   * Validates: Requirements 27.3
   */
  describe('Property 24: Completed video asset has mp4 path and Video type', () => {
    it('persists mp4 video asset when capability is available', () => {
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
            mocks.capabilityIsAvailable.mockResolvedValue(true);
            // Return base64-encoded mock video data
            mocks.capabilityGenerate.mockResolvedValue({
              success: true,
              assets: [Buffer.from('fake-mp4-video-data').toString('base64')],
              metadata: {},
            });

            const job = createMockJob({ id: jobId, state: JobState.Queued });
            mocks.jobStore.set(jobId, job);

            const stage = new GenerateVideo();
            const result = await stage.execute({
              jobId,
              correlationId: 'corr-test',
              uploadedMediaPaths: ['uploads/test.png'],
              workingData: {
                creativeBrief: {
                  targetAudience: 'Devs', tone: Tone.Cinematic,
                  keyMessages: ['Build'], visualDirection: 'Clean',
                  inputSummary: 'Test', platform,
                },
              },
            });

            expect(result.success).toBe(true);

            // Should have storyboard + video-brief + at least one mp4
            const mp4Paths = result.assets.filter((p) => p.endsWith('.mp4'));
            expect(mp4Paths.length).toBeGreaterThan(0);

            for (const mp4Path of mp4Paths) {
              expect(mp4Path).toContain(`${jobId}/video/`);
              expect(mocks.writtenAssets.has(mp4Path)).toBe(true);
            }

            // AssetReference recorded with Video type
            const finalJob = mocks.jobStore.get(jobId)!;
            const videoRefs = finalJob.assets.filter(
              (a: AssetReference) => a.storagePath.endsWith('.mp4'),
            );
            expect(videoRefs.length).toBeGreaterThan(0);
            for (const ref of videoRefs) {
              expect(ref.assetType).toBe(AssetType.Video);
              expect(ref.status).toBe('completed');
              expect(ref.jobId).toBe(jobId);
            }
          },
        ),
        { numRuns: 50 },
      );
    });
  });
});
