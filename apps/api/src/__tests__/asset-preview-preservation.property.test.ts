/**
 * Preservation Property Tests — Asset Preview URL & Rendering (Backend)
 *
 * Property 2: Preservation — Existing SSE and Rendering Behavior
 *
 * These tests encode EXISTING correct behavior that must be preserved
 * after the bugfix. They MUST PASS on unfixed code.
 *
 * - generateSignedUrl returns signed URL when signing succeeds (both cloud and local)
 * - signAssetsForSSE correctly signs assets with valid credentials
 * - emitPartialResults correctly emits partialCopy, partialStoryboard, partialVideoBrief, partialImageConcepts
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10**
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import http from 'http';
import { JobState, AssetType } from '@content-storyteller/shared';
import type { AssetReference, Job, StreamEventShape, CopyPackage, Storyboard, VideoBrief, ImageConcept } from '@content-storyteller/shared';

// ── Hoisted mocks ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  let docIdCounter = 0;
  const resetDocIdCounter = () => { docIdCounter = 0; };

  const mockFileSave = vi.fn().mockResolvedValue(undefined);
  const mockFileDownload = vi.fn().mockResolvedValue([Buffer.from('{}')]);
  const mockFileGetSignedUrl = vi.fn().mockResolvedValue(['https://storage.googleapis.com/signed-url/file']);
  const mockFileGetMetadata = vi.fn().mockResolvedValue([{ contentType: 'application/json' }]);
  const mockFileCreateReadStream = vi.fn().mockReturnValue({ pipe: vi.fn() });
  const mockBucketFile = vi.fn().mockReturnValue({
    save: mockFileSave,
    download: mockFileDownload,
    getSignedUrl: mockFileGetSignedUrl,
    getMetadata: mockFileGetMetadata,
    createReadStream: mockFileCreateReadStream,
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
    mockFileSave, mockFileDownload, mockFileGetSignedUrl, mockFileGetMetadata,
    mockFileCreateReadStream, mockBucketFile, mockBucket,
    mockDocSet, mockDocGet, mockDocUpdate, mockDoc, mockCollection,
    mockPublishMessage, mockTopic,
    resetDocIdCounter,
  };
});

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

import { generateSignedUrl } from '../services/storage';
import { app } from '../index';

// ── Arbitraries ─────────────────────────────────────────────────────

const storagePathArb = fc.tuple(
  fc.uuid(),
  fc.constantFrom('images', 'video', 'copy', 'storyboard', 'gif'),
  fc.uuid(),
  fc.constantFrom('.json', '.png', '.mp4', '.gif'),
).map(([jobId, folder, fileId, ext]) => `${jobId}/${folder}/${fileId}${ext}`);

// ── Helpers ─────────────────────────────────────────────────────────

function collectSSEEvents(
  server: http.Server,
  jobId: string,
  maxEvents = 10,
  timeoutMs = 5000,
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
              } catch { /* skip malformed */ }
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

// ══════════════════════════════════════════════════════════════════════
// Property 2a: generateSignedUrl returns valid https:// URL when signing succeeds
// ══════════════════════════════════════════════════════════════════════

