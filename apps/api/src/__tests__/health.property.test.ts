/**
 * Property-based tests for health endpoint security.
 *
 * Feature: vertex-ai-model-router, Property 6: Health endpoint response contains no secrets
 *
 * Validates: Requirements 8.4
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import http from 'http';

// ── Hoisted mocks ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const mockFileSave = vi.fn().mockResolvedValue(undefined);
  const mockBucketFile = vi.fn().mockReturnValue({ save: mockFileSave, download: vi.fn().mockResolvedValue([Buffer.from('data')]) });
  const mockBucket = vi.fn().mockReturnValue({ file: mockBucketFile });
  const mockDocSet = vi.fn().mockResolvedValue(undefined);
  const mockDocGet = vi.fn().mockResolvedValue({ exists: true, data: () => ({}) });
  const mockDocUpdate = vi.fn().mockResolvedValue(undefined);
  let docIdCounter = 0;
  const mockDoc = vi.fn().mockImplementation((id?: string) => ({
    id: id || `mock-doc-${++docIdCounter}`,
    set: mockDocSet, get: mockDocGet, update: mockDocUpdate,
  }));
  const mockCollection = vi.fn().mockReturnValue({ doc: mockDoc });
  const mockPublishMessage = vi.fn().mockResolvedValue('mock-message-id');
  const mockTopic = vi.fn().mockReturnValue({ publishMessage: mockPublishMessage });

  return {
    mockBucket, mockBucketFile, mockFileSave,
    mockCollection, mockDocSet, mockDocGet, mockDocUpdate, mockDoc,
    mockTopic, mockPublishMessage,
    resetDocIdCounter: () => { docIdCounter = 0; },
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
import { initModelRouter, _resetRouterForTesting } from '@content-storyteller/shared';
import { _resetConfigForTesting as resetGcpConfig } from '../config/gcp';

/** Lightweight HTTP request helper */
function makeRequest(
  server: http.Server,
  path: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const req = http.request(
      { hostname: '127.0.0.1', port: addr.port, path, method: 'GET' },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode!, body: Buffer.concat(chunks).toString() }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/** Sensitive key patterns that must not appear in health responses */
const SENSITIVE_KEY_PATTERNS = [
  /apikey/i, /api_key/i, /secret/i, /token/i,
  /credential/i, /password/i, /private.?key/i,
];

/** Recursively check an object for sensitive keys or values */
function findSecrets(
  obj: unknown,
  apiKeyValue: string | undefined,
  path = '',
): string[] {
  const violations: string[] = [];
  if (obj === null || obj === undefined) return violations;

  if (typeof obj === 'string') {
    if (apiKeyValue && apiKeyValue.length > 0 && obj.includes(apiKeyValue)) {
      violations.push(`Value at "${path}" contains the GEMINI_API_KEY`);
    }
    return violations;
  }

  if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const currentPath = path ? `${path}.${key}` : key;
      for (const pattern of SENSITIVE_KEY_PATTERNS) {
        if (pattern.test(key)) {
          violations.push(`Sensitive key "${key}" found at "${currentPath}"`);
        }
      }
      violations.push(...findSecrets(value, apiKeyValue, currentPath));
    }
  }

  return violations;
}

// ── Test suite ──────────────────────────────────────────────────────

describe('Health Endpoint Property Tests', () => {
  let server: http.Server;

  beforeEach(async () => {
    vi.clearAllMocks();
    _resetRouterForTesting();
    // Initialize router with all models available (default mock)
    await initModelRouter({ checkAvailability: async () => true });
    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
  });

  afterEach(async () => {
    _resetRouterForTesting();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  /**
   * Feature: vertex-ai-model-router, Property 6: Health endpoint response contains no secrets
   *
   * For any resolved model map and GCP config, the health endpoint response
   * should not contain any field whose key matches apiKey, secret, token,
   * credential, or password (case-insensitive), and should not contain any
   * string value that matches the GEMINI_API_KEY environment variable.
   *
   * **Validates: Requirements 8.4**
   */
  describe('Property 6: Health endpoint response contains no secrets', () => {
    it('health endpoint response contains no sensitive keys or API key values', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.stringOf(
            fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')),
            { minLength: 8, maxLength: 40 },
          ),
          async (fakeApiKey) => {
            // Set a fake API key in the environment
            const originalKey = process.env.GEMINI_API_KEY;
            process.env.GEMINI_API_KEY = fakeApiKey;

            // Reset GCP config so it picks up the new key
            resetGcpConfig();

            try {
              const res = await makeRequest(server, '/api/v1/health');
              expect(res.status).toBe(200);

              const body = JSON.parse(res.body);

              // Check for sensitive keys and leaked API key values
              const violations = findSecrets(body, fakeApiKey);
              expect(violations).toEqual([]);

              // Also verify the raw body doesn't contain the API key
              if (fakeApiKey.length > 0) {
                expect(res.body).not.toContain(fakeApiKey);
              }
            } finally {
              // Restore original env
              if (originalKey !== undefined) {
                process.env.GEMINI_API_KEY = originalKey;
              } else {
                delete process.env.GEMINI_API_KEY;
              }
              resetGcpConfig();
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
