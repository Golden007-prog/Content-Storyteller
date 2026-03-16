/**
 * Unit tests for API MVP enhancements.
 *
 * Tests: job creation validation, signed URL generation, CORS, poll response.
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 8.1, 10.1, 24.1
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';

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

describe('API MVP Unit Tests', () => {
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

  describe('Job creation validation', () => {
    it('returns 400 MISSING_PROMPT when promptText is missing', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/jobs',
        body: JSON.stringify({ uploadedMediaPaths: [], platform: 'instagram_reel', tone: 'cinematic' }),
        contentType: 'application/json',
      });
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe('MISSING_PROMPT');
    });

    it('returns 400 MISSING_PROMPT when promptText is whitespace-only', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/jobs',
        body: JSON.stringify({ uploadedMediaPaths: [], promptText: '   \t\n  ', platform: 'instagram_reel', tone: 'cinematic' }),
        contentType: 'application/json',
      });
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe('MISSING_PROMPT');
    });

    it('returns 400 INVALID_PLATFORM for unknown platform', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/jobs',
        body: JSON.stringify({ uploadedMediaPaths: [], promptText: 'Test', platform: 'tiktok', tone: 'cinematic' }),
        contentType: 'application/json',
      });
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe('INVALID_PLATFORM');
    });

    it('returns 400 INVALID_TONE for unknown tone', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/jobs',
        body: JSON.stringify({ uploadedMediaPaths: [], promptText: 'Test', platform: 'instagram_reel', tone: 'aggressive' }),
        contentType: 'application/json',
      });
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe('INVALID_TONE');
    });

    it('returns 201 with all fields for valid job creation', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/jobs',
        body: JSON.stringify({
          uploadedMediaPaths: ['gs://bucket/file.png'],
          idempotencyKey: 'test-key',
          promptText: 'Launch our product',
          platform: 'instagram_reel',
          tone: 'cinematic',
        }),
        contentType: 'application/json',
      });
      expect(res.status).toBe(201);
      const data = JSON.parse(res.body);
      expect(data.jobId).toBeDefined();
      expect(data.state).toBe('queued');
      expect(data.createdAt).toBeDefined();

      // Verify stored fields
      const stored = mocks.mockDocSet.mock.calls[0][0];
      expect(stored.promptText).toBe('Launch our product');
      expect(stored.platform).toBe('instagram_reel');
      expect(stored.tone).toBe('cinematic');
    });
  });

  describe('Signed URL generation', () => {
    it('generates signed URLs for assets endpoint', async () => {
      mocks.mockDocGet.mockResolvedValue({
        exists: true,
        data: () => ({
          id: 'job-1',
          state: 'completed',
          assets: [
            { assetId: 'a1', jobId: 'job-1', assetType: 'copy', storagePath: 'job-1/copy/a1.json', generationTimestamp: new Date(), status: 'completed' },
          ],
          fallbackNotices: [],
          creativeBrief: { targetAudience: 'Test', tone: 'Pro', keyMessages: ['m'], visualDirection: 'Clean', inputSummary: 'S' },
          updatedAt: new Date(),
        }),
      });

      const res = await makeRequest(server, { method: 'GET', path: '/api/v1/jobs/job-1/assets' });
      expect(res.status).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.bundle.assets[0].signedUrl).toContain('https://');
    });
  });

  describe('CORS preflight', () => {
    it('OPTIONS request returns CORS headers', async () => {
      const res = await makeRequest(server, {
        method: 'OPTIONS',
        path: '/api/v1/health',
        headers: { origin: 'http://localhost:5173' },
      });
      // CORS middleware should respond to preflight
      expect(res.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  describe('Poll response with creative direction', () => {
    it('includes creativeBrief, platform, and tone in poll response', async () => {
      mocks.mockDocGet.mockResolvedValue({
        exists: true,
        data: () => ({
          id: 'job-poll',
          state: 'completed',
          assets: [],
          fallbackNotices: [],
          updatedAt: new Date(),
          platform: 'linkedin_launch_post',
          tone: 'professional',
          creativeBrief: {
            targetAudience: 'B2B',
            tone: 'professional',
            keyMessages: ['Enterprise'],
            visualDirection: 'Corporate',
            inputSummary: 'Summary',
            platform: 'linkedin_launch_post',
            campaignAngle: 'Thought leadership',
            pacing: 'Measured',
            visualStyle: 'Corporate blue',
          },
        }),
      });

      const res = await makeRequest(server, { method: 'GET', path: '/api/v1/jobs/job-poll' });
      expect(res.status).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.platform).toBe('linkedin_launch_post');
      expect(data.tone).toBe('professional');
      expect(data.creativeBrief).toBeDefined();
      expect(data.creativeBrief.campaignAngle).toBe('Thought leadership');
      expect(data.creativeBrief.pacing).toBe('Measured');
      expect(data.creativeBrief.visualStyle).toBe('Corporate blue');
    });
  });
});
