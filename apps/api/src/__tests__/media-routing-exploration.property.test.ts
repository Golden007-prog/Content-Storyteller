/**
 * Bug Condition Exploration Property Tests — API Poll Response Incomplete (Defect 4)
 *
 * Property 1: Bug Condition — Poll Response Incomplete
 *
 * The GET /:jobId handler constructs the PollJobStatusResponse without
 * requestedOutputs, skippedOutputs, or outputIntent fields, even though
 * the Firestore Job document contains them.
 *
 * These tests encode the EXPECTED (correct) behavior.
 * They are EXPECTED TO FAIL on unfixed code, confirming the bug exists.
 *
 * **Validates: Requirements 1.6**
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import http from 'http';
import { JobState, Platform, Tone, OutputPreference } from '@content-storyteller/shared';

// ── Hoisted mocks ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  let docIdCounter = 0;
  const resetDocIdCounter = () => { docIdCounter = 0; };

  const mockFileSave = vi.fn().mockResolvedValue(undefined);
  const mockFileDownload = vi.fn().mockResolvedValue([Buffer.from('data')]);
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

// Import app after mocks
import { app } from '../index';

/** Lightweight HTTP request helper */
function makeRequest(
  server: http.Server,
  options: {
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: string;
    contentType?: string;
  },
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const headers: Record<string, string> = { ...options.headers };
    if (options.body != null) {
      headers['content-length'] = Buffer.byteLength(options.body).toString();
      if (options.contentType) headers['content-type'] = options.contentType;
    }
    const req = http.request(
      { hostname: '127.0.0.1', port: addr.port, path: options.path, method: options.method, headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode!, body: Buffer.concat(chunks).toString() }));
      },
    );
    req.on('error', reject);
    if (options.body != null) req.write(options.body);
    req.end();
  });
}

// ── Test suite ──────────────────────────────────────────────────────

describe('Test 1c (PBT): GET /:jobId response includes requestedOutputs, skippedOutputs, outputIntent', () => {
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

  // Arbitrary for requestedOutputs
  const requestedOutputsArb = fc.subarray(
    ['copy', 'hashtags', 'image', 'video', 'storyboard', 'voiceover', 'gif'],
    { minLength: 1 },
  );

  // Arbitrary for skippedOutputs
  const skippedOutputsArb = fc.subarray(
    ['image', 'video', 'gif', 'storyboard', 'voiceover'],
    { minLength: 0 },
  );

  // Arbitrary for outputIntent
  const outputIntentArb = fc.record({
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

  it('for any job with requestedOutputs/skippedOutputs/outputIntent, GET response includes all three', async () => {
    // We run this as a standard loop over generated values since we need async
    const values = fc.sample(
      fc.tuple(requestedOutputsArb, skippedOutputsArb, outputIntentArb),
      10,
    );

    for (const [requested, skipped, intent] of values) {
      const jobId = `poll-test-${Math.random().toString(36).slice(2, 8)}`;

      // Mock Firestore getJob to return a job with the generated fields
      mocks.mockDocGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          id: jobId,
          state: JobState.Completed,
          assets: [],
          updatedAt: new Date(),
          correlationId: 'corr-test',
          idempotencyKey: 'key-test',
          uploadedMediaPaths: [],
          fallbackNotices: [],
          createdAt: new Date(),
          platform: Platform.InstagramReel,
          tone: Tone.Cinematic,
          requestedOutputs: requested,
          skippedOutputs: skipped,
          outputIntent: intent,
        }),
      });

      const res = await makeRequest(server, {
        method: 'GET',
        path: `/api/v1/jobs/${jobId}`,
      });

      expect(res.status).toBe(200);
      const data = JSON.parse(res.body);

      // EXPECTED (correct) behavior: response includes all three fields
      // WILL FAIL: current GET handler omits requestedOutputs, skippedOutputs, outputIntent
      expect(data.requestedOutputs).toEqual(requested);
      expect(data.skippedOutputs).toEqual(skipped);
      expect(data.outputIntent).toEqual(intent);
    }
  });
});
