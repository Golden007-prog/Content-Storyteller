/**
 * Unit tests for the Trend API routes.
 *
 * Uses the EXACT same hoisted mocks pattern as trend-api.property.test.ts
 * (mock @google-cloud/storage, @google-cloud/firestore, @google-cloud/pubsub before importing app).
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 19.2, 19.4
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

vi.mock('@google/genai', () => {
  const mockGenerateContent = vi.fn().mockResolvedValue({
    text: JSON.stringify({
      summary: 'Stub trend summary for testing',
      trends: [
        {
          title: 'Stub Trend',
          keyword: 'stub',
          description: 'A stub trend for testing',
          momentumScore: 75,
          relevanceScore: 80,
          suggestedHashtags: ['#stub', '#test'],
          suggestedHook: 'Check out this stub trend',
          suggestedContentAngle: 'Testing angle',
          sourceLabels: ['inferred'],
          region: { scope: 'global' },
          platform: 'instagram_reels',
          freshnessLabel: 'Fresh',
        },
      ],
    }),
  });
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      models: { generateContent: mockGenerateContent },
    })),
    Type: { STRING: 'STRING', OBJECT: 'OBJECT', NUMBER: 'NUMBER', INTEGER: 'INTEGER', BOOLEAN: 'BOOLEAN', ARRAY: 'ARRAY' },
  };
});

vi.mock('@content-storyteller/shared', async () => {
  const actual = await vi.importActual('@content-storyteller/shared');
  return {
    ...actual,
    getModel: vi.fn().mockReturnValue('test-text-model'),
  };
});

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

/** Helper to build a valid TrendQuery body */
function validTrendBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    platform: 'instagram_reels',
    domain: 'tech',
    region: { scope: 'global' },
    ...overrides,
  });
}

// ── Test suite ──────────────────────────────────────────────────────

