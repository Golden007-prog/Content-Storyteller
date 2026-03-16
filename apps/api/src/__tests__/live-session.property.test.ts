/**
 * Property-based tests for Live Agent Mode.
 *
 * Property 26: Live session start returns valid sessionId
 * Property 27: Live session transcript persisted on stop
 *
 * Validates: Requirements 25.2, 25.8
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import http from 'http';
import { LiveSessionStatus } from '@content-storyteller/shared';

// ── Hoisted mocks ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  let docIdCounter = 0;
  const resetDocIdCounter = () => { docIdCounter = 0; };

  // In-memory session store for realistic behavior
  const sessionStore = new Map<string, Record<string, unknown>>();
  const resetSessionStore = () => { sessionStore.clear(); };

  const mockDocSet = vi.fn().mockImplementation(async function (this: { id: string }, data: Record<string, unknown>) {
    sessionStore.set(this.id, { ...data });
  });
  const mockDocGet = vi.fn().mockImplementation(async function (this: { id: string }) {
    const data = sessionStore.get(this.id);
    return { exists: !!data, data: () => data };
  });
  const mockDocUpdate = vi.fn().mockImplementation(async function (this: { id: string }, updates: Record<string, unknown>) {
    const existing = sessionStore.get(this.id);
    if (existing) sessionStore.set(this.id, { ...existing, ...updates });
  });

  const mockDoc = vi.fn().mockImplementation((id?: string) => {
    const docId = id || `mock-session-${++docIdCounter}`;
    const docRef = {
      id: docId,
      set: mockDocSet.mockImplementation(async (data: Record<string, unknown>) => {
        sessionStore.set(docId, { ...data });
      }),
      get: mockDocGet.mockImplementation(async () => {
        const data = sessionStore.get(docId);
        return { exists: !!data, data: () => data };
      }),
      update: mockDocUpdate.mockImplementation(async (updates: Record<string, unknown>) => {
        const existing = sessionStore.get(docId);
        if (existing) sessionStore.set(docId, { ...existing, ...updates });
      }),
    };
    return docRef;
  });
  const mockCollection = vi.fn().mockReturnValue({ doc: mockDoc });

  // Mock for job-related collections (not used but needed for app import)
  const mockPublishMessage = vi.fn().mockResolvedValue('mock-message-id');
  const mockTopic = vi.fn().mockReturnValue({ publishMessage: mockPublishMessage });
  const mockBucket = vi.fn().mockReturnValue({
    file: vi.fn().mockReturnValue({
      save: vi.fn().mockResolvedValue(undefined),
      download: vi.fn().mockResolvedValue([Buffer.from('data')]),
      getSignedUrl: vi.fn().mockResolvedValue(['https://signed.example.com']),
    }),
  });

  return {
    mockDocSet, mockDocGet, mockDocUpdate, mockDoc, mockCollection,
    mockPublishMessage, mockTopic, mockBucket,
    resetDocIdCounter, resetSessionStore, sessionStore,
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

// Mock @google/genai to avoid real API calls
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: vi.fn().mockResolvedValue({
        text: '{"suggestedPrompt":"test","suggestedPlatform":"instagram_reel","suggestedTone":"cinematic","keyThemes":["test"],"rawSummary":"test summary"}',
      }),
    },
  })),
  Type: { STRING: 'STRING', OBJECT: 'OBJECT', NUMBER: 'NUMBER', INTEGER: 'INTEGER', BOOLEAN: 'BOOLEAN', ARRAY: 'ARRAY' },
}));

import { app } from '../index';

function makeRequest(
  server: http.Server,
  options: { method: string; path: string; body?: string },
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const headers: Record<string, string> = {};
    if (options.body != null) {
      headers['content-length'] = Buffer.byteLength(options.body).toString();
      headers['content-type'] = 'application/json';
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

describe('Live Agent Mode — Property Tests', () => {
  let server: http.Server;

  beforeEach(() => {
    server = app.listen(0);
  });

  afterEach(() => {
    server.close();
    mocks.resetDocIdCounter();
    mocks.resetSessionStore();
  });

  /**
   * Property 26: Live session start returns valid sessionId
   * For any start request, the response must contain a non-empty sessionId and active status.
   */
  it('Property 26: start always returns valid sessionId and active status', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (_n) => {
        mocks.resetDocIdCounter();
        mocks.resetSessionStore();

        const res = await makeRequest(server, {
          method: 'POST',
          path: '/api/v1/live/start',
        });

        expect(res.status).toBe(201);
        const data = JSON.parse(res.body);
        expect(data.sessionId).toBeTruthy();
        expect(typeof data.sessionId).toBe('string');
        expect(data.sessionId.length).toBeGreaterThan(0);
        expect(data.status).toBe(LiveSessionStatus.Active);
      }),
      { numRuns: 5 },
    );
  });

  /**
   * Property 27: Live session transcript persisted on stop
   * After sending N messages and stopping, the stop response must contain
   * all user messages in the transcript.
   */
  it('Property 27: transcript persisted on stop with all user messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0).map((s) => s.trim()), { minLength: 1, maxLength: 3 }),
        async (messages) => {
          mocks.resetDocIdCounter();
          mocks.resetSessionStore();

          // Start session
          const startRes = await makeRequest(server, {
            method: 'POST',
            path: '/api/v1/live/start',
          });
          const { sessionId } = JSON.parse(startRes.body);

          // Send each message
          for (const msg of messages) {
            await makeRequest(server, {
              method: 'POST',
              path: '/api/v1/live/input',
              body: JSON.stringify({ sessionId, text: msg }),
            });
          }

          // Stop session
          const stopRes = await makeRequest(server, {
            method: 'POST',
            path: '/api/v1/live/stop',
            body: JSON.stringify({ sessionId }),
          });

          expect(stopRes.status).toBe(200);
          const stopData = JSON.parse(stopRes.body);
          expect(stopData.sessionId).toBe(sessionId);
          expect(Array.isArray(stopData.transcript)).toBe(true);

          // Each user message should appear in transcript
          const userEntries = stopData.transcript.filter(
            (t: { role: string }) => t.role === 'user',
          );
          expect(userEntries.length).toBe(messages.length);

          for (let i = 0; i < messages.length; i++) {
            expect(userEntries[i].text).toBe(messages[i]);
          }
        },
      ),
      { numRuns: 5 },
    );
  });
});
