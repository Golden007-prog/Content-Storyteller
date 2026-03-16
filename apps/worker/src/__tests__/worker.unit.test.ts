/**
 * Unit tests for the Worker service.
 *
 * Uses mocks/stubs for GCS, Firestore, Vertex AI, and capability registry
 * (same vi.hoisted pattern as worker.property.test.ts).
 *
 * Validates: Requirements 14.3, 14.4, 14.5, 18.1, 18.2, 18.3
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';
import {
  JobState,
  Job,
  AssetType,
  FallbackNotice,
  AssetReference,
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
    // Return context-appropriate responses based on the prompt content
    mockGenerateContent.mockImplementation(async (prompt: string) => {
      // If the prompt asks for image concepts, return an array
      if (prompt.includes('image concepts') || prompt.includes('image generation')) {
        return JSON.stringify([
          { conceptName: 'Concept 1', visualDirection: 'Modern', generationPrompt: 'Marketing visual 1', style: 'photorealistic' },
          { conceptName: 'Concept 2', visualDirection: 'Clean', generationPrompt: 'Marketing visual 2', style: 'flat illustration' },
          { conceptName: 'Concept 3', visualDirection: 'Bold', generationPrompt: 'Marketing visual 3', style: '3D render' },
        ]);
      }

      // If the prompt asks for a storyboard/video, return storyboard + videoBrief JSON
      if (prompt.includes('storyboard') || prompt.includes('Storyboard')) {
        return JSON.stringify({
          storyboard: { scenes: [{ sceneNumber: 1, description: 'Opening', duration: '5s', motionStyle: 'steady', textOverlay: 'Welcome', cameraDirection: 'wide shot' }], totalDuration: '25s', pacing: 'balanced' },
          videoBrief: { totalDuration: '25s', motionStyle: 'smooth', textOverlayStyle: 'bold sans-serif', cameraDirection: 'mixed angles', energyDirection: 'builds from calm to energetic' },
        });
      }

      // If the prompt asks for copy, return CopyPackage JSON
      if (prompt.includes('Copy Package') || prompt.includes('copywriter')) {
        return JSON.stringify({
          hook: 'Test Hook',
          caption: 'Test caption text',
          cta: 'Try now',
          hashtags: ['marketing', 'content'],
          threadCopy: ['Thread post 1'],
          voiceoverScript: 'Test voiceover script',
          onScreenText: ['Key message'],
        });
      }

      // Default: return a Creative Brief
      return JSON.stringify({
        targetAudience: 'General audience',
        tone: 'Professional',
        keyMessages: ['Key message'],
        visualDirection: 'Modern and clean',
        inputSummary: 'Analyzed uploaded files',
        campaignAngle: 'Engaging campaign',
        pacing: 'Balanced pacing',
        visualStyle: 'Modern aesthetic',
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

function sendPubsubMessage(
  server: http.Server,
  message: { jobId: string; idempotencyKey: string },
  correlationId = 'corr-unit',
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const pubsubBody = JSON.stringify({
      message: {
        data: Buffer.from(JSON.stringify(message)).toString('base64'),
        attributes: { correlationId },
      },
    });
    const req = http.request(
      {
        hostname: '127.0.0.1', port: addr.port, path: '/', method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(pubsubBody).toString() },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode!, body: Buffer.concat(chunks).toString() }));
      },
    );
    req.on('error', reject);
    req.write(pubsubBody);
    req.end();
  });
}

// ── Import modules under test (after mocks) ────────────────────────

import { runPipeline } from '../pipeline/pipeline-runner';
import { ProcessInput } from '../pipeline/process-input';
import { GenerateCopy } from '../pipeline/generate-copy';
import { GenerateImages } from '../pipeline/generate-images';
import { GenerateVideo } from '../pipeline/generate-video';
import { ComposePackage } from '../pipeline/compose-package';
import { app } from '../index';

// ── Test suite ──────────────────────────────────────────────────────

describe('Worker Service Unit Tests', () => {
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

  // ── Pipeline stage execution order (Req 14.4) ────────────────────

  describe('Pipeline stage execution order', () => {
    it('executes stages in correct sequential order for a successful pipeline', async () => {
      const jobId = 'order-test-job';
      const job = createMockJob({ id: jobId });
      mocks.jobStore.set(jobId, job);

      await runPipeline({
        jobId,
        correlationId: 'corr-order',
        uploadedMediaPaths: ['uploads/test.png'],
        workingData: {},
      });

      // Verify the state transitions follow the expected order
      const expectedOrder = [
        JobState.ProcessingInput,
        JobState.GeneratingCopy,
        JobState.GeneratingImages,
        JobState.GeneratingVideo,
        JobState.ComposingPackage,
        JobState.Completed,
      ];

      // Filter out duplicate consecutive states
      const deduped: JobState[] = [];
      for (const s of mocks.stateTransitions) {
        if (deduped.length === 0 || deduped[deduped.length - 1] !== s) {
          deduped.push(s);
        }
      }

      // Each expected state should appear in order
      let idx = 0;
      for (const expected of expectedOrder) {
        while (idx < deduped.length && deduped[idx] !== expected) idx++;
        expect(idx).toBeLessThan(deduped.length);
        idx++;
      }
    });

    it('pipeline stages have correct names and jobState values', () => {
      const stages = [
        new ProcessInput(),
        new GenerateCopy(),
        new GenerateImages(),
        new GenerateVideo(),
        new ComposePackage(),
      ];

      expect(stages[0].name).toBe('ProcessInput');
      expect(stages[0].jobState).toBe(JobState.ProcessingInput);
      expect(stages[1].name).toBe('GenerateCopy');
      expect(stages[1].jobState).toBe(JobState.GeneratingCopy);
      expect(stages[2].name).toBe('GenerateImages');
      expect(stages[2].jobState).toBe(JobState.GeneratingImages);
      expect(stages[3].name).toBe('GenerateVideo');
      expect(stages[3].jobState).toBe(JobState.GeneratingVideo);
      expect(stages[4].name).toBe('ComposePackage');
      expect(stages[4].jobState).toBe(JobState.ComposingPackage);
    });
  });

  // ── Individual stage output validation (Req 14.3, 14.4) ──────────

  describe('Individual stage output validation', () => {
    it('ProcessInput returns success with empty assets array', async () => {
      const jobId = 'pi-output-test';
      mocks.jobStore.set(jobId, createMockJob({ id: jobId }));

      const stage = new ProcessInput();
      const result = await stage.execute({
        jobId,
        correlationId: 'corr-pi',
        uploadedMediaPaths: ['uploads/test.png'],
        workingData: {},
      });

      expect(result.success).toBe(true);
      expect(result.assets).toEqual([]);
      expect(result.error).toBeUndefined();
    });

    it('GenerateCopy returns success with one asset path', async () => {
      const jobId = 'gc-output-test';
      mocks.jobStore.set(jobId, createMockJob({ id: jobId }));

      const stage = new GenerateCopy();
      const result = await stage.execute({
        jobId,
        correlationId: 'corr-gc',
        uploadedMediaPaths: ['uploads/test.png'],
        workingData: {
          creativeBrief: {
            targetAudience: 'Devs', tone: 'Technical',
            keyMessages: ['Build'], visualDirection: 'Clean',
            inputSummary: 'Test',
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.assets.length).toBe(1);
      expect(result.assets[0]).toContain(`${jobId}/copy/`);
      expect(result.error).toBeUndefined();
    });

    it('GenerateImages returns success with assets when capability available', async () => {
      const jobId = 'gi-output-test';
      mocks.jobStore.set(jobId, createMockJob({ id: jobId }));

      const stage = new GenerateImages();
      const result = await stage.execute({
        jobId,
        correlationId: 'corr-gi',
        uploadedMediaPaths: ['uploads/test.png'],
        workingData: {
          creativeBrief: {
            targetAudience: 'Devs', tone: 'Technical',
            keyMessages: ['Build'], visualDirection: 'Clean',
            inputSummary: 'Test',
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('ComposePackage returns success with bundle path', async () => {
      const jobId = 'cp-output-test';
      mocks.jobStore.set(jobId, createMockJob({ id: jobId }));

      const stage = new ComposePackage();
      const result = await stage.execute({
        jobId,
        correlationId: 'corr-cp',
        uploadedMediaPaths: ['uploads/test.png'],
        workingData: {
          creativeBrief: {
            targetAudience: 'Devs', tone: 'Technical',
            keyMessages: ['Build'], visualDirection: 'Clean',
            inputSummary: 'Test',
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.assets.length).toBe(1);
      expect(result.assets[0]).toContain(`${jobId}/bundle/`);
    });
  });

  // ── Error handling (Req 14.5) ─────────────────────────────────────

  describe('Error handling for failure modes', () => {
    let server: http.Server;

    beforeEach(async () => {
      server = await new Promise<http.Server>((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
      });
    });

    afterEach(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('handles missing jobId in Pub/Sub message gracefully (ack 204)', async () => {
      const pubsubBody = JSON.stringify({
        message: {
          data: Buffer.from(JSON.stringify({ idempotencyKey: 'key-1' })).toString('base64'),
          attributes: { correlationId: 'corr-missing-job' },
        },
      });

      const res = await new Promise<{ status: number }>((resolve, reject) => {
        const addr = server.address() as { port: number };
        const req = http.request(
          {
            hostname: '127.0.0.1', port: addr.port, path: '/', method: 'POST',
            headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(pubsubBody).toString() },
          },
          (res) => { res.on('data', () => {}); res.on('end', () => resolve({ status: res.statusCode! })); },
        );
        req.on('error', reject);
        req.write(pubsubBody);
        req.end();
      });

      expect(res.status).toBe(204);
      // No state transitions should have occurred
      expect(mocks.stateTransitions.length).toBe(0);
    });

    it('handles job not found in Firestore (ack 204)', async () => {
      const res = await sendPubsubMessage(server, {
        jobId: 'nonexistent-job-id',
        idempotencyKey: 'key-notfound',
      });

      expect(res.status).toBe(204);
      expect(mocks.stateTransitions.length).toBe(0);
    });

    it('handles duplicate idempotency key (ack 204, no reprocessing)', async () => {
      const jobId = 'dup-idem-job';
      const idempotencyKey = 'dup-key-123';
      mocks.jobStore.set(jobId, createMockJob({
        id: jobId,
        idempotencyKey,
        state: JobState.Completed,
        assets: [{
          assetId: 'existing', jobId,
          assetType: AssetType.Copy,
          storagePath: `${jobId}/copy/existing.json`,
          generationTimestamp: new Date(), status: 'completed',
        }],
      }));

      const res = await sendPubsubMessage(server, { jobId, idempotencyKey });

      expect(res.status).toBe(204);
      expect(mocks.stateTransitions.length).toBe(0);
      // Job should remain unchanged
      const job = mocks.jobStore.get(jobId)!;
      expect(job.state).toBe(JobState.Completed);
      expect(job.assets.length).toBe(1);
    });

    it('handles malformed Pub/Sub message data (ack 204)', async () => {
      const pubsubBody = JSON.stringify({
        message: {
          data: Buffer.from('not-valid-json!!!').toString('base64'),
          attributes: { correlationId: 'corr-malformed' },
        },
      });

      const res = await new Promise<{ status: number }>((resolve, reject) => {
        const addr = server.address() as { port: number };
        const req = http.request(
          {
            hostname: '127.0.0.1', port: addr.port, path: '/', method: 'POST',
            headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(pubsubBody).toString() },
          },
          (res) => { res.on('data', () => {}); res.on('end', () => resolve({ status: res.statusCode! })); },
        );
        req.on('error', reject);
        req.write(pubsubBody);
        req.end();
      });

      expect(res.status).toBe(204);
      expect(mocks.stateTransitions.length).toBe(0);
    });

    it('handles missing Pub/Sub message entirely (ack 204)', async () => {
      const pubsubBody = JSON.stringify({});

      const res = await new Promise<{ status: number }>((resolve, reject) => {
        const addr = server.address() as { port: number };
        const req = http.request(
          {
            hostname: '127.0.0.1', port: addr.port, path: '/', method: 'POST',
            headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(pubsubBody).toString() },
          },
          (res) => { res.on('data', () => {}); res.on('end', () => resolve({ status: res.statusCode! })); },
        );
        req.on('error', reject);
        req.write(pubsubBody);
        req.end();
      });

      expect(res.status).toBe(204);
    });

    it('pipeline failure marks job as failed with error message', async () => {
      const jobId = 'fail-pipeline-job';
      mocks.jobStore.set(jobId, createMockJob({ id: jobId }));

      // Make generateContent fail to cause ProcessInput to fail
      mocks.mockGenerateContent.mockRejectedValue(new Error('GenAI API error'));

      try {
        await runPipeline({
          jobId,
          correlationId: 'corr-fail',
          uploadedMediaPaths: ['uploads/test.png'],
          workingData: {},
        });
      } catch {
        // Expected
      }

      const finalJob = mocks.jobStore.get(jobId)!;
      expect(finalJob.state).toBe(JobState.Failed);
      expect(finalJob.errorMessage).toBeTruthy();
      expect(finalJob.errorMessage!.length).toBeGreaterThan(0);
    });

    it('no subsequent stages run after a failure', async () => {
      const jobId = 'no-subsequent-job';
      mocks.jobStore.set(jobId, createMockJob({ id: jobId }));

      mocks.mockGenerateContent.mockRejectedValue(new Error('Stage 1 failure'));

      try {
        await runPipeline({
          jobId,
          correlationId: 'corr-nosub',
          uploadedMediaPaths: ['uploads/test.png'],
          workingData: {},
        });
      } catch {
        // Expected
      }

      // ProcessingInput should appear before Failed; no stages after Failed
      const nonFailed = mocks.stateTransitions.filter(s => s !== JobState.Failed);
      expect(nonFailed.length).toBeGreaterThanOrEqual(1);
      expect(nonFailed[0]).toBe(JobState.ProcessingInput);
      // No stages should appear after the last Failed transition
      const lastFailedIdx = mocks.stateTransitions.lastIndexOf(JobState.Failed);
      if (lastFailedIdx >= 0) {
        const afterFailed = mocks.stateTransitions.slice(lastFailedIdx + 1)
          .filter(s => s !== JobState.Failed);
        expect(afterFailed.length).toBe(0);
      }
    });
  });

  // ── Capability detection (Req 18.1) ───────────────────────────────

  describe('Capability detection returns correct availability status', () => {
    it('GenerateImages checks isAvailable before calling generate', async () => {
      const jobId = 'cap-check-img';
      mocks.jobStore.set(jobId, createMockJob({ id: jobId }));

      const callOrder: string[] = [];
      mocks.capabilityIsAvailable.mockImplementation(async () => {
        callOrder.push('isAvailable');
        return true;
      });
      mocks.capabilityGenerate.mockImplementation(async () => {
        callOrder.push('generate');
        return { success: true, assets: ['asset'], metadata: {} };
      });

      const stage = new GenerateImages();
      await stage.execute({
        jobId,
        correlationId: 'corr-cap',
        uploadedMediaPaths: ['uploads/test.png'],
        workingData: {
          creativeBrief: {
            targetAudience: 'Devs', tone: 'Technical',
            keyMessages: ['Build'], visualDirection: 'Clean',
            inputSummary: 'Test',
          },
        },
      });

      // isAvailable must have been called
      expect(callOrder).toContain('isAvailable');
      // If generate was called, isAvailable must have been called first
      if (callOrder.includes('generate')) {
        expect(callOrder.indexOf('isAvailable')).toBeLessThan(callOrder.indexOf('generate'));
      }
    });

    it('GenerateVideo checks isAvailable before calling generate', async () => {
      const jobId = 'cap-check-vid';
      mocks.jobStore.set(jobId, createMockJob({ id: jobId }));

      const callOrder: string[] = [];
      mocks.capabilityIsAvailable.mockImplementation(async () => {
        callOrder.push('isAvailable');
        return true;
      });
      mocks.capabilityGenerate.mockImplementation(async () => {
        callOrder.push('generate');
        return { success: true, assets: ['asset'], metadata: {} };
      });

      const stage = new GenerateVideo();
      await stage.execute({
        jobId,
        correlationId: 'corr-cap-vid',
        uploadedMediaPaths: ['uploads/test.png'],
        workingData: {
          creativeBrief: {
            targetAudience: 'Devs', tone: 'Technical',
            keyMessages: ['Build'], visualDirection: 'Clean',
            inputSummary: 'Test',
          },
        },
      });

      expect(callOrder.indexOf('isAvailable')).toBeLessThan(callOrder.indexOf('generate'));
    });

    it('GenerateImages skips generation when capability unavailable', async () => {
      const jobId = 'cap-unavail-img';
      mocks.jobStore.set(jobId, createMockJob({ id: jobId }));
      mocks.capabilityIsAvailable.mockResolvedValue(false);
      mocks.capabilityGenerate.mockClear();

      const stage = new GenerateImages();
      const result = await stage.execute({
        jobId,
        correlationId: 'corr-unavail',
        uploadedMediaPaths: ['uploads/test.png'],
        workingData: {
          creativeBrief: {
            targetAudience: 'Devs', tone: 'Technical',
            keyMessages: ['Build'], visualDirection: 'Clean',
            inputSummary: 'Test',
          },
        },
      });

      expect(result.success).toBe(true);
      expect(mocks.capabilityGenerate).not.toHaveBeenCalled();
    });

    it('GenerateVideo skips generation when capability unavailable', async () => {
      const jobId = 'cap-unavail-vid';
      mocks.jobStore.set(jobId, createMockJob({ id: jobId }));
      mocks.capabilityIsAvailable.mockResolvedValue(false);
      mocks.capabilityGenerate.mockClear();

      const stage = new GenerateVideo();
      const result = await stage.execute({
        jobId,
        correlationId: 'corr-unavail-vid',
        uploadedMediaPaths: ['uploads/test.png'],
        workingData: {
          creativeBrief: {
            targetAudience: 'Devs', tone: 'Technical',
            keyMessages: ['Build'], visualDirection: 'Clean',
            inputSummary: 'Test',
          },
        },
      });

      expect(result.success).toBe(true);
      expect(mocks.capabilityGenerate).not.toHaveBeenCalled();
    });
  });

  // ── Fallback notice creation (Req 18.2, 18.3) ────────────────────

  describe('Fallback notice creation', () => {
    it('records FallbackNotice for unavailable image generation', async () => {
      const jobId = 'fb-img-job';
      mocks.jobStore.set(jobId, createMockJob({ id: jobId }));
      mocks.capabilityIsAvailable.mockResolvedValue(false);

      const stage = new GenerateImages();
      await stage.execute({
        jobId,
        correlationId: 'corr-fb-img',
        uploadedMediaPaths: ['uploads/test.png'],
        workingData: {
          creativeBrief: {
            targetAudience: 'Devs', tone: 'Technical',
            keyMessages: ['Build'], visualDirection: 'Clean',
            inputSummary: 'Test',
          },
        },
      });

      const finalJob = mocks.jobStore.get(jobId)!;
      expect(finalJob.fallbackNotices.length).toBeGreaterThan(0);
      const notice = finalJob.fallbackNotices.find(
        (n: FallbackNotice) => n.capability === 'image_generation',
      );
      expect(notice).toBeDefined();
      expect(notice!.reason).toBeTruthy();
      expect(notice!.stage).toBe(JobState.GeneratingImages);
      expect(notice!.timestamp).toBeDefined();
    });

    it('records FallbackNotice for unavailable video generation', async () => {
      const jobId = 'fb-vid-job';
      mocks.jobStore.set(jobId, createMockJob({ id: jobId }));
      mocks.capabilityIsAvailable.mockResolvedValue(false);

      const stage = new GenerateVideo();
      await stage.execute({
        jobId,
        correlationId: 'corr-fb-vid',
        uploadedMediaPaths: ['uploads/test.png'],
        workingData: {
          creativeBrief: {
            targetAudience: 'Devs', tone: 'Technical',
            keyMessages: ['Build'], visualDirection: 'Clean',
            inputSummary: 'Test',
          },
        },
      });

      const finalJob = mocks.jobStore.get(jobId)!;
      expect(finalJob.fallbackNotices.length).toBeGreaterThan(0);
      const notice = finalJob.fallbackNotices.find(
        (n: FallbackNotice) => n.capability === 'video_generation',
      );
      expect(notice).toBeDefined();
      expect(notice!.reason).toBeTruthy();
      expect(notice!.stage).toBe(JobState.GeneratingVideo);
    });

    it('no image assets produced when image generation unavailable (except concepts)', async () => {
      const jobId = 'no-img-assets';
      mocks.jobStore.set(jobId, createMockJob({ id: jobId }));
      mocks.capabilityIsAvailable.mockResolvedValue(false);

      const stage = new GenerateImages();
      const result = await stage.execute({
        jobId,
        correlationId: 'corr-no-img',
        uploadedMediaPaths: ['uploads/test.png'],
        workingData: {
          creativeBrief: {
            targetAudience: 'Devs', tone: 'Technical',
            keyMessages: ['Build'], visualDirection: 'Clean',
            inputSummary: 'Test',
          },
        },
      });

      // ImageConcepts JSON is always persisted as an asset
      expect(result.assets.length).toBe(1);
      expect(result.assets[0]).toContain('image-concepts');
      // No actual generated image assets beyond the concepts JSON
      const finalJob = mocks.jobStore.get(jobId)!;
      const imageAssets = finalJob.assets.filter(
        (a: AssetReference) => a.assetType === AssetType.ImageConcept,
      );
      // Only the concepts JSON asset, no generated images
      expect(imageAssets.length).toBe(1);
      expect(imageAssets[0].storagePath).toContain('image-concepts');
    });

    it('no video assets produced when video generation unavailable (except storyboard/brief)', async () => {
      const jobId = 'no-vid-assets';
      mocks.jobStore.set(jobId, createMockJob({ id: jobId }));
      mocks.capabilityIsAvailable.mockResolvedValue(false);

      const stage = new GenerateVideo();
      const result = await stage.execute({
        jobId,
        correlationId: 'corr-no-vid',
        uploadedMediaPaths: ['uploads/test.png'],
        workingData: {
          creativeBrief: {
            targetAudience: 'Devs', tone: 'Technical',
            keyMessages: ['Build'], visualDirection: 'Clean',
            inputSummary: 'Test',
          },
        },
      });

      expect(result.success).toBe(true);
      // Storyboard + VideoBrief are always persisted
      expect(result.assets.length).toBe(2);
      const finalJob = mocks.jobStore.get(jobId)!;
      const videoAssets = finalJob.assets.filter(
        (a: AssetReference) => a.assetType === AssetType.VideoBriefMeta,
      );
      // Only the VideoBrief JSON, no actual generated video
      expect(videoAssets.length).toBe(1);
      expect(videoAssets[0].storagePath).toContain('video-brief');
    });
  });
});
