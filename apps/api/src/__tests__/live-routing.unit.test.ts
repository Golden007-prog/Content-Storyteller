/**
 * Unit tests for live session model routing.
 *
 * Verifies that:
 * 1. generateAgentResponse uses getModel('live') and passes result to generateContent
 * 2. extractCreativeDirection uses getModel('text') and passes result to generateContent
 * 3. When getModel('live') throws ModelUnavailableError, processLiveInput re-throws it
 *
 * Validates: Requirements 5.1, 5.2, 5.4
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const getModelSpy = vi.fn();
  const generateContentSpy = vi.fn();

  // In-memory session store
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

  return {
    getModelSpy,
    generateContentSpy,
    mockDoc,
    mockCollection,
    sessionStore,
    resetStore: () => {
      sessionStore.clear();
      docIdCounter = 0;
    },
  };
});

// ── Module mocks ────────────────────────────────────────────────────

vi.mock('@content-storyteller/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@content-storyteller/shared')>();
  return {
    ...actual,
    getModel: mocks.getModelSpy,
  };
});

vi.mock('../services/genai', () => ({
  generateContent: mocks.generateContentSpy,
}));

vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => ({
    collection: mocks.mockCollection,
  })),
}));

vi.mock('../middleware/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  requestLogger: vi.fn(),
}));

vi.mock('../config/gcp', () => ({
  getGcpConfig: vi.fn().mockReturnValue({
    projectId: 'test-project',
    location: 'us-central1',
    firestoreDatabase: '(default)',
    uploadsBucket: 'test-uploads',
    assetsBucket: 'test-assets',
    pubsubTopic: 'test-topic',
    geminiApiKey: '',
    isCloud: false,
    authMode: 'adc-user',
  }),
  _resetConfigForTesting: vi.fn(),
  logGcpConfig: vi.fn(),
}));

// ── Imports under test (after mocks) ────────────────────────────────

import {
  createLiveSession,
  processLiveInput,
  endLiveSession,
} from '../services/live-session';
import { ModelUnavailableError } from '@content-storyteller/shared';

// ── Tests ───────────────────────────────────────────────────────────

describe('Live session model routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetStore();

    // Default: getModel returns a test model string
    mocks.getModelSpy.mockImplementation((slot: string) => {
      if (slot === 'live') return 'test-live-model';
      if (slot === 'text') return 'test-text-model';
      return `test-${slot}-model`;
    });

    // Default: generateContent returns a valid response
    mocks.generateContentSpy.mockResolvedValue('Agent response text');
  });

  // Req 5.1: Live conversation uses liveModel
  describe('conversation routing (generateAgentResponse)', () => {
    it('calls getModel("live") and passes result to generateContent', async () => {
      // Create a session first
      const session = await createLiveSession();

      // Process input triggers generateAgentResponse internally
      await processLiveInput(session.sessionId, 'Hello, help me brainstorm');

      // Verify getModel was called with 'live' for conversation
      expect(mocks.getModelSpy).toHaveBeenCalledWith('live');

      // Verify generateContent received the model from getModel('live')
      expect(mocks.generateContentSpy).toHaveBeenCalledWith(
        expect.any(String),
        'test-live-model',
      );
    });
  });

  // Req 5.2: Extraction uses textModel
  describe('extraction routing (extractCreativeDirection)', () => {
    it('calls getModel("text") and passes result to generateContent for extraction', async () => {
      // Setup generateContent to return valid JSON for extraction
      mocks.generateContentSpy.mockResolvedValue(
        JSON.stringify({
          suggestedPrompt: 'Create a campaign',
          suggestedPlatform: 'instagram_reel',
          suggestedTone: 'cinematic',
          keyThemes: ['innovation'],
          rawSummary: 'A brainstorm about innovation',
        }),
      );

      // Create session and add some transcript entries
      const session = await createLiveSession();
      await processLiveInput(session.sessionId, 'I want to create a campaign about innovation');

      // Clear mocks to isolate the endLiveSession calls
      vi.clearAllMocks();
      mocks.getModelSpy.mockImplementation((slot: string) => {
        if (slot === 'live') return 'test-live-model';
        if (slot === 'text') return 'test-text-model';
        return `test-${slot}-model`;
      });
      mocks.generateContentSpy.mockResolvedValue(
        JSON.stringify({
          suggestedPrompt: 'Create a campaign',
          suggestedPlatform: 'instagram_reel',
          suggestedTone: 'cinematic',
          keyThemes: ['innovation'],
          rawSummary: 'A brainstorm about innovation',
        }),
      );

      // End session triggers extractCreativeDirection internally
      await endLiveSession(session.sessionId);

      // Verify getModel was called with 'text' for extraction
      expect(mocks.getModelSpy).toHaveBeenCalledWith('text');

      // Verify generateContent received the text model
      expect(mocks.generateContentSpy).toHaveBeenCalledWith(
        expect.any(String),
        'test-text-model',
      );
    });
  });

  // Req 5.4: ModelUnavailableError propagates from processLiveInput
  describe('ModelUnavailableError handling', () => {
    it('re-throws ModelUnavailableError when getModel("live") throws', async () => {
      // Make getModel('live') throw ModelUnavailableError
      mocks.getModelSpy.mockImplementation((slot: string) => {
        if (slot === 'live') throw new ModelUnavailableError('live');
        return `test-${slot}-model`;
      });

      // Create a session
      const session = await createLiveSession();

      // processLiveInput should re-throw ModelUnavailableError
      await expect(
        processLiveInput(session.sessionId, 'Hello'),
      ).rejects.toThrow(ModelUnavailableError);
    });

    it('ModelUnavailableError has correct slot property', async () => {
      mocks.getModelSpy.mockImplementation((slot: string) => {
        if (slot === 'live') throw new ModelUnavailableError('live');
        return `test-${slot}-model`;
      });

      const session = await createLiveSession();

      try {
        await processLiveInput(session.sessionId, 'Hello');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ModelUnavailableError);
        expect((err as ModelUnavailableError).slot).toBe('live');
      }
    });
  });
});
