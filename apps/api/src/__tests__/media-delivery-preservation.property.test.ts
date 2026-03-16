/**
 * Preservation Property Tests — Media Delivery & Video Hang
 *
 * Property 2a: Assets Endpoint Preservation
 * Property 2b: SSE Metadata Preservation
 * Property 2f: PubSub Delivery Preservation
 *
 * These tests encode EXISTING correct behavior that must be preserved
 * after the bugfix. They MUST PASS on unfixed code.
 *
 * **Validates: Requirements 3.1, 3.5, 3.7, 3.8, 3.9**
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import http from 'http';
import { JobState, AssetType } from '@content-storyteller/shared';
import type { AssetReference, Job, OutputIntent, StepsMap, JobWarning } from '@content-storyteller/shared';

// ── Hoisted mocks ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  let docIdCounter = 0;
  const resetDocIdCounter = () => { docIdCounter = 0; };

  const mockFileSave = vi.fn().mockResolvedValue(undefined);
  const mockFileDownload = vi.fn().mockResolvedValue([Buffer.from('{}')]);
  const mockFileGetSignedUrl = vi.fn().mockResolvedValue(['https://signed-url.example.com/file']);
  const mockBucketFile = vi.fn().mockReturnValue({
    save: mockFileSave,
    download: mockFileDownload,
    getSignedUrl: mockFileGetSignedUrl,
  });
  const mockBucket = vi.fn().mockReturnValue({ file: mockBucketFile });

  const mockDocSet = vi.fn().mockResolvedValue(undefined);
  const mockDocGet = vi.fn().mockResolvedValue({ exists: true, data: () => ({}) });
  const mockDocUpdate = vi.fn().mockResolvedValue(undefined);
  const mockDoc = vi.fn().mockImplementation((id?: string) => ({
    id: id || `mock-doc-${++docIdCounter}`,
    set: mockDocSet,
    get: mockDocGet,
    update: mockDocUpdate,
  }));
  const mockCollection = vi.fn().mockReturnValue({ doc: mockDoc });

  const mockPublishMessage = vi.fn().mockResolvedValue('mock-message-id');
  const mockTopic = vi.fn().mockReturnValue({ publishMessage: mockPublishMessage });

  return {
    mockFileSave, mockFileDownload, mockFileGetSignedUrl, mockBucketFile, mockBucket,
    mockDocSet, mockDocGet, mockDocUpdate, mockDoc, mockCollection,
    mockPublishMessage, mockTopic,
    resetDocIdCounter,
  };
});

// ── Mock GCP services ───────────────────────────────────────────────

vi.mock('@google-cloud/storage', () => ({
  Storage: vi.fn().mockImplementation(() => ({ bucket: mocks.mockBucket })),
}));

vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => ({
    collection: mocks.mockCollection,
  })),
}));

vi.mock('@google-cloud/pubsub', () => ({
  PubSub: vi.fn().mockImplementation(() => ({ topic: mocks.mockTopic })),
}));

import { app } from '../index';

// ── Arbitraries ─────────────────────────────────────────────────────

const assetTypeArb = fc.constantFrom(
  AssetType.Copy,
  AssetType.Image,
  AssetType.Video,
  AssetType.Storyboard,
  AssetType.VoiceoverScript,
  AssetType.Gif,
);

const storagePathArb = fc.tuple(
  fc.uuid(),
  fc.constantFrom('images', 'video', 'copy', 'storyboard', 'video-brief', 'gif'),
  fc.uuid(),
  fc.constantFrom('.json', '.png', '.mp4', '.gif'),
).map(([jobId, folder, fileId, ext]) => `${jobId}/${folder}/${fileId}${ext}`);

const assetReferenceArb: fc.Arbitrary<AssetReference> = fc.record({
  assetId: fc.uuid(),
  jobId: fc.uuid(),
  assetType: assetTypeArb,
  storagePath: storagePathArb,
  generationTimestamp: fc.date(),
  status: fc.constant('completed' as const),
});

const assetArrayArb = fc.array(assetReferenceArb, { minLength: 1, maxLength: 5 });

// ── Helpers ─────────────────────────────────────────────────────────

function makeRequest(
  server: http.Server,
  method: string,
  path: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path,
        method,
        headers: { Accept: 'application/json' },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString());
            resolve({ status: res.statusCode!, body });
          } catch {
            resolve({ status: res.statusCode!, body: {} });
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/** Collect SSE events from the stream endpoint */
function collectSSEEvents(
  server: http.Server,
  jobId: string,
  maxEvents: number = 10,
  timeoutMs: number = 5000,
): Promise<Array<{ event: string; data: Record<string, unknown> }>> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const events: Array<{ event: string; data: Record<string, unknown> }> = [];
    let buffer = '';
    let currentEvent = '';

    const timer = setTimeout(() => {
      req.destroy();
      resolve(events);
    }, timeoutMs);

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path: `/api/v1/jobs/${jobId}/stream`,
        method: 'GET',
        headers: { Accept: 'text/event-stream' },
      },
      (res) => {
        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                events.push({ event: currentEvent, data });
              } catch {
                // skip malformed data
              }
            }
          }

          if (events.length >= maxEvents) {
            clearTimeout(timer);
            req.destroy();
            resolve(events);
          }
        });

        res.on('end', () => {
          clearTimeout(timer);
          resolve(events);
        });
      },
    );

    req.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ECONNRESET') {
        resolve(events);
      } else {
        clearTimeout(timer);
        reject(err);
      }
    });

    req.end();
  });
}

