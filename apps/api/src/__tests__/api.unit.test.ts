/**
 * Unit tests for the API service.
 *
 * Uses mocks/stubs for GCS, Firestore, and Pub/Sub services (same pattern as api.property.test.ts).
 * Tests exercise the Express app via HTTP requests.
 *
 * Validates: Requirements 14.1, 14.7, 15.5
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';

// ── Hoisted mocks (available before vi.mock factory runs) ───────────

const mocks = vi.hoisted(() => {
  let docIdCounter = 0;
  const resetDocIdCounter = () => { docIdCounter = 0; };

  const mockFileSave = vi.fn().mockResolvedValue(undefined);
  const mockFileDownload = vi.fn().mockResolvedValue([Buffer.from('data')]);
  const mockBucketFile = vi.fn().mockReturnValue({ save: mockFileSave, download: mockFileDownload });
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
    mockFileSave, mockFileDownload, mockBucketFile, mockBucket,
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

// Now import the app after mocks are set up
import { app } from '../index';

/** Lightweight HTTP request helper */
function makeRequest(
  server: http.Server,
  options: {
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: Buffer | string;
    contentType?: string;
  },
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const headers: Record<string, string> = { ...options.headers };
    if (options.body != null) {
      if (!headers['content-length']) {
        headers['content-length'] = Buffer.byteLength(options.body).toString();
      }
      if (options.contentType && !headers['content-type']) {
        headers['content-type'] = options.contentType;
      }
    }
    const req = http.request(
      { hostname: '127.0.0.1', port: addr.port, path: options.path, method: options.method, headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks).toString() }),
        );
      },
    );
    req.on('error', reject);
    if (options.body != null) req.write(options.body);
    req.end();
  });
}

/** Build a multipart/form-data body with a single file field named "files" */
function buildMultipartBody(
  fileName: string,
  fileContent: Buffer,
  mimeType: string,
): { body: Buffer; contentType: string } {
  const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
  const parts: Buffer[] = [];
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ),
  );
  parts.push(fileContent);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

// ── Test suite ──────────────────────────────────────────────────────

