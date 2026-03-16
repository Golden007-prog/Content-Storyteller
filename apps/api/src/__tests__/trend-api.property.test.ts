/**
 * Property-based tests for the Trend API routes.
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

// ── Constants ───────────────────────────────────────────────────────

const VALID_PLATFORMS = ['instagram_reels', 'x_twitter', 'linkedin', 'all_platforms'];
const VALID_TIME_WINDOWS = ['24h', '7d', '30d'];
const DOMAIN_PRESETS = ['tech', 'fashion', 'finance', 'fitness', 'education', 'gaming', 'startup'];


// ── Test suite ──────────────────────────────────────────────────────

describe('Trend API Property Tests', () => {
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

  // ── Property 4 ──────────────────────────────────────────────────────
  /**
   * Feature: trend-analyzer, Property 4: Invalid TrendQuery rejection
   *
   * For any POST request to /api/v1/trends/analyze containing an invalid
   * platform, empty/missing domain, invalid region, or unsupported timeWindow,
   * the API shall reject with HTTP 400 and the appropriate error code.
   *
   * Validates: Requirements 3.3, 3.4, 7.2, 7.3, 7.4, 7.5, 20.1, 20.2, 20.3, 20.4
   */
  describe('Property 4: Invalid TrendQuery rejection', () => {
    it('invalid platform is rejected with INVALID_TREND_PLATFORM', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 30 }).filter(
            (s) => !VALID_PLATFORMS.includes(s),
          ),
          async (invalidPlatform) => {
            const body = JSON.stringify({
              platform: invalidPlatform,
              domain: 'tech',
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
            expect(data.error.code).toBe('INVALID_TREND_PLATFORM');
          },
        ),
        { numRuns: 100 },
      );
    });

    it('empty or missing domain is rejected with MISSING_DOMAIN', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.constantFrom('', undefined, null, '   '),
          async (invalidDomain) => {
            const bodyObj: Record<string, unknown> = {
              platform: 'instagram_reels',
              region: { scope: 'global' },
            };
            if (invalidDomain !== undefined) {
              bodyObj.domain = invalidDomain;
            }
            const body = JSON.stringify(bodyObj);

            const res = await makeRequest(server, {
              method: 'POST',
              path: '/api/v1/trends/analyze',
              body,
              contentType: 'application/json',
            });

            expect(res.status).toBe(400);
            const data = JSON.parse(res.body);
            expect(data.error.code).toBe('MISSING_DOMAIN');
          },
        ),
        { numRuns: 100 },
      );
    });

    it('country scope with missing country is rejected with INVALID_REGION', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.constantFrom(undefined, '', '   '),
          async (missingCountry) => {
            const region: Record<string, unknown> = { scope: 'country' };
            if (missingCountry !== undefined) {
              region.country = missingCountry;
            }
            const body = JSON.stringify({
              platform: 'instagram_reels',
              domain: 'tech',
              region,
            });

            const res = await makeRequest(server, {
              method: 'POST',
              path: '/api/v1/trends/analyze',
              body,
              contentType: 'application/json',
            });

            expect(res.status).toBe(400);
            const data = JSON.parse(res.body);
            expect(data.error.code).toBe('INVALID_REGION');
          },
        ),
        { numRuns: 100 },
      );
    });

    it('state_province scope with missing stateProvince is rejected with INVALID_REGION', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.constantFrom(undefined, '', '   '),
          async (missingStateProvince) => {
            const region: Record<string, unknown> = {
              scope: 'state_province',
              country: 'US',
            };
            if (missingStateProvince !== undefined) {
              region.stateProvince = missingStateProvince;
            }
            const body = JSON.stringify({
              platform: 'instagram_reels',
              domain: 'tech',
              region,
            });

            const res = await makeRequest(server, {
              method: 'POST',
              path: '/api/v1/trends/analyze',
              body,
              contentType: 'application/json',
            });

            expect(res.status).toBe(400);
            const data = JSON.parse(res.body);
            expect(data.error.code).toBe('INVALID_REGION');
          },
        ),
        { numRuns: 100 },
      );
    });

    it('invalid timeWindow is rejected with INVALID_TIME_WINDOW', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }).filter(
            (s) => !VALID_TIME_WINDOWS.includes(s),
          ),
          async (invalidTimeWindow) => {
            const body = JSON.stringify({
              platform: 'instagram_reels',
              domain: 'tech',
              region: { scope: 'global' },
              timeWindow: invalidTimeWindow,
            });

            const res = await makeRequest(server, {
              method: 'POST',
              path: '/api/v1/trends/analyze',
              body,
              contentType: 'application/json',
            });

            expect(res.status).toBe(400);
            const data = JSON.parse(res.body);
            expect(data.error.code).toBe('INVALID_TIME_WINDOW');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 5 ──────────────────────────────────────────────────────
  /**
   * Feature: trend-analyzer, Property 5: Valid TrendQuery acceptance
   *
   * For any POST request with a valid TrendPlatform, non-empty domain,
   * valid region, and optional valid timeWindow, the API shall return
   * HTTP 200 with a TrendAnalysisResult.
   *
   * Validates: Requirements 7.1, 20.5
   */
  describe('Property 5: Valid TrendQuery acceptance', () => {
    it('valid TrendQuery returns 200 with TrendAnalysisResult', () => {
      const validRegionArb = fc.oneof(
        fc.constant({ scope: 'global' as const }),
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0).map(
          (country) => ({ scope: 'country' as const, country }),
        ),
        fc.tuple(
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        ).map(([country, stateProvince]) => ({
          scope: 'state_province' as const,
          country,
          stateProvince,
        })),
      );

      return fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...VALID_PLATFORMS),
          fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
          validRegionArb,
          fc.option(fc.constantFrom(...VALID_TIME_WINDOWS), { nil: undefined }),
          async (platform, domain, region, timeWindow) => {
            vi.clearAllMocks();
            mocks.resetDocIdCounter();

            const bodyObj: Record<string, unknown> = { platform, domain, region };
            if (timeWindow !== undefined) {
              bodyObj.timeWindow = timeWindow;
            }

            const res = await makeRequest(server, {
              method: 'POST',
              path: '/api/v1/trends/analyze',
              body: JSON.stringify(bodyObj),
              contentType: 'application/json',
            });

            expect(res.status).toBe(200);
            const data = JSON.parse(res.body);

            // Verify TrendAnalysisResult shape
            expect(data.queryId).toBeTruthy();
            expect(typeof data.queryId).toBe('string');
            expect(data.platform).toBe(platform);
            expect(data.domain).toBe(domain);
            expect(data.region.scope).toBe(region.scope);
            expect(typeof data.summary).toBe('string');
            expect(data.summary.length).toBeGreaterThan(0);
            expect(Array.isArray(data.trends)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 7 ──────────────────────────────────────────────────────
  /**
   * Feature: trend-analyzer, Property 7: Non-existent queryId returns 404
   *
   * For any randomly generated UUID, GET /api/v1/trends/:uuid shall
   * return 404 with TREND_QUERY_NOT_FOUND.
   *
   * Validates: Requirements 8.2
   */
  describe('Property 7: Non-existent queryId returns 404', () => {
    it('random UUID returns 404 TREND_QUERY_NOT_FOUND', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          async (queryId) => {
            vi.clearAllMocks();
            mocks.resetDocIdCounter();

            // Mock Firestore doc.get() to return { exists: false } for trendQueries lookups
            mocks.mockDocGet.mockResolvedValue({ exists: false, data: () => undefined });

            const res = await makeRequest(server, {
              method: 'GET',
              path: `/api/v1/trends/${queryId}`,
            });

            expect(res.status).toBe(404);
            const data = JSON.parse(res.body);
            expect(data.error.code).toBe('TREND_QUERY_NOT_FOUND');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 17 ─────────────────────────────────────────────────────
  /**
   * Feature: trend-analyzer, Property 17: Domain presets and custom strings accepted
   *
   * For any of the 7 domain preset values or any non-empty custom string,
   * the API shall accept it as a valid domain in a TrendQuery.
   *
   * Validates: Requirements 2.2, 18.2, 18.3
   */
  describe('Property 17: Domain presets and custom strings accepted', () => {
    it('all 7 domain presets and random custom strings are accepted with 200', () => {
      const domainArb = fc.oneof(
        fc.constantFrom(...DOMAIN_PRESETS),
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
      );

      return fc.assert(
        fc.asyncProperty(
          domainArb,
          async (domain) => {
            vi.clearAllMocks();
            mocks.resetDocIdCounter();

            const body = JSON.stringify({
              platform: 'instagram_reels',
              domain,
              region: { scope: 'global' },
            });

            const res = await makeRequest(server, {
              method: 'POST',
              path: '/api/v1/trends/analyze',
              body,
              contentType: 'application/json',
            });

            expect(res.status).toBe(200);
            const data = JSON.parse(res.body);
            expect(data.domain).toBe(domain);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
