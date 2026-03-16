/**
 * Property-based tests for bundle endpoint.
 *
 * Property 25: Bundle manifest includes all completed assets with signed URLs
 *
 * Validates: Requirements 29.1, 29.4
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import http from 'http';
import { AssetType, JobState } from '@content-storyteller/shared';

const mocks = vi.hoisted(() => {
  let docIdCounter = 0;
  const resetDocIdCounter = () => { docIdCounter = 0; };

  const mockFileSave = vi.fn().mockResolvedValue(undefined);
  const mockFileDownload = vi.fn().mockResolvedValue([Buffer.from('data')]);
  const mockGetSignedUrl = vi.fn().mockResolvedValue(['https://storage.example.com/signed-url']);
  const mockBucketFile = vi.fn().mockReturnValue({
    save: mockFileSave, download: mockFileDownload, getSignedUrl: mockGetSignedUrl,
  });
  const mockBucket = vi.fn().mockReturnValue({ file: mockBucketFile });

  const mockDocSet = vi.fn().mockResolvedValue(undefined);
  const mockDocGet = vi.fn().mockResolvedValue({ exists: true, data: () => ({}) });
  const mockDocUpdate = vi.fn().mockResolvedValue(undefined);
  const mockDoc = vi.fn().mockImplementation((id?: string) => ({
    id: id || `mock-doc-${++docIdCounter}`,
    set: mockDocSet, get: mockDocGet, update: mockDocUpdate,
  }));
  const mockCollection = vi.fn().mockReturnValue({ doc: mockDoc });

  const mockPublishMessage = vi.fn().mockResolvedValue('mock-message-id');
  const mockTopic = vi.fn().mockReturnValue({ publishMessage: mockPublishMessage });

  return {
    mockFileSave, mockFileDownload, mockGetSignedUrl, mockBucketFile, mockBucket,
    mockDocSet, mockDocGet, mockDocUpdate, mockDoc, mockCollection,
    mockPublishMessage, mockTopic, resetDocIdCounter,
  };
});

vi.mock('@google-cloud/storage', () => ({
  Storage: vi.fn().mockImplementation(() => ({ bucket: mocks.mockBucket })),
}));
vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => ({ collection: mocks.mockCollection })),
}));
vi.mock('@google-cloud/pubsub', () => ({
  PubSub: vi.fn().mockImplementation(() => ({ topic: mocks.mockTopic })),
}));

import { app } from '../index';

function makeRequest(
  server: http.Server,
  options: { method: string; path: string; headers?: Record<string, string> },
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const req = http.request(
      { hostname: '127.0.0.1', port: addr.port, path: options.path, method: options.method, headers: options.headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks).toString() }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('Bundle Endpoint Property Tests', () => {
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

  // ── Property 25: Bundle manifest includes all completed assets ────
  describe('Property 25: Bundle manifest includes all completed assets with signed URLs', () => {
    it('manifest contains all completed assets with signed URLs, platform, and tone', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 1, max: 8 }),
          fc.constantFrom('instagram_reel', 'linkedin_launch_post', 'x_twitter_thread', 'general_promo_package'),
          fc.constantFrom('cinematic', 'punchy', 'sleek', 'professional'),
          async (jobId, assetCount, platform, tone) => {
            vi.clearAllMocks();
            mocks.resetDocIdCounter();

            const assets = Array.from({ length: assetCount }, (_, i) => ({
              assetId: `asset-${i}`,
              jobId,
              assetType: i % 2 === 0 ? AssetType.Copy : AssetType.Image,
              storagePath: `${jobId}/assets/asset-${i}.json`,
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
                updatedAt: new Date(),
                platform,
                tone,
              }),
            });

            const res = await makeRequest(server, {
              method: 'GET',
              path: `/api/v1/jobs/${jobId}/bundle`,
            });

            expect(res.status).toBe(200);
            const manifest = JSON.parse(res.body);

            // All completed assets should be in the manifest
            expect(manifest.assets).toHaveLength(assetCount);

            // Each asset should have a signed URL
            for (const asset of manifest.assets) {
              expect(typeof asset.signedUrl).toBe('string');
              expect(asset.signedUrl.length).toBeGreaterThan(0);
            }

            // Manifest should include platform and tone
            expect(manifest.platform).toBe(platform);
            expect(manifest.tone).toBe(tone);

            // Manifest should include generatedAt timestamp
            expect(manifest.generatedAt).toBeDefined();
            expect(typeof manifest.generatedAt).toBe('string');
          },
        ),
        { numRuns: 100 },
      );
    });

    it('returns 404 for non-existent job', async () => {
      mocks.mockDocGet.mockResolvedValue({ exists: false, data: () => null });

      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/v1/jobs/nonexistent/bundle',
      });

      expect(res.status).toBe(404);
      const data = JSON.parse(res.body);
      expect(data.error.code).toBe('JOB_NOT_FOUND');
    });
  });
});