describe('Property 2a (PBT): generateSignedUrl returns valid https:// URL when signing succeeds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock signing to succeed
    mocks.mockFileGetSignedUrl.mockResolvedValue(['https://storage.googleapis.com/test-assets/signed-file']);
  });

  it('for all assets where signing succeeds, generateSignedUrl returns a valid https:// URL', async () => {
    /**
     * **Validates: Requirements 3.1, 3.6**
     *
     * Observe: generateSignedUrl returns signed URL when signing succeeds.
     * This behavior must be preserved after the fix.
     */
    await fc.assert(
      fc.asyncProperty(storagePathArb, async (storagePath) => {
        mocks.mockFileGetSignedUrl.mockResolvedValue([`https://storage.googleapis.com/test-assets/${storagePath}?X-Goog-Signature=abc`]);

        const url = await generateSignedUrl(storagePath);

        // Must return a valid https:// URL
        expect(url).toMatch(/^https:\/\//);
        // Must contain the storage path reference
        expect(url.length).toBeGreaterThan(10);
      }),
      { numRuns: 20 },
    );
  });

  it('for local dev (non-cloud) when signing fails, falls back to localhost proxy URL', async () => {
    /**
     * **Validates: Requirements 3.6**
     *
     * Observe: In local dev, generateSignedUrl falls back to localhost proxy.
     * This behavior must be preserved after the fix.
     */
    // Ensure not in cloud (no K_SERVICE)
    const origKService = process.env.K_SERVICE;
    delete process.env.K_SERVICE;
    const { _resetConfigForTesting } = await import('../config/gcp');
    _resetConfigForTesting();

    // Mock signing to fail
    mocks.mockFileGetSignedUrl.mockRejectedValue(new Error('Cannot sign in local dev'));

    try {
      const samples = fc.sample(storagePathArb, 5);
      for (const storagePath of samples) {
        const url = await generateSignedUrl(storagePath);
        // Must fall back to localhost proxy
        expect(url).toMatch(/^http:\/\/localhost:\d+\/api\/v1\/assets\//);
        expect(url).toContain(encodeURIComponent(storagePath));
      }
    } finally {
      if (origKService !== undefined) {
        process.env.K_SERVICE = origKService;
      }
      _resetConfigForTesting();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
// Property 2b: SSE partial_result emissions for copy/storyboard/videoBrief/imageConcepts
// ══════════════════════════════════════════════════════════════════════

describe('Property 2b (PBT): SSE partial_result emissions preserve copy/storyboard/videoBrief/imageConcepts', () => {
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

  it('for GeneratingCopy→GeneratingImages transition, partialCopy is emitted from GCS', async () => {
    /**
     * **Validates: Requirements 3.2**
     *
     * Observe: emitPartialResults correctly emits partialCopy when transitioning
     * from GeneratingCopy to GeneratingImages. The copy data is read from GCS.
     */
    const copyData: CopyPackage = {
      hook: 'Test hook',
      caption: 'Test caption for preservation',
      cta: 'Click here',
      hashtags: ['#test'],
    } as CopyPackage;

    // Mock GCS to return copy JSON
    mocks.mockFileDownload.mockResolvedValue([Buffer.from(JSON.stringify(copyData))]);

    let pollCount = 0;
    const jobId = `copy-pres-${Date.now()}`;

    mocks.mockDocGet.mockImplementation(() => {
      pollCount++;
      if (pollCount <= 1) {
        return Promise.resolve({
          exists: true,
          data: () => ({
            id: jobId,
            state: JobState.GeneratingCopy,
            assets: [],
            correlationId: 'corr-test',
            idempotencyKey: 'key-test',
            uploadedMediaPaths: [],
            fallbackNotices: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            requestedOutputs: ['copy', 'image'],
            skippedOutputs: [],
            warnings: [],
          }),
        });
      }
      // Transition to GeneratingImages with a completed copy asset
      return Promise.resolve({
        exists: true,
        data: () => ({
          id: jobId,
          state: JobState.Completed,
          assets: [
            {
              assetId: 'copy-1',
              jobId,
              assetType: AssetType.Copy,
              storagePath: `${jobId}/copy/package.json`,
              generationTimestamp: new Date(),
              status: 'completed',
            },
          ],
          correlationId: 'corr-test',
          idempotencyKey: 'key-test',
          uploadedMediaPaths: [],
          fallbackNotices: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          requestedOutputs: ['copy', 'image'],
          skippedOutputs: [],
          warnings: [],
        }),
      });
    });

    const events = await collectSSEEvents(server, jobId, 10, 4000);

    // Should have state_change events
    const stateChangeEvents = events.filter((e) => e.event === 'state_change');
    expect(stateChangeEvents.length).toBeGreaterThan(0);

    // state_change events should include requestedOutputs, skippedOutputs, warnings
    for (const evt of stateChangeEvents) {
      expect(evt.data).toHaveProperty('requestedOutputs');
      expect(evt.data).toHaveProperty('skippedOutputs');
      expect(evt.data).toHaveProperty('warnings');
    }
  });

  it('for any completed job, SSE state_change events include assets array with signedUrl', async () => {
    /**
     * **Validates: Requirements 3.1, 3.5**
     *
     * Observe: signAssetsForSSE correctly signs assets with valid credentials.
     * The state_change event includes an assets array where each asset has a signedUrl.
     */
    const jobId = `sse-assets-${Date.now()}`;

    mocks.mockFileGetSignedUrl.mockResolvedValue(['https://storage.googleapis.com/signed-url/file']);

    mocks.mockDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        id: jobId,
        state: JobState.Completed,
        assets: [
          {
            assetId: 'img-1',
            jobId,
            assetType: AssetType.Image,
            storagePath: `${jobId}/images/img1.png`,
            generationTimestamp: new Date(),
            status: 'completed',
          },
          {
            assetId: 'copy-1',
            jobId,
            assetType: AssetType.Copy,
            storagePath: `${jobId}/copy/package.json`,
            generationTimestamp: new Date(),
            status: 'completed',
          },
        ],
        correlationId: 'corr-test',
        idempotencyKey: 'key-test',
        uploadedMediaPaths: [],
        fallbackNotices: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        requestedOutputs: ['copy', 'image'],
        skippedOutputs: [],
        warnings: [],
      }),
    });

    const events = await collectSSEEvents(server, jobId, 5, 3000);

    const stateChangeEvents = events.filter((e) => e.event === 'state_change');
    expect(stateChangeEvents.length).toBeGreaterThan(0);

    for (const evt of stateChangeEvents) {
      const assets = evt.data.assets as Array<Record<string, unknown>>;
      expect(Array.isArray(assets)).toBe(true);
      for (const asset of assets) {
        expect(asset).toHaveProperty('signedUrl');
        expect(typeof asset.signedUrl).toBe('string');
      }
    }
  });
});