// ── Test 2a: Assets Endpoint Preservation ───────────────────────────

describe('Property 2a (PBT): Assets Endpoint Preservation', () => {
  let server: http.Server;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.resetDocIdCounter();
    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('for any completed job with N assets (N >= 1), GET /api/v1/jobs/:jobId/assets returns signed URLs for all N assets', async () => {
    /**
     * **Validates: Requirements 3.1**
     *
     * Generate random asset arrays with varying storagePath patterns and assetTypes.
     * Verify the assets endpoint generates signed URLs for all completed assets.
     * This behavior must be preserved after the bugfix.
     */
    const samples = fc.sample(assetArrayArb, 5);

    for (const assets of samples) {
      const jobId = `assets-pres-${Math.random().toString(36).slice(2, 8)}`;

      // Mock Firestore to return a completed job with these assets
      const jobData = {
        id: jobId,
        state: JobState.Completed,
        assets,
        correlationId: 'corr-test',
        idempotencyKey: 'key-test',
        uploadedMediaPaths: [],
        fallbackNotices: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mocks.mockDocGet.mockResolvedValue({
        exists: true,
        data: () => jobData,
      });

      const res = await makeRequest(server, 'GET', `/api/v1/jobs/${jobId}/assets`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('bundle');

      const bundle = res.body.bundle as Record<string, unknown>;
      const returnedAssets = bundle.assets as Array<Record<string, unknown>>;

      // Every asset should have a signedUrl
      expect(returnedAssets.length).toBe(assets.length);
      for (const asset of returnedAssets) {
        expect(asset).toHaveProperty('signedUrl');
        expect(typeof asset.signedUrl).toBe('string');
        expect((asset.signedUrl as string).length).toBeGreaterThan(0);
      }
    }
  });

  it('for a non-completed job, GET /api/v1/jobs/:jobId/assets returns 409', async () => {
    /**
     * **Validates: Requirements 3.1**
     *
     * Verify the assets endpoint rejects requests for non-completed jobs.
     */
    const nonTerminalStates = [JobState.Queued, JobState.ProcessingInput, JobState.GeneratingCopy, JobState.GeneratingImages, JobState.GeneratingVideo];

    for (const state of nonTerminalStates) {
      const jobId = `non-complete-${Math.random().toString(36).slice(2, 8)}`;

      mocks.mockDocGet.mockResolvedValue({
        exists: true,
        data: () => ({
          id: jobId,
          state,
          assets: [],
          correlationId: 'corr-test',
          idempotencyKey: 'key-test',
          uploadedMediaPaths: [],
          fallbackNotices: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      });

      const res = await makeRequest(server, 'GET', `/api/v1/jobs/${jobId}/assets`);
      expect(res.status).toBe(409);
    }
  });
});


// ── Test 2b: SSE Metadata Preservation ──────────────────────────────

describe('Property 2b (PBT): SSE Metadata Preservation', () => {
  let server: http.Server;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.resetDocIdCounter();
    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // Arbitrary for OutputIntent
  const arbOutputIntent: fc.Arbitrary<OutputIntent> = fc.record({
    wantsCopy: fc.boolean(),
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

  // Arbitrary for StepsMap
  const arbStepStatus = fc.constantFrom('queued', 'running', 'completed', 'skipped', 'failed');
  const arbStepMetadata = fc.record({
    status: arbStepStatus,
  });
  const arbStepsMap: fc.Arbitrary<StepsMap> = fc.record({
    processInput: arbStepMetadata,
    generateCopy: arbStepMetadata,
    generateImages: arbStepMetadata,
    generateVideo: arbStepMetadata,
    generateGif: arbStepMetadata,
    composePackage: arbStepMetadata,
  }) as fc.Arbitrary<StepsMap>;

  // Arbitrary for requestedOutputs / skippedOutputs
  const arbOutputList = fc.array(
    fc.constantFrom('copy', 'hashtags', 'image', 'video', 'storyboard', 'voiceover', 'gif'),
    { minLength: 0, maxLength: 4 },
  );

  // Arbitrary for warnings
  const arbWarnings: fc.Arbitrary<JobWarning[]> = fc.array(
    fc.record({
      stage: fc.constantFrom('GenerateImages', 'GenerateVideo', 'GenerateGif'),
      message: fc.string({ minLength: 1, maxLength: 50 }),
      timestamp: fc.date(),
      severity: fc.constantFrom('info' as const, 'warning' as const),
    }),
    { minLength: 0, maxLength: 3 },
  );

  it('for any state_change event, the payload includes outputIntent, steps, requestedOutputs, skippedOutputs, warnings fields', async () => {
    /**
     * **Validates: Requirements 3.5**
     *
     * Generate random job state transitions with varying metadata combinations.
     * Verify SSE state_change events always include the metadata fields.
     */
    const samples = fc.sample(
      fc.tuple(arbOutputIntent, arbStepsMap, arbOutputList, arbOutputList, arbWarnings),
      5,
    );

    for (const [outputIntent, steps, requestedOutputs, skippedOutputs, warnings] of samples) {
      const jobId = `sse-meta-${Math.random().toString(36).slice(2, 8)}`;

      const jobData = {
        id: jobId,
        state: JobState.Completed,
        assets: [],
        correlationId: 'corr-test',
        idempotencyKey: 'key-test',
        uploadedMediaPaths: [],
        fallbackNotices: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        outputIntent,
        steps,
        requestedOutputs,
        skippedOutputs,
        warnings,
      };

      mocks.mockDocGet.mockResolvedValue({
        exists: true,
        data: () => jobData,
      });

      const events = await collectSSEEvents(server, jobId, 5, 3000);

      // Find state_change events
      const stateChangeEvents = events.filter((e) => e.event === 'state_change');
      expect(stateChangeEvents.length).toBeGreaterThan(0);

      for (const evt of stateChangeEvents) {
        // All metadata fields must be present
        expect(evt.data).toHaveProperty('outputIntent');
        expect(evt.data).toHaveProperty('steps');
        expect(evt.data).toHaveProperty('requestedOutputs');
        expect(evt.data).toHaveProperty('skippedOutputs');
        expect(evt.data).toHaveProperty('warnings');

        // Verify the values match what was set on the job
        expect(evt.data.outputIntent).toEqual(outputIntent);
        expect(evt.data.requestedOutputs).toEqual(requestedOutputs);
        expect(evt.data.skippedOutputs).toEqual(skippedOutputs);
      }
    }
  });
});

// ── Test 2f: PubSub Delivery Preservation ───────────────────────────

describe('Property 2f (PBT): PubSub Delivery Preservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetDocIdCounter();
  });

  it('for any job dispatch, publishGenerationTask publishes to Pub/Sub topic regardless of local worker availability', async () => {
    /**
     * **Validates: Requirements 3.7**
     *
     * Verify that publishGenerationTask always publishes to Pub/Sub,
     * even when the local worker is unavailable.
     */

    // Reset modules to get a fresh pubsub import
    vi.resetModules();

    vi.doMock('@google-cloud/pubsub', () => ({
      PubSub: vi.fn().mockImplementation(() => ({
        topic: vi.fn().mockReturnValue({
          publishMessage: vi.fn().mockResolvedValue('mock-msg-id'),
        }),
      })),
    }));

    vi.doMock('@google-cloud/firestore', () => ({
      Firestore: vi.fn().mockImplementation(() => ({
        collection: mocks.mockCollection,
      })),
    }));

    vi.doMock('@google-cloud/storage', () => ({
      Storage: vi.fn().mockImplementation(() => ({ bucket: mocks.mockBucket })),
    }));

    const { publishGenerationTask } = await import('../services/pubsub');

    // Set LOCAL_WORKER_URL to a port that will refuse connections
    const originalUrl = process.env.LOCAL_WORKER_URL;
    process.env.LOCAL_WORKER_URL = 'http://127.0.0.1:1';

    try {
      const jobIds = fc.sample(fc.uuid(), 5);

      for (const jobId of jobIds) {
        const messageId = await publishGenerationTask(
          { jobId, idempotencyKey: `idem-${jobId}` },
          `corr-${jobId}`,
        );

        // Pub/Sub publish should always succeed regardless of local worker
        expect(typeof messageId).toBe('string');
        expect(messageId.length).toBeGreaterThan(0);
      }
    } finally {
      if (originalUrl !== undefined) {
        process.env.LOCAL_WORKER_URL = originalUrl;
      } else {
        delete process.env.LOCAL_WORKER_URL;
      }
    }
  });

  it('publishGenerationTask includes correlationId in message attributes', async () => {
    /**
     * **Validates: Requirements 3.7**
     *
     * Verify that the Pub/Sub message includes correlationId in attributes.
     */
    vi.resetModules();

    const capturedMessages: Array<{ json: unknown; attributes: Record<string, string> }> = [];
    vi.doMock('@google-cloud/pubsub', () => ({
      PubSub: vi.fn().mockImplementation(() => ({
        topic: vi.fn().mockReturnValue({
          publishMessage: vi.fn().mockImplementation((msg: any) => {
            capturedMessages.push(msg);
            return Promise.resolve('mock-msg-id');
          }),
        }),
      })),
    }));

    vi.doMock('@google-cloud/firestore', () => ({
      Firestore: vi.fn().mockImplementation(() => ({
        collection: mocks.mockCollection,
      })),
    }));

    vi.doMock('@google-cloud/storage', () => ({
      Storage: vi.fn().mockImplementation(() => ({ bucket: mocks.mockBucket })),
    }));

    const { publishGenerationTask } = await import('../services/pubsub');

    const correlationIds = fc.sample(fc.uuid(), 3);

    for (const corrId of correlationIds) {
      capturedMessages.length = 0;

      await publishGenerationTask(
        { jobId: 'test-job', idempotencyKey: 'test-key' },
        corrId,
      );

      expect(capturedMessages.length).toBe(1);
      expect(capturedMessages[0].attributes).toHaveProperty('correlationId', corrId);
      expect(capturedMessages[0].attributes).toHaveProperty('publishedAt');
    }
  });
});
