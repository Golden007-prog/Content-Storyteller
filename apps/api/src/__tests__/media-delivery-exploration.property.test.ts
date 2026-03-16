/**
 * Bug Condition Exploration Property Tests — Media Delivery & Video Hang
 *
 * Property 1: Bug Condition — SSE Asset Signing Missing, Local Worker Log Noise
 *
 * These tests encode the EXPECTED (correct) behavior.
 * They are EXPECTED TO FAIL on unfixed code, confirming the bugs exist.
 *
 * Test 1a: SSE state_change events must include signedUrl on every asset
 * Test 1d: forwardToLocalWorker must emit at most 1 log on repeated failures
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.7**
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import http from 'http';
import { JobState, AssetType } from '@content-storyteller/shared';
import type { AssetReference } from '@content-storyteller/shared';

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

const assetReferenceArb = fc.record({
  assetId: fc.uuid(),
  jobId: fc.uuid(),
  assetType: assetTypeArb,
  storagePath: storagePathArb,
  generationTimestamp: fc.date(),
  status: fc.constant('completed' as const),
});

const assetArrayArb = fc.array(assetReferenceArb, { minLength: 1, maxLength: 5 });

// ── Helpers ─────────────────────────────────────────────────────────

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

// ── Test 1a: SSE Asset Signing ──────────────────────────────────────

describe('Test 1a (PBT): SSE state_change events include signedUrl on every asset', () => {
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

  it('for any job with N completed assets, SSE state_change event includes signedUrl on all N assets', async () => {
    /**
     * **Validates: Requirements 1.1, 1.2, 1.3**
     *
     * Generate random AssetReference arrays with storagePath values.
     * Simulate a state_change SSE event for a completed job.
     * Assert the emitted event payload has signedUrl on every asset.
     *
     * WILL FAIL on unfixed code: poll() in stream.ts copies raw
     * currentJob.assets without calling generateSignedUrl.
     */
    const samples = fc.sample(assetArrayArb, 5);

    for (const assets of samples) {
      const jobId = `sse-sign-${Math.random().toString(36).slice(2, 8)}`;

      // First call: return job in Completed state with assets
      // The SSE endpoint calls getJob twice: once at the top, once in poll()
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
        warnings: [],
      };

      // Mock getJob to return the completed job on every call
      mocks.mockDocGet.mockResolvedValue({
        exists: true,
        data: () => jobData,
      });

      const events = await collectSSEEvents(server, jobId, 5, 3000);

      // Find state_change or complete events that have assets
      const assetEvents = events.filter(
        (e) => (e.event === 'state_change' || e.event === 'complete') && Array.isArray(e.data.assets) && (e.data.assets as unknown[]).length > 0,
      );

      expect(assetEvents.length).toBeGreaterThan(0);

      for (const evt of assetEvents) {
        const eventAssets = evt.data.assets as Array<Record<string, unknown>>;
        for (const asset of eventAssets) {
          // EXPECTED: every asset has a signedUrl field (not undefined)
          expect(asset).toHaveProperty('signedUrl');
          expect(typeof asset.signedUrl).toBe('string');
          // signedUrl should not be empty (our mock returns a valid URL)
          expect((asset.signedUrl as string).length).toBeGreaterThan(0);
        }
      }
    }
  });
});


// ── Test 1d: Local Worker Log Dedup ─────────────────────────────────

describe('Test 1d (PBT): forwardToLocalWorker emits at most 1 log on repeated failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetDocIdCounter();
  });

  it('for K consecutive local worker failures (K >= 2), at most 1 info-level log is emitted', async () => {
    /**
     * **Validates: Requirements 1.7**
     *
     * Call publishGenerationTask multiple times with a failing local worker endpoint.
     * Assert that at most 1 info-level log message is emitted for the failure.
     *
     * WILL FAIL on unfixed code: console.error is called on every failure,
     * producing K error logs for K failures.
     */

    // We need to re-import pubsub fresh to reset the module-level flag
    // Use dynamic import with cache busting isn't possible, so we test via
    // the exported publishGenerationTask function and spy on logger output
    const logSpy = vi.fn();
    const originalWrite = process.stdout.write;
    const logMessages: string[] = [];

    // Capture all stdout writes (structured logs)
    process.stdout.write = ((chunk: string | Uint8Array) => {
      const str = typeof chunk === 'string' ? chunk : chunk.toString();
      if (str.includes('LocalWorker')) {
        logMessages.push(str);
        logSpy(str);
      }
      return true;
    }) as typeof process.stdout.write;

    try {
      // Set LOCAL_WORKER_URL to a port that will refuse connections
      const originalUrl = process.env.LOCAL_WORKER_URL;
      process.env.LOCAL_WORKER_URL = 'http://127.0.0.1:1'; // port 1 will refuse

      // We need to reset the module-level flag. Since we can't easily do that,
      // we'll import and call publishGenerationTask multiple times.
      // The module-level localWorkerFailureLogged flag persists across calls.

      // Reset the pubsub module by clearing the require cache
      // For ESM/vitest, we need to use vi.resetModules() approach
      vi.resetModules();

      // Re-mock after reset
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

      // Dynamically import the fresh module
      const { publishGenerationTask } = await import('../services/pubsub');

      const failureCounts = fc.sample(fc.integer({ min: 2, max: 5 }), 3);

      for (const K of failureCounts) {
        logMessages.length = 0;
        logSpy.mockClear();

        // Make K calls — all will fail because LOCAL_WORKER_URL points to port 1
        for (let i = 0; i < K; i++) {
          try {
            await publishGenerationTask(
              {
                jobId: `dedup-test-${i}`,
                correlationId: `corr-${i}`,
                uploadedMediaPaths: [],
                promptText: 'test',
                platform: 'instagram_reel',
                tone: 'cinematic',
              },
              `corr-${i}`,
            );
          } catch {
            // publishGenerationTask may throw if PubSub mock fails — that's OK
          }

          // Small delay to let fire-and-forget complete
          await new Promise((r) => setTimeout(r, 100));
        }

        // Wait for all fire-and-forget calls to settle
        await new Promise((r) => setTimeout(r, 500));

        // EXPECTED: at most 1 log message containing 'LocalWorker'
        // WILL FAIL on unfixed code: K console.error calls produced
        expect(logMessages.length).toBeLessThanOrEqual(1);

        // If there is a log, it should be info level, not error
        if (logMessages.length > 0) {
          const parsed = JSON.parse(logMessages[0].trim());
          expect(parsed.severity).toBe('INFO');
        }
      }

      // Restore
      if (originalUrl !== undefined) {
        process.env.LOCAL_WORKER_URL = originalUrl;
      } else {
        delete process.env.LOCAL_WORKER_URL;
      }
    } finally {
      process.stdout.write = originalWrite;
    }
  });
});
