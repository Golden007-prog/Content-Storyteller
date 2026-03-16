/**
 * Preservation Property Tests — Property 2d: Valid Job Processing Preservation
 *
 * For any Pub/Sub message referencing an existing Firestore job in queued state,
 * verify the worker calls runPipeline with the correct PipelineContext
 * (unchanged behavior).
 *
 * These tests encode EXISTING correct behavior that must be preserved
 * after the bugfix. They MUST PASS on unfixed code.
 *
 * **Validates: Requirements 3.1**
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import http from 'http';
import {
  JobState,
  Job,
  AssetReference,
  FallbackNotice,
} from '@content-storyteller/shared';

// ── Hoisted mocks ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const jobStore = new Map<string, Job>();
  const pipelineCalls: Array<{
    jobId: string;
    correlationId: string;
    uploadedMediaPaths: string[];
  }> = [];

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
      }
      return Promise.resolve();
    });
  }

  function setupStorageMocks() {
    mockFileSave.mockImplementation(() => Promise.resolve());
    mockFileDownload.mockImplementation(() =>
      Promise.resolve([Buffer.from('mock-media-data')]),
    );
  }

  function setupGenAIMocks() {
    mockGenerateContent.mockResolvedValue(
      JSON.stringify({
        targetAudience: 'General',
        tone: 'Professional',
        keyMessages: ['Key'],
        visualDirection: 'Clean',
        inputSummary: 'Test',
      }),
    );
  }

  return {
    jobStore,
    pipelineCalls,
    mockDocUpdate,
    mockDocGet,
    mockDoc,
    mockCollection,
    mockFileSave,
    mockFileDownload,
    mockBucketFile,
    mockBucket,
    mockGenerateContent,
    capabilityIsAvailable,
    capabilityGenerate,
    setupFirestoreMocks,
    setupStorageMocks,
    setupGenAIMocks,
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
  generateContentMultimodal: (...args: unknown[]) =>
    mocks.mockGenerateContent(...args),
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
    has: (name: string) =>
      name === 'image_generation' || name === 'video_generation',
    init: vi.fn(),
    all: vi.fn().mockReturnValue([]),
    register: vi.fn(),
  },
}));

// Mock runPipeline to capture calls without executing the real pipeline
vi.mock('../pipeline/pipeline-runner', () => ({
  runPipeline: vi.fn().mockImplementation(async (context: any) => {
    mocks.pipelineCalls.push({
      jobId: context.jobId,
      correlationId: context.correlationId,
      uploadedMediaPaths: context.uploadedMediaPaths,
    });
  }),
}));

// ── Import app after mocks ──────────────────────────────────────────

import { app } from '../index';

// ── Helpers ─────────────────────────────────────────────────────────

function sendPubsubMessage(
  server: http.Server,
  message: { jobId: string; idempotencyKey: string },
  correlationId = 'corr-preservation',
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
        hostname: '127.0.0.1',
        port: addr.port,
        path: '/',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(pubsubBody).toString(),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode!,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    req.on('error', reject);
    req.write(pubsubBody);
    req.end();
  });
}

// ── Test suite ──────────────────────────────────────────────────────

describe('Property 2d: Valid Job Processing Preservation', () => {
  let server: http.Server;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.jobStore.clear();
    mocks.pipelineCalls.length = 0;
    mocks.setupFirestoreMocks();
    mocks.setupStorageMocks();
    mocks.setupGenAIMocks();
    mocks.capabilityIsAvailable.mockResolvedValue(true);
    mocks.capabilityGenerate.mockResolvedValue({
      success: true,
      assets: ['generated-asset-data'],
      metadata: {},
    });

    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // Arbitrary for random job IDs
  const arbJobId = fc
    .stringMatching(/^[a-z0-9-]{8,20}$/)
    .filter((id) => id.length >= 8);

  // Arbitrary for random correlation IDs
  const arbCorrelationId = fc
    .stringMatching(/^[a-z0-9-]{6,16}$/)
    .filter((id) => id.length >= 6);

  // Arbitrary for uploaded media paths
  const arbMediaPaths = fc.array(
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-/._'.split('')), {
      minLength: 5,
      maxLength: 40,
    }),
    { minLength: 0, maxLength: 3 },
  );

  it('for any valid Pub/Sub message with existing queued job, worker calls runPipeline with correct context', async () => {
    const samples = fc.sample(
      fc.tuple(arbJobId, arbCorrelationId, arbMediaPaths),
      5,
    );

    for (const [jobId, correlationId, mediaPaths] of samples) {
      // Clear pipeline calls for this iteration
      mocks.pipelineCalls.length = 0;

      // Set up a queued job in the mock Firestore
      const idempotencyKey = `idem-${jobId}`;
      mocks.jobStore.set(jobId, {
        id: jobId,
        correlationId,
        idempotencyKey,
        state: JobState.Queued,
        uploadedMediaPaths: mediaPaths,
        assets: [],
        fallbackNotices: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Job);

      const res = await sendPubsubMessage(
        server,
        { jobId, idempotencyKey },
        correlationId,
      );

      // Should acknowledge with 204
      expect(res.status).toBe(204);

      // runPipeline should have been called exactly once
      expect(mocks.pipelineCalls.length).toBe(1);

      // Verify the PipelineContext passed to runPipeline
      const call = mocks.pipelineCalls[0];
      expect(call.jobId).toBe(jobId);
      expect(call.correlationId).toBe(correlationId);
      expect(call.uploadedMediaPaths).toEqual(mediaPaths);
    }
  });

  it('for a queued job, worker does NOT skip processing (idempotency check passes)', async () => {
    const jobId = 'valid-queued-job-001';
    const idempotencyKey = 'idem-valid-001';
    const correlationId = 'corr-valid-001';

    mocks.jobStore.set(jobId, {
      id: jobId,
      correlationId,
      idempotencyKey,
      state: JobState.Queued,
      uploadedMediaPaths: ['uploads/test.jpg'],
      assets: [],
      fallbackNotices: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Job);

    const res = await sendPubsubMessage(
      server,
      { jobId, idempotencyKey },
      correlationId,
    );

    expect(res.status).toBe(204);
    // Pipeline should be called — job is in queued state with matching idempotencyKey
    expect(mocks.pipelineCalls.length).toBe(1);
  });

  it('for a job already past queued state with same idempotencyKey, worker skips processing', async () => {
    const jobId = 'already-processed-001';
    const idempotencyKey = 'idem-processed-001';
    const correlationId = 'corr-processed-001';

    mocks.jobStore.set(jobId, {
      id: jobId,
      correlationId,
      idempotencyKey,
      state: JobState.Completed, // Already completed
      uploadedMediaPaths: [],
      assets: [],
      fallbackNotices: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Job);

    const res = await sendPubsubMessage(
      server,
      { jobId, idempotencyKey },
      correlationId,
    );

    expect(res.status).toBe(204);
    // Pipeline should NOT be called — idempotency check should skip
    expect(mocks.pipelineCalls.length).toBe(0);
  });
});
