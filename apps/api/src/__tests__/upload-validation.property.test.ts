/**
 * Property-based tests for upload validation.
 *
 * Property 21: Only allowlisted MIME types accepted
 * Property 22: Files over 50 MB rejected with 413
 *
 * Validates: Requirements 26.2, 26.3, 26.6
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import http from 'http';

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
    set: mockDocSet, get: mockDocGet, update: mockDocUpdate,
  }));
  const mockCollection = vi.fn().mockReturnValue({ doc: mockDoc });

  const mockPublishMessage = vi.fn().mockResolvedValue('mock-message-id');
  const mockTopic = vi.fn().mockReturnValue({ publishMessage: mockPublishMessage });

  return {
    mockFileSave, mockFileDownload, mockBucketFile, mockBucket,
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

function buildMultipartBody(
  fileName: string, fileContent: Buffer, mimeType: string,
): { body: Buffer; contentType: string } {
  const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
  const parts: Buffer[] = [];
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`));
  parts.push(fileContent);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

function makeRequest(
  server: http.Server,
  options: { method: string; path: string; headers?: Record<string, string>; body?: Buffer | string; contentType?: string },
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const headers: Record<string, string> = { ...options.headers };
    if (options.body != null) {
      if (!headers['content-length']) headers['content-length'] = Buffer.byteLength(options.body).toString();
      if (options.contentType && !headers['content-type']) headers['content-type'] = options.contentType;
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

describe('Upload Validation Property Tests', () => {
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

  // ── Property 21: Only allowlisted MIME types accepted ─────────────
  describe('Property 21: Only allowlisted MIME types accepted', () => {
    const ALLOWED = [
      'image/png', 'image/jpeg', 'image/webp', 'image/gif',
      'audio/mpeg', 'audio/wav', 'audio/webm',
      'video/mp4', 'video/webm', 'application/pdf',
    ];

    it('allowed MIME types are accepted with 201', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...ALLOWED),
          async (mimeType) => {
            vi.clearAllMocks();
            mocks.resetDocIdCounter();

            const { body, contentType } = buildMultipartBody('test.bin', Buffer.from('data'), mimeType);
            const res = await makeRequest(server, {
              method: 'POST', path: '/api/v1/upload', body, contentType,
            });
            expect(res.status).toBe(201);
            expect(mocks.mockFileSave).toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    });

    it('disallowed MIME types are rejected with 400 UNSUPPORTED_FILE_TYPE', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            'text/plain', 'text/html', 'application/json', 'application/xml',
            'application/zip', 'image/svg+xml', 'text/csv', 'application/octet-stream',
          ),
          async (mimeType) => {
            vi.clearAllMocks();
            mocks.resetDocIdCounter();

            const { body, contentType } = buildMultipartBody('test.bin', Buffer.from('data'), mimeType);
            const res = await makeRequest(server, {
              method: 'POST', path: '/api/v1/upload', body, contentType,
            });
            expect(res.status).toBe(400);
            const data = JSON.parse(res.body);
            expect(data.error.code).toBe('UNSUPPORTED_FILE_TYPE');
            expect(mocks.mockFileSave).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 22: Files over 50 MB rejected with 413 ──────────────
  describe('Property 22: Files over 50 MB rejected with 413', () => {
    it('oversized content-length is rejected with 413', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 50 * 1024 * 1024 + 1, max: 100 * 1024 * 1024 }),
          async (claimedSize) => {
            vi.clearAllMocks();
            mocks.resetDocIdCounter();

            const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
              const addr = server.address() as { port: number };
              const req = http.request(
                {
                  hostname: '127.0.0.1', port: addr.port, path: '/api/v1/upload', method: 'POST',
                  headers: {
                    'content-length': claimedSize.toString(),
                    'content-type': 'multipart/form-data; boundary=----test',
                    'connection': 'close',
                  },
                },
                (res) => {
                  const chunks: Buffer[] = [];
                  res.on('data', (c) => chunks.push(c));
                  res.on('end', () => { req.destroy(); resolve({ status: res.statusCode!, body: Buffer.concat(chunks).toString() }); });
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
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
