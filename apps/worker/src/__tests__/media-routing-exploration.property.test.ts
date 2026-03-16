/**
 * Bug Condition Exploration Property Tests — Worker Error Level (Defect 1)
 *
 * Property 1: Bug Condition — Worker Error Level
 *
 * When the worker receives a Pub/Sub message referencing a job ID that does
 * not exist in Firestore, it currently logs at ERROR level. The expected
 * behavior is to log at WARN level since missing jobs are an expected
 * condition (stale/test messages).
 *
 * These tests encode the EXPECTED (correct) behavior.
 * They are EXPECTED TO FAIL on unfixed code, confirming the bug exists.
 *
 * **Validates: Requirements 1.1**
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
  const stateTransitions: JobState[] = [];
  const writtenAssets = new Map<string, Buffer>();
  const logEntries: Array<{ severity: string; message: string; context?: Record<string, unknown> }> = [];

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
    mockGenerateContent.mockResolvedValue(JSON.stringify({
      targetAudience: 'General',
      tone: 'Professional',
      keyMessages: ['Key'],
      visualDirection: 'Clean',
      inputSummary: 'Test',
    }));
  }

  return {
    jobStore, stateTransitions, writtenAssets, logEntries,
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

// Spy on the logger module to capture log calls
vi.mock('../middleware/logger', async (importOriginal) => {
  const original = await importOriginal<typeof import('../middleware/logger')>();

  // Wrap createLogger to intercept log calls
  const createLogger = (correlationId?: string, jobId?: string) => {
    const realLogger = original.createLogger(correlationId, jobId);
    return {
      info(message: string, context?: Record<string, unknown>) {
        mocks.logEntries.push({ severity: 'INFO', message, context });
        realLogger.info(message, context);
      },
      warn(message: string, context?: Record<string, unknown>) {
        mocks.logEntries.push({ severity: 'WARNING', message, context });
        realLogger.warn(message, context);
      },
      error(message: string, context?: Record<string, unknown>) {
        mocks.logEntries.push({ severity: 'ERROR', message, context });
        realLogger.error(message, context);
      },
    };
  };

  return {
    ...original,
    createLogger,
    logger: createLogger(),
  };
});

// ── Import app after mocks ──────────────────────────────────────────

import { app } from '../index';

// ── Helpers ─────────────────────────────────────────────────────────

function sendPubsubMessage(
  server: http.Server,
  message: { jobId: string; idempotencyKey: string },
  correlationId = 'corr-exploration',
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

// ── Test suite ──────────────────────────────────────────────────────

describe('Test 1d (PBT): Worker logs at WARN (not ERROR) for missing-job Pub/Sub messages', () => {
  let server: http.Server;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.jobStore.clear();
    mocks.writtenAssets.clear();
    mocks.stateTransitions.length = 0;
    mocks.logEntries.length = 0;
    mocks.setupFirestoreMocks();
    mocks.setupStorageMocks();
    mocks.setupGenAIMocks();
    mocks.capabilityIsAvailable.mockResolvedValue(true);
    mocks.capabilityGenerate.mockResolvedValue({
      success: true, assets: ['generated-asset-data'], metadata: {},
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

  // Arbitrary for random non-existent job IDs
  const nonExistentJobIdArb = fc.stringMatching(/^[a-z0-9-]{8,24}$/).filter(
    (id) => id.length >= 8,
  );

  it('for any non-existent jobId, worker logs at WARN level (not ERROR)', async () => {
    const jobIds = fc.sample(nonExistentJobIdArb, 5);

    for (const jobId of jobIds) {
      // Clear log entries for this iteration
      mocks.logEntries.length = 0;

      // Ensure job does NOT exist in Firestore
      mocks.jobStore.delete(jobId);

      const res = await sendPubsubMessage(server, {
        jobId,
        idempotencyKey: `idem-${jobId}`,
      });

      // Should acknowledge with 204
      expect(res.status).toBe(204);

      // Find the "Job not found" log entry
      const notFoundLog = mocks.logEntries.find(
        (entry) => entry.message.includes('Job not found'),
      );

      // EXPECTED (correct) behavior: log at WARNING level, not ERROR
      // WILL FAIL: current code uses jobLogger.error('Job not found in Firestore')
      expect(notFoundLog).toBeDefined();
      expect(notFoundLog!.severity).toBe('WARNING');
    }
  });
});
