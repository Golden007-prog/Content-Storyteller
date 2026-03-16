/**
 * Property-based tests for API MVP enhancements.
 *
 * Property 4: Job creation stores all creative direction fields
 * Property 5: Invalid enum values rejected on job creation
 * Property 6: Signed URLs present on all asset references
 * Property 8 (MVP): CORS headers on all API responses
 * Property 19: Poll response includes creative direction fields
 *
 * Validates: Requirements 7.1, 7.3, 7.4, 8.1, 8.3, 10.2, 24.1, 24.2
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import http from 'http';
import { Platform, Tone, JobState, AssetType } from '@content-storyteller/shared';

// ── Hoisted mocks ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  let docIdCounter = 0;
  const resetDocIdCounter = () => { docIdCounter = 0; };

  const mockFileSave = vi.fn().mockResolvedValue(undefined);
  const mockFileDownload = vi.fn().mockResolvedValue([Buffer.from('data')]);
  const mockGetSignedUrl = vi.fn().mockResolvedValue(['https://storage.example.com/signed-url']);
  const mockBucketFile = vi.fn().mockReturnValue({
    save: mockFileSave,
    download: mockFileDownload,
    getSignedUrl: mockGetSignedUrl,
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
    mockFileSave, mockFileDownload, mockGetSignedUrl, mockBucketFile, mockBucket,
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

import { app } from '../index';

function makeRequest(
  server: http.Server,
  options: { method: string; path: string; headers?: Record<string, string>; body?: string; contentType?: string },
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
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
        res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks).toString() }));
      },
    );
    req.on('error', reject);
    if (options.body != null) req.write(options.body);
    req.end();
  });
}

describe('API MVP Property Tests', () => {
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

  // ── Property 4: Job creation stores all creative direction fields ──
  describe('Property 4: Job creation stores all creative direction fields', () => {
    it('stores promptText, platform, and tone on job creation', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
          fc.constantFrom(...Object.values(Platform)),
          fc.constantFrom(...Object.values(Tone)),
          async (promptText, platform, tone) => {
            vi.clearAllMocks();
            mocks.resetDocIdCounter();

            const jobBody = JSON.stringify({
              uploadedMediaPaths: ['gs://bucket/file.png'],
              idempotencyKey: `key-${Date.now()}`,
              promptText,
              platform,
              tone,
            });

            const res = await makeRequest(server, {
              method: 'POST',
              path: '/api/v1/jobs',
              body: jobBody,
              contentType: 'application/json',
            });

            expect(res.status).toBe(201);

            // Verify Firestore set was called with creative direction fields
            expect(mocks.mockDocSet).toHaveBeenCalledTimes(1);
            const stored = mocks.mockDocSet.mock.calls[0][0];
            expect(stored.promptText).toBe(promptText);
            expect(stored.platform).toBe(platform);
            expect(stored.tone).toBe(tone);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 5: Invalid enum values rejected on job creation ──────
  describe('Property 5: Invalid enum values rejected on job creation', () => {
    it('rejects invalid platform values with 400 INVALID_PLATFORM', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }).filter(
            (s) => !Object.values(Platform).includes(s as Platform),
          ),
          async (invalidPlatform) => {
            vi.clearAllMocks();
            mocks.resetDocIdCounter();

            const jobBody = JSON.stringify({
              uploadedMediaPaths: ['gs://bucket/file.png'],
              promptText: 'Test prompt',
              platform: invalidPlatform,
              tone: 'cinematic',
            });

            const res = await makeRequest(server, {
              method: 'POST',
              path: '/api/v1/jobs',
              body: jobBody,
              contentType: 'application/json',
            });

            expect(res.status).toBe(400);
            const data = JSON.parse(res.body);
            expect(data.error.code).toBe('INVALID_PLATFORM');
            expect(mocks.mockDocSet).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    });

    it('rejects invalid tone values with 400 INVALID_TONE', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }).filter(
            (s) => !Object.values(Tone).includes(s as Tone),
          ),
          async (invalidTone) => {
            vi.clearAllMocks();
            mocks.resetDocIdCounter();

            const jobBody = JSON.stringify({
              uploadedMediaPaths: ['gs://bucket/file.png'],
              promptText: 'Test prompt',
              platform: 'instagram_reel',
              tone: invalidTone,
            });

            const res = await makeRequest(server, {
              method: 'POST',
              path: '/api/v1/jobs',
              body: jobBody,
              contentType: 'application/json',
            });

            expect(res.status).toBe(400);
            const data = JSON.parse(res.body);
            expect(data.error.code).toBe('INVALID_TONE');
            expect(mocks.mockDocSet).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 6: Signed URLs present on all asset references ───────
  describe('Property 6: Signed URLs present on all asset references', () => {
    it('assets endpoint returns signed URLs for all completed assets', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 1, max: 5 }),
          async (jobId, assetCount) => {
            vi.clearAllMocks();
            mocks.resetDocIdCounter();

            const assets = Array.from({ length: assetCount }, (_, i) => ({
              assetId: `asset-${i}`,
              jobId,
              assetType: AssetType.Copy,
              storagePath: `${jobId}/copy/asset-${i}.json`,
              generationTimestamp: new Date(),
              status: 'completed',
            }));

            mocks.mockDocGet.mockResolvedValue({
              exists: true,
              data: () => ({
                id: jobId,
                state: JobState.Completed,
                assets,
                fallbackNotices: [],
                creativeBrief: { targetAudience: 'Test', tone: 'Professional', keyMessages: ['msg'], visualDirection: 'Clean', inputSummary: 'Summary' },
                updatedAt: new Date(),
              }),
            });

            const res = await makeRequest(server, {
              method: 'GET',
              path: `/api/v1/jobs/${jobId}/assets`,
            });

            expect(res.status).toBe(200);
            const data = JSON.parse(res.body);
            expect(data.bundle.assets).toHaveLength(assetCount);
            for (const asset of data.bundle.assets) {
              expect(typeof asset.signedUrl).toBe('string');
              expect(asset.signedUrl.length).toBeGreaterThan(0);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 8 (MVP): CORS headers on all API responses ───────────
  describe('Property 8 (MVP): CORS headers on all API responses', () => {
    it('responses include access-control-allow-origin header', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.constantFrom('/api/v1/health', '/api/v1/jobs/test-id'),
          async (path) => {
            const res = await makeRequest(server, {
              method: 'GET',
              path,
              headers: { origin: 'http://localhost:5173' },
            });

            // CORS middleware should set the header
            expect(res.headers['access-control-allow-origin']).toBeDefined();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 19: Poll response includes creative direction fields ─
  describe('Property 19: Poll response includes creative direction fields', () => {
    it('GET /:jobId returns creativeBrief, platform, and tone', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.constantFrom(...Object.values(Platform)),
          fc.constantFrom(...Object.values(Tone)),
          async (jobId, platform, tone) => {
            vi.clearAllMocks();
            mocks.resetDocIdCounter();

            mocks.mockDocGet.mockResolvedValue({
              exists: true,
              data: () => ({
                id: jobId,
                state: JobState.Completed,
                assets: [],
                fallbackNotices: [],
                updatedAt: new Date(),
                platform,
                tone,
                creativeBrief: {
                  targetAudience: 'Devs',
                  tone: tone,
                  keyMessages: ['Build'],
                  visualDirection: 'Modern',
                  inputSummary: 'Summary',
                  platform,
                  campaignAngle: 'Launch',
                },
              }),
            });

            const res = await makeRequest(server, {
              method: 'GET',
              path: `/api/v1/jobs/${jobId}`,
            });

            expect(res.status).toBe(200);
            const data = JSON.parse(res.body);
            expect(data.platform).toBe(platform);
            expect(data.tone).toBe(tone);
            expect(data.creativeBrief).toBeDefined();
            expect(data.creativeBrief.campaignAngle).toBe('Launch');
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