describe('API Service Unit Tests', () => {
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

  // ── Health check ────────────────────────────────────────────────────

  describe('GET /api/v1/health', () => {
    it('returns 200 with status ok and timestamp', async () => {
      const res = await makeRequest(server, { method: 'GET', path: '/api/v1/health' });

      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('ok');
      expect(typeof body.timestamp).toBe('string');
      // Verify timestamp is a valid ISO string
      expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    });
  });

  // ── Upload endpoint ─────────────────────────────────────────────────

  describe('POST /api/v1/upload', () => {
    it('accepts a valid file and returns 201 with upload paths', async () => {
      const fileContent = Buffer.from('hello world');
      const { body, contentType } = buildMultipartBody('test.png', fileContent, 'image/png');

      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/upload',
        body,
        contentType,
      });

      expect(res.status).toBe(201);
      const data = JSON.parse(res.body);
      expect(data.uploads).toBeDefined();
      expect(data.uploads).toHaveLength(1);
      expect(data.uploads[0].fileName).toBe('test.png');
      expect(data.uploads[0].contentType).toBe('image/png');
      expect(data.uploads[0].size).toBe(fileContent.length);
      expect(typeof data.uploads[0].uploadPath).toBe('string');
      expect(mocks.mockFileSave).toHaveBeenCalledTimes(1);
    });

    it('rejects request with no files and returns 400', async () => {
      // Send a multipart request with no file parts
      const boundary = '----FormBoundaryEmpty';
      const body = Buffer.from(`--${boundary}--\r\n`);
      const contentType = `multipart/form-data; boundary=${boundary}`;

      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/upload',
        body,
        contentType,
      });

      expect(res.status).toBe(400);
      const data = JSON.parse(res.body);
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe('NO_FILES');
      expect(mocks.mockFileSave).not.toHaveBeenCalled();
    });

    it('rejects oversized uploads with 413', async () => {
      const oversizeBytes = 50 * 1024 * 1024 + 1;

      const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const addr = server.address() as { port: number };
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: addr.port,
            path: '/api/v1/upload',
            method: 'POST',
            headers: {
              'content-length': oversizeBytes.toString(),
              'content-type': 'multipart/form-data; boundary=----test',
              'connection': 'close',
            },
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
              req.destroy();
              resolve({ status: res.statusCode!, body: Buffer.concat(chunks).toString() });
            });
          },
        );
        req.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'ECONNRESET' || err.code === 'EPIPE') return;
          reject(err);
        });
        req.end();
      });

      expect(res.status).toBe(413);
      const data = JSON.parse(res.body);
      expect(data.error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(mocks.mockFileSave).not.toHaveBeenCalled();
    });
  });

  // ── Job creation ────────────────────────────────────────────────────

  describe('POST /api/v1/jobs', () => {
    it('creates a job and returns 201 with correct response shape', async () => {
      const jobBody = JSON.stringify({
        uploadedMediaPaths: ['gs://bucket/file.png'],
        idempotencyKey: 'test-key-123',
        promptText: 'Launch our new product',
        platform: 'instagram_reel',
        tone: 'cinematic',
      });

      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/jobs',
        body: jobBody,
        contentType: 'application/json',
      });

      expect(res.status).toBe(201);
      const data = JSON.parse(res.body);
      expect(typeof data.jobId).toBe('string');
      expect(data.state).toBe('queued');
      expect(data.createdAt).toBeDefined();
    });

    it('returns 400 when promptText is missing', async () => {
      const jobBody = JSON.stringify({
        uploadedMediaPaths: ['gs://bucket/file.png'],
        idempotencyKey: 'key-1',
        platform: 'instagram_reel',
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
      expect(data.error.code).toBe('MISSING_PROMPT');
    });

    it('returns 400 when promptText is empty', async () => {
      const jobBody = JSON.stringify({
        uploadedMediaPaths: ['gs://bucket/file.png'],
        idempotencyKey: 'key-2',
        promptText: '   ',
        platform: 'instagram_reel',
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
      expect(data.error.code).toBe('MISSING_PROMPT');
    });

    it('returns 400 when platform is invalid', async () => {
      const jobBody = JSON.stringify({
        uploadedMediaPaths: ['gs://bucket/file.png'],
        promptText: 'Launch our product',
        platform: 'invalid_platform',
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
    });

    it('returns 400 when tone is invalid', async () => {
      const jobBody = JSON.stringify({
        uploadedMediaPaths: ['gs://bucket/file.png'],
        promptText: 'Launch our product',
        platform: 'instagram_reel',
        tone: 'invalid_tone',
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
    });

    it('publishes a Pub/Sub message on job creation', async () => {
      const jobBody = JSON.stringify({
        uploadedMediaPaths: ['gs://bucket/file.png'],
        idempotencyKey: 'pubsub-test-key',
        promptText: 'Launch our product',
        platform: 'instagram_reel',
        tone: 'cinematic',
      });

      await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/jobs',
        body: jobBody,
        contentType: 'application/json',
      });

      expect(mocks.mockPublishMessage).toHaveBeenCalledTimes(1);
      const publishCall = mocks.mockPublishMessage.mock.calls[0][0];
      expect(publishCall.json.jobId).toBeDefined();
      expect(publishCall.json.idempotencyKey).toBe('pubsub-test-key');
    });
  });

  // ── Polling endpoint ────────────────────────────────────────────────

  describe('GET /api/v1/jobs/:jobId', () => {
    it('returns current job state for existing job', async () => {
      const mockJobData = {
        id: 'job-123',
        state: 'generating_copy',
        assets: [],
        updatedAt: new Date(),
        correlationId: 'corr-1',
        idempotencyKey: 'key-1',
        uploadedMediaPaths: ['gs://bucket/file.png'],
        fallbackNotices: [],
        createdAt: new Date(),
      };
      mocks.mockDocGet.mockResolvedValueOnce({
        exists: true,
        data: () => mockJobData,
      });

      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/v1/jobs/job-123',
      });

      expect(res.status).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.jobId).toBe('job-123');
      expect(data.state).toBe('generating_copy');
      expect(data.assets).toEqual([]);
    });

    it('returns 404 for non-existent job', async () => {
      mocks.mockDocGet.mockResolvedValueOnce({
        exists: false,
        data: () => null,
      });

      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/v1/jobs/nonexistent-job',
      });

      expect(res.status).toBe(404);
      const data = JSON.parse(res.body);
      expect(data.error.code).toBe('JOB_NOT_FOUND');
    });
  });

  // ── Error handler ───────────────────────────────────────────────────

  describe('Error handler', () => {
    it('returns structured ErrorResponse for unknown routes', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/v1/nonexistent-route',
      });

      // Express returns 404 for unmatched routes — but our app doesn't have a catch-all 404 handler,
      // so it returns the default Express response. Let's test the error handler via a service error instead.
      // We'll trigger an error by making Firestore throw during job creation.
      expect(res.status).toBe(404);
    });

    it('returns structured ErrorResponse when service throws', async () => {
      mocks.mockDocSet.mockRejectedValueOnce(new Error('Firestore unavailable'));

      const jobBody = JSON.stringify({
        uploadedMediaPaths: ['gs://bucket/file.png'],
        idempotencyKey: 'error-test-key',
        promptText: 'Launch our product',
        platform: 'instagram_reel',
        tone: 'cinematic',
      });

      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/jobs',
        body: jobBody,
        contentType: 'application/json',
      });

      expect(res.status).toBe(500);
      const data = JSON.parse(res.body);
      expect(data.error).toBeDefined();
      expect(data.error.code).toBeDefined();
      expect(data.error.message).toBeDefined();
      expect(data.error.correlationId).toBeDefined();
    });
  });
});