describe('Trend API Unit Tests', () => {
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

  // ── 1. Validation error messages and codes ──────────────────────────

  describe('POST /api/v1/trends/analyze — validation errors', () => {
    it('rejects invalid platform with INVALID_TREND_PLATFORM and descriptive message', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/trends/analyze',
        body: validTrendBody({ platform: 'tiktok' }),
        contentType: 'application/json',
      });

      expect(res.status).toBe(400);
      const data = JSON.parse(res.body);
      expect(data.error.code).toBe('INVALID_TREND_PLATFORM');
      expect(data.error.message).toContain('platform must be one of');
    });

    it('rejects missing domain with MISSING_DOMAIN', async () => {
      const body = JSON.stringify({
        platform: 'instagram_reels',
        region: { scope: 'global' },
      });

      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/trends/analyze',
        body,
        contentType: 'application/json',
      });

      expect(res.status).toBe(400);
      const data = JSON.parse(res.body);
      expect(data.error.code).toBe('MISSING_DOMAIN');
      expect(data.error.message).toContain('domain is required');
    });

    it('rejects empty string domain with MISSING_DOMAIN', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/trends/analyze',
        body: validTrendBody({ domain: '   ' }),
        contentType: 'application/json',
      });

      expect(res.status).toBe(400);
      const data = JSON.parse(res.body);
      expect(data.error.code).toBe('MISSING_DOMAIN');
    });

    it('rejects invalid region scope with INVALID_REGION', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/trends/analyze',
        body: validTrendBody({ region: { scope: 'city' } }),
        contentType: 'application/json',
      });

      expect(res.status).toBe(400);
      const data = JSON.parse(res.body);
      expect(data.error.code).toBe('INVALID_REGION');
      expect(data.error.message).toContain('region.scope must be one of');
    });

    it('rejects country scope with missing country with INVALID_REGION', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/trends/analyze',
        body: validTrendBody({ region: { scope: 'country' } }),
        contentType: 'application/json',
      });

      expect(res.status).toBe(400);
      const data = JSON.parse(res.body);
      expect(data.error.code).toBe('INVALID_REGION');
      expect(data.error.message).toContain('region.country is required');
    });

    it('rejects state_province scope with missing stateProvince with INVALID_REGION', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/trends/analyze',
        body: validTrendBody({ region: { scope: 'state_province', country: 'US' } }),
        contentType: 'application/json',
      });

      expect(res.status).toBe(400);
      const data = JSON.parse(res.body);
      expect(data.error.code).toBe('INVALID_REGION');
      expect(data.error.message).toContain('region.stateProvince is required');
    });

    it('rejects state_province scope with missing country with INVALID_REGION', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/trends/analyze',
        body: validTrendBody({ region: { scope: 'state_province' } }),
        contentType: 'application/json',
      });

      expect(res.status).toBe(400);
      const data = JSON.parse(res.body);
      expect(data.error.code).toBe('INVALID_REGION');
      expect(data.error.message).toContain('region.country is required');
    });

    it('rejects invalid timeWindow with INVALID_TIME_WINDOW', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/trends/analyze',
        body: validTrendBody({ timeWindow: '1y' }),
        contentType: 'application/json',
      });

      expect(res.status).toBe(400);
      const data = JSON.parse(res.body);
      expect(data.error.code).toBe('INVALID_TIME_WINDOW');
      expect(data.error.message).toContain('timeWindow must be one of');
    });
  });

  // ── 2. Firestore persistence on successful POST ─────────────────────

  describe('POST /api/v1/trends/analyze — Firestore persistence', () => {
    it('calls mockDocSet on successful analysis', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/trends/analyze',
        body: validTrendBody(),
        contentType: 'application/json',
      });

      expect(res.status).toBe(200);
      expect(mocks.mockDocSet).toHaveBeenCalledTimes(1);

      // Verify the persisted data contains expected fields
      const persistedData = mocks.mockDocSet.mock.calls[0][0];
      expect(persistedData.platform).toBe('instagram_reels');
      expect(persistedData.domain).toBe('tech');
      expect(persistedData.region).toEqual({ scope: 'global' });
      expect(persistedData.createdAt).toBeDefined();
      expect(typeof persistedData.createdAt).toBe('string');
    });

    it('returns a queryId in the response', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/trends/analyze',
        body: validTrendBody(),
        contentType: 'application/json',
      });

      expect(res.status).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.queryId).toBeTruthy();
      expect(typeof data.queryId).toBe('string');
    });
  });

  // ── 3. Analyzer integration (Gemini mocked) ────────────────────────

  describe('POST /api/v1/trends/analyze — analyzer', () => {
    it('returns a valid TrendAnalysisResult from the analyzer', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/trends/analyze',
        body: validTrendBody({ domain: 'fashion', platform: 'linkedin' }),
        contentType: 'application/json',
      });

      expect(res.status).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.platform).toBe('linkedin');
      expect(data.domain).toBe('fashion');
      expect(typeof data.summary).toBe('string');
      expect(data.summary.length).toBeGreaterThan(0);
      expect(Array.isArray(data.trends)).toBe(true);
      expect(data.trends.length).toBeGreaterThan(0);
      expect(data.trends[0].title).toBe('Stub Trend');
    });

    it('returns 500 when Firestore write fails (simulating service error)', async () => {
      mocks.mockDocSet.mockRejectedValueOnce(new Error('Firestore unavailable'));

      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/trends/analyze',
        body: validTrendBody(),
        contentType: 'application/json',
      });

      expect(res.status).toBe(500);
      const data = JSON.parse(res.body);
      expect(data.error).toBeDefined();
      expect(data.error.code).toBeDefined();
      expect(data.error.message).toBeDefined();
    });
  });

  // ── 4. Correlation ID on error responses ────────────────────────────

  describe('Error responses — correlation ID', () => {
    it('includes x-correlation-id header on 400 validation errors', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/trends/analyze',
        body: validTrendBody({ platform: 'invalid' }),
        contentType: 'application/json',
      });

      expect(res.status).toBe(400);
      expect(res.headers['x-correlation-id']).toBeDefined();
      expect(typeof res.headers['x-correlation-id']).toBe('string');
      expect((res.headers['x-correlation-id'] as string).length).toBeGreaterThan(0);
    });

    it('includes x-correlation-id header on 404 responses', async () => {
      mocks.mockDocGet.mockResolvedValueOnce({ exists: false, data: () => undefined });

      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/v1/trends/nonexistent-id',
      });

      expect(res.status).toBe(404);
      expect(res.headers['x-correlation-id']).toBeDefined();
      expect(typeof res.headers['x-correlation-id']).toBe('string');
    });

    it('includes x-correlation-id header on 500 errors', async () => {
      mocks.mockDocSet.mockRejectedValueOnce(new Error('Firestore down'));

      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/trends/analyze',
        body: validTrendBody(),
        contentType: 'application/json',
      });

      expect(res.status).toBe(500);
      expect(res.headers['x-correlation-id']).toBeDefined();
    });

    it('echoes back a provided correlation ID', async () => {
      const customCorrelationId = 'test-corr-id-12345';

      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/v1/trends/analyze',
        body: validTrendBody({ platform: 'bad' }),
        contentType: 'application/json',
        headers: { 'x-correlation-id': customCorrelationId },
      });

      expect(res.status).toBe(400);
      expect(res.headers['x-correlation-id']).toBe(customCorrelationId);
    });
  });

  // ── 5. GET /:queryId — returns stored result ────────────────────────

  describe('GET /api/v1/trends/:queryId — retrieval', () => {
    it('returns stored TrendAnalysisResult when found', async () => {
      const storedResult = {
        queryId: 'trend-query-abc',
        platform: 'x_twitter',
        domain: 'gaming',
        region: { scope: 'country', country: 'US' },
        generatedAt: '2025-01-01T00:00:00.000Z',
        summary: 'Gaming trends on X/Twitter in the US',
        trends: [
          {
            title: 'Esports Growth',
            keyword: 'esports',
            description: 'Esports viewership is surging',
            momentumScore: 85,
            relevanceScore: 90,
            suggestedHashtags: ['#esports', '#gaming'],
            suggestedHook: 'The esports revolution is here',
            suggestedContentAngle: 'Competitive gaming overview',
            sourceLabels: ['inferred'],
            region: { scope: 'country', country: 'US' },
            platform: 'x_twitter',
            freshnessLabel: 'Rising Fast',
          },
        ],
      };

      mocks.mockDocGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ ...storedResult, createdAt: new Date() }),
      });

      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/v1/trends/trend-query-abc',
      });

      expect(res.status).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.platform).toBe('x_twitter');
      expect(data.domain).toBe('gaming');
      expect(data.region.scope).toBe('country');
      expect(data.region.country).toBe('US');
      expect(data.summary).toContain('Gaming trends');
      expect(data.trends).toHaveLength(1);
      expect(data.trends[0].title).toBe('Esports Growth');
      expect(data.trends[0].momentumScore).toBe(85);
    });
  });

  // ── 6. GET /:queryId — returns 404 when not found ──────────────────

  describe('GET /api/v1/trends/:queryId — not found', () => {
    it('returns 404 with TREND_QUERY_NOT_FOUND for non-existent queryId', async () => {
      mocks.mockDocGet.mockResolvedValueOnce({ exists: false, data: () => undefined });

      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/v1/trends/does-not-exist',
      });

      expect(res.status).toBe(404);
      const data = JSON.parse(res.body);
      expect(data.error.code).toBe('TREND_QUERY_NOT_FOUND');
      expect(data.error.message).toContain('does-not-exist');
    });
  });
});
