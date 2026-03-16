/**
 * Property-based tests for the API service.
 *
 * Uses mocks/stubs for GCS, Firestore, and Pub/Sub services.
 * Tests exercise the Express app via HTTP requests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
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
      // Only set content-length if not already provided in headers
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

describe('API Service Property Tests', () => {
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

  // ── Property 8 ──────────────────────────────────────────────────────
  /**
   * Feature: content-storyteller-gcp-foundation, Property 8: Upload creates storage object and Job document
   *
   * For valid uploads ≤50MB, verify file stored in uploads bucket and
   * Job created in Firestore with state `queued`.
   *
   * Validates: Requirements 14.1
   */
  describe('Property 8: Upload creates storage object and Job document', () => {
    it('valid upload stores file and creates queued Job', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 1024 }),
          fc.tuple(
            fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 1, maxLength: 10 }),
            fc.constantFrom('.png', '.jpg', '.txt', '.pdf'),
          ).map(([name, ext]) => name + ext),
          fc.constantFrom('image/png', 'image/jpeg', 'image/webp', 'image/gif', 'audio/mpeg', 'audio/wav', 'audio/webm', 'video/mp4', 'video/webm', 'application/pdf'),
          async (fileSize, fileName, mimeType) => {
            vi.clearAllMocks();
            mocks.resetDocIdCounter();

            const fileContent = Buffer.alloc(fileSize, 'x');
            const { body, contentType } = buildMultipartBody(fileName, fileContent, mimeType);

            // Step 1: Upload the file
            const uploadRes = await makeRequest(server, {
              method: 'POST',
              path: '/api/v1/upload',
              body,
              contentType,
            });

            expect(uploadRes.status).toBe(201);
            expect(mocks.mockFileSave).toHaveBeenCalled();

            // Step 2: Create a job referencing the upload
            const uploadData = JSON.parse(uploadRes.body);
            const uploadPaths = uploadData.uploads.map((u: { uploadPath: string }) => u.uploadPath);

            const jobBody = JSON.stringify({
              uploadedMediaPaths: uploadPaths,
              idempotencyKey: `idem-${Date.now()}`,
              promptText: 'Test product launch',
              platform: 'instagram_reel',
              tone: 'cinematic',
            });

            const jobRes = await makeRequest(server, {
              method: 'POST',
              path: '/api/v1/jobs',
              body: jobBody,
              contentType: 'application/json',
            });

            expect(jobRes.status).toBe(201);
            const jobData = JSON.parse(jobRes.body);

            // Verify Job was created in Firestore with state queued
            expect(mocks.mockDocSet).toHaveBeenCalled();
            const setCallArg = mocks.mockDocSet.mock.calls[0][0];
            expect(setCallArg.state).toBe('queued');
            expect(setCallArg.uploadedMediaPaths).toEqual(uploadPaths);
            expect(jobData.state).toBe('queued');
          },
        ),
        { numRuns: 100 },
      );
    });
  });


  // ── Property 9 ──────────────────────────────────────────────────────
  /**
   * Feature: content-storyteller-gcp-foundation, Property 9: Job creation publishes Pub/Sub message
   *
   * For each Job created, verify Pub/Sub message published with jobId,
   * idempotencyKey, and correlationId in attributes.
   *
   * Validates: Requirements 14.2
   */
  describe('Property 9: Job creation publishes Pub/Sub message', () => {
    it('job creation publishes message with correct fields', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 3, maxLength: 20 }),
          async (correlationId, idempotencyKey) => {
            vi.clearAllMocks();
            mocks.resetDocIdCounter();

            const jobBody = JSON.stringify({
              uploadedMediaPaths: ['gs://bucket/file.png'],
              idempotencyKey,
              promptText: 'Test product launch',
              platform: 'instagram_reel',
              tone: 'cinematic',
            });

            await makeRequest(server, {
              method: 'POST',
              path: '/api/v1/jobs',
              body: jobBody,
              contentType: 'application/json',
              headers: { 'x-correlation-id': correlationId },
            });

            expect(mocks.mockPublishMessage).toHaveBeenCalledTimes(1);
            const publishCall = mocks.mockPublishMessage.mock.calls[0][0];

            expect(publishCall.json).toBeDefined();
            expect(typeof publishCall.json.jobId).toBe('string');
            expect(publishCall.json.idempotencyKey).toBe(idempotencyKey);

            expect(publishCall.attributes).toBeDefined();
            expect(publishCall.attributes.correlationId).toBe(correlationId);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 14 ─────────────────────────────────────────────────────
  /**
   * Feature: content-storyteller-gcp-foundation, Property 14: Correlation ID propagated via Pub/Sub
   *
   * Verify correlationId in message attributes matches originating request.
   *
   * Validates: Requirements 15.1
   */
  describe('Property 14: Correlation ID propagated via Pub/Sub', () => {
    it('correlationId in Pub/Sub attributes matches request header', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          async (requestCorrelationId) => {
            vi.clearAllMocks();
            mocks.resetDocIdCounter();

            const jobBody = JSON.stringify({
              uploadedMediaPaths: ['gs://bucket/test.png'],
              idempotencyKey: `key-${Date.now()}`,
              promptText: 'Test product launch',
              platform: 'instagram_reel',
              tone: 'cinematic',
            });

            await makeRequest(server, {
              method: 'POST',
              path: '/api/v1/jobs',
              body: jobBody,
              contentType: 'application/json',
              headers: { 'x-correlation-id': requestCorrelationId },
            });

            expect(mocks.mockPublishMessage).toHaveBeenCalledTimes(1);
            const publishCall = mocks.mockPublishMessage.mock.calls[0][0];
            expect(publishCall.attributes.correlationId).toBe(requestCorrelationId);
          },
        ),
        { numRuns: 100 },
      );
    });
  });


  // ── Property 15 ─────────────────────────────────────────────────────
  /**
   * Feature: content-storyteller-gcp-foundation, Property 15: Structured JSON logs with required fields
   *
   * Verify all log entries contain severity, message, timestamp;
   * worker entries also contain correlationId and jobId.
   *
   * Validates: Requirements 15.2, 15.3, 15.4
   */
  describe('Property 15: Structured JSON logs with required fields', () => {
    it('API log entries contain severity, message, and timestamp', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.constantFrom('GET', 'POST'),
          fc.constantFrom('/api/v1/health', '/api/v1/jobs/nonexistent'),
          async (method, path) => {
            const logLines: string[] = [];
            const originalWrite = process.stdout.write;
            process.stdout.write = ((chunk: string | Uint8Array) => {
              const str = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
              if (str.trim()) logLines.push(str.trim());
              return true;
            }) as typeof process.stdout.write;

            try {
              await makeRequest(server, { method, path });
            } finally {
              process.stdout.write = originalWrite;
            }

            const jsonLogs = logLines
              .map((line) => {
                try { return JSON.parse(line); } catch { return null; }
              })
              .filter((entry): entry is Record<string, unknown> => entry !== null);

            // At least the request logger should have emitted a log
            expect(jsonLogs.length).toBeGreaterThan(0);

            for (const entry of jsonLogs) {
              expect(entry).toHaveProperty('severity');
              expect(typeof entry.severity).toBe('string');
              expect(entry).toHaveProperty('message');
              expect(typeof entry.message).toBe('string');
              expect(entry).toHaveProperty('timestamp');
              expect(typeof entry.timestamp).toBe('string');
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 16 ─────────────────────────────────────────────────────
  /**
   * Feature: content-storyteller-gcp-foundation, Property 16: Upload size limit enforced
   *
   * For uploads >50MB, verify rejection with 413 status, no file stored, no Job created.
   *
   * Validates: Requirements 15.5
   */
  describe('Property 16: Upload size limit enforced', () => {
    it('oversized uploads are rejected with 413 and no side effects', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 50 * 1024 * 1024 + 1, max: 100 * 1024 * 1024 }),
          async (claimedSize) => {
            vi.clearAllMocks();
            mocks.resetDocIdCounter();

            // Send a request with a content-length header exceeding 50MB.
            // The upload-limiter middleware checks content-length before body parsing.
            const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
              const addr = server.address() as { port: number };
              const req = http.request(
                {
                  hostname: '127.0.0.1',
                  port: addr.port,
                  path: '/api/v1/upload',
                  method: 'POST',
                  headers: {
                    'content-length': claimedSize.toString(),
                    'content-type': 'multipart/form-data; boundary=----test',
                    'connection': 'close',
                  },
                },
                (res) => {
                  const chunks: Buffer[] = [];
                  res.on('data', (c) => chunks.push(c));
                  res.on('end', () => {
                    // Destroy the socket to prevent hanging
                    req.destroy();
                    resolve({ status: res.statusCode!, body: Buffer.concat(chunks).toString() });
                  });
                },
              );
              req.on('error', (err: NodeJS.ErrnoException) => {
                // ECONNRESET is expected when we destroy the socket
                if (err.code === 'ECONNRESET' || err.code === 'EPIPE') {
                  return;
                }
                reject(err);
              });
              req.end();
            });

            expect(res.status).toBe(413);

            const body = JSON.parse(res.body);
            expect(body.error).toBeDefined();
            expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');

            // No file should have been stored
            expect(mocks.mockFileSave).not.toHaveBeenCalled();

            // No Job should have been created
            expect(mocks.mockDocSet).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
