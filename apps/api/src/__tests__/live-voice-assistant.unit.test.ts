/**
 * Unit tests for live route audioBase64 handling.
 *
 * Verifies that:
 * 1. When processLiveInput returns non-null audioBase64, the /input endpoint includes it in the response
 * 2. When processLiveInput returns null audioBase64, the /input endpoint returns audioBase64 as null
 *
 * Validates: Requirements 4.4, 4.5
 */
import http from 'http';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const sessionStore = new Map<string, Record<string, unknown>>();
  let docIdCounter = 0;

  const mockDoc = vi.fn().mockImplementation((id?: string) => {
    const docId = id || `mock-session-${++docIdCounter}`;
    return {
      id: docId,
      set: vi.fn().mockImplementation(async (data: Record<string, unknown>) => {
        sessionStore.set(docId, { ...data });
      }),
      get: vi.fn().mockImplementation(async () => {
        const data = sessionStore.get(docId);
        return { exists: !!data, data: () => data };
      }),
      update: vi.fn().mockImplementation(async (updates: Record<string, unknown>) => {
        const existing = sessionStore.get(docId);
        if (existing) sessionStore.set(docId, { ...existing, ...updates });
      }),
    };
  });

  const mockCollection = vi.fn().mockReturnValue({ doc: mockDoc });
  const mockGenaiGenerateContent = vi.fn();

  return {
    mockDoc,
    mockCollection,
    mockGenaiGenerateContent,
    sessionStore,
    resetStore: () => {
      sessionStore.clear();
      docIdCounter = 0;
    },
  };
});

// ── Module mocks ────────────────────────────────────────────────────

vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => ({
    collection: mocks.mockCollection,
  })),
}));

vi.mock('@google-cloud/storage', () => ({
  Storage: vi.fn().mockImplementation(() => ({
    bucket: vi.fn().mockReturnValue({
      file: vi.fn().mockReturnValue({
        save: vi.fn().mockResolvedValue(undefined),
        download: vi.fn().mockResolvedValue([Buffer.from('data')]),
        getSignedUrl: vi.fn().mockResolvedValue(['https://signed.example.com']),
      }),
    }),
  })),
}));

vi.mock('@google-cloud/pubsub', () => ({
  PubSub: vi.fn().mockImplementation(() => ({
    topic: vi.fn().mockReturnValue({ publishMessage: vi.fn().mockResolvedValue('mock-msg-id') }),
  })),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: mocks.mockGenaiGenerateContent,
    },
  })),
  Type: { STRING: 'STRING', OBJECT: 'OBJECT', NUMBER: 'NUMBER', INTEGER: 'INTEGER', BOOLEAN: 'BOOLEAN', ARRAY: 'ARRAY' },
}));

// ── Import app after mocks ──────────────────────────────────────────

import { app } from '../index';

// ── HTTP request helper ─────────────────────────────────────────────

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

// ── Tests ───────────────────────────────────────────────────────────

describe('Live route audioBase64 handling', () => {
  let server: http.Server;

  beforeEach(() => {
    mocks.resetStore();
    server = app.listen(0);
  });

  afterEach(() => {
    server.close();
  });

  // Req 4.4: Non-null audioBase64 is forwarded in response
  it('returns non-null audioBase64 when Gemini provides inline audio data', async () => {
    const audioData = 'dGVzdC1hdWRpby1kYXRh'; // base64 for "test-audio-data"

    mocks.mockGenaiGenerateContent.mockResolvedValue({
      text: 'Here is your creative direction',
      functionCalls: null,
      candidates: [{
        content: {
          parts: [
            { text: 'Here is your creative direction' },
            { inlineData: { mimeType: 'audio/pcm', data: audioData } },
          ],
        },
      }],
    });

    // 1. Start a session
    const startRes = await makeRequest(server, {
      method: 'POST',
      path: '/api/v1/live/start',
    });
    expect(startRes.status).toBe(201);
    const { sessionId } = JSON.parse(startRes.body);

    // 2. Send input
    const inputRes = await makeRequest(server, {
      method: 'POST',
      path: '/api/v1/live/input',
      body: JSON.stringify({ sessionId, text: 'Tell me about trends' }),
    });
    expect(inputRes.status).toBe(200);

    // 3. Verify audioBase64 is present and matches
    const inputBody = JSON.parse(inputRes.body);
    expect(inputBody.audioBase64).toBe(audioData);
    expect(inputBody.agentText).toBeTruthy();
    expect(inputBody.sessionId).toBe(sessionId);
  });

  // Req 4.5: null audioBase64 when Gemini provides no audio
  it('returns audioBase64 as null when Gemini provides no audio data', async () => {
    mocks.mockGenaiGenerateContent.mockResolvedValue({
      text: 'Text-only response',
      functionCalls: null,
      candidates: [{
        content: {
          parts: [{ text: 'Text-only response' }],
        },
      }],
    });

    // 1. Start a session
    const startRes = await makeRequest(server, {
      method: 'POST',
      path: '/api/v1/live/start',
    });
    expect(startRes.status).toBe(201);
    const { sessionId } = JSON.parse(startRes.body);

    // 2. Send input
    const inputRes = await makeRequest(server, {
      method: 'POST',
      path: '/api/v1/live/input',
      body: JSON.stringify({ sessionId, text: 'Hello there' }),
    });
    expect(inputRes.status).toBe(200);

    // 3. Verify audioBase64 is null
    const inputBody = JSON.parse(inputRes.body);
    expect(inputBody.audioBase64).toBeNull();
    expect(inputBody.agentText).toBeTruthy();
    expect(inputBody.sessionId).toBe(sessionId);
  });
});
