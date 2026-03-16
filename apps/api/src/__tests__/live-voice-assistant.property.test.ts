/**
 * Property-based tests for Live Agent Voice Assistant backend.
 *
 * Properties 1–7 test the generateAgentResponse function in live-session.ts:
 *   Property 1: Tool declaration is always present
 *   Property 2: Tool argument forwarding
 *   Property 3: Tool execution round-trip
 *   Property 4: Tool invocation recording
 *   Property 5: System instruction invariant
 *   Property 6: Audio modality in request configuration
 *   Property 7: Audio extraction and response shape
 *
 * Validates: Requirements 1.1, 2.1, 2.2, 2.3, 2.4, 2.6, 3.1, 3.2, 3.3, 4.1, 4.3, 4.4, 4.5
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// ── Hoisted mocks ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const mockGenerateContent = vi.fn();
  const mockAnalyzeTrends = vi.fn();
  const mockGetModel = vi.fn();
  const mockIsAlloyDbConfigured = vi.fn();
  const mockPoolQuery = vi.fn();
  const mockGetPool = vi.fn();

  // In-memory Firestore session store
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
    mockGenerateContent,
    mockAnalyzeTrends,
    mockGetModel,
    mockIsAlloyDbConfigured,
    mockPoolQuery,
    mockGetPool,
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

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent: mocks.mockGenerateContent },
  })),
  Type: {
    STRING: 'STRING',
    OBJECT: 'OBJECT',
    NUMBER: 'NUMBER',
    INTEGER: 'INTEGER',
    BOOLEAN: 'BOOLEAN',
    ARRAY: 'ARRAY',
  },
}));

vi.mock('@content-storyteller/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@content-storyteller/shared')>();
  return {
    ...actual,
    getModel: mocks.mockGetModel,
  };
});

vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => ({
    collection: mocks.mockCollection,
  })),
}));

vi.mock('../services/genai', () => ({
  generateContent: vi.fn().mockResolvedValue('mock genai response'),
}));

vi.mock('../services/trends/analyzer', () => ({
  analyzeTrends: mocks.mockAnalyzeTrends,
}));

vi.mock('../services/firestore', () => ({
  isAlloyDbConfigured: mocks.mockIsAlloyDbConfigured,
}));

vi.mock('../services/alloydb', () => ({
  getPool: mocks.mockGetPool,
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
    alloydbConnectionString: '',
  }),
  _resetConfigForTesting: vi.fn(),
  logGcpConfig: vi.fn(),
}));

// ── Import under test (after mocks) ────────────────────────────────

import {
  generateAgentResponse,
  FETCH_TRENDS_TOOL,
  LIVE_AGENT_SYSTEM_INSTRUCTION,
} from '../services/live-session';

// ── Helpers ─────────────────────────────────────────────────────────

/** Arbitrary for a single TranscriptEntry */
const transcriptEntryArb = fc.record({
  role: fc.constantFrom('user' as const, 'agent' as const),
  text: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
  timestamp: fc.constant(new Date().toISOString()),
});

/** Arbitrary for a non-empty transcript (at least one user entry) */
const transcriptArb = fc
  .array(transcriptEntryArb, { minLength: 1, maxLength: 5 })
  .filter((arr) => arr.some((e) => e.role === 'user'));

/** Arbitrary for valid platform strings */
const platformArb = fc.constantFrom(
  'instagram_reels',
  'x_twitter',
  'linkedin',
  'all_platforms',
);

/** Build a simple text-only Gemini response mock */
function makeTextResponse(text: string) {
  return {
    text,
    functionCalls: null,
    candidates: [{ content: { parts: [{ text }] } }],
  };
}

/** Build a Gemini response with a functionCall */
function makeFunctionCallResponse(platform: string) {
  return {
    text: null,
    functionCalls: [
      {
        name: 'fetch_platform_trends',
        args: { platform },
      },
    ],
    candidates: [
      {
        content: {
          parts: [
            {
              functionCall: {
                name: 'fetch_platform_trends',
                args: { platform },
              },
            },
          ],
        },
      },
    ],
  };
}

/** Build a Gemini response with inline audio data */
function makeAudioResponse(text: string, audioData: string) {
  return {
    text,
    functionCalls: null,
    candidates: [
      {
        content: {
          parts: [
            { text },
            { inlineData: { mimeType: 'audio/pcm', data: audioData } },
          ],
        },
      },
    ],
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Live Voice Assistant — Backend Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetStore();

    mocks.mockGetModel.mockReturnValue('gemini-live-2.5-flash-native-audio');
    mocks.mockIsAlloyDbConfigured.mockReturnValue(false);
    mocks.mockGetPool.mockReturnValue({ query: mocks.mockPoolQuery });
    mocks.mockPoolQuery.mockResolvedValue({ rows: [] });

    // Default: return a simple text response
    mocks.mockGenerateContent.mockResolvedValue(
      makeTextResponse('Hello! How can I help you today?'),
    );

    mocks.mockAnalyzeTrends.mockResolvedValue({
      trends: [],
      platform: 'all_platforms',
      domain: 'tech',
      summary: 'No trends found',
    });
  });

  /**
   * Feature: live-agent-voice-assistant, Property 1: Tool declaration is always present
   *
   * For any user input, when generateAgentResponse is called, the generateContent
   * call to Gemini must include tools containing fetch_platform_trends function declaration.
   *
   * **Validates: Requirements 1.1**
   */
  it('Property 1: Tool declaration is always present in Gemini requests', async () => {
    await fc.assert(
      fc.asyncProperty(transcriptArb, fc.uuid(), async (transcript, sessionId) => {
        vi.clearAllMocks();
        mocks.mockGenerateContent.mockResolvedValue(
          makeTextResponse('Creative response here'),
        );

        await generateAgentResponse(transcript, sessionId);

        expect(mocks.mockGenerateContent).toHaveBeenCalled();
        const callArgs = mocks.mockGenerateContent.mock.calls[0][0];

        // Verify tools array is present and contains fetch_platform_trends
        expect(callArgs.config).toBeDefined();
        expect(callArgs.config.tools).toBeDefined();
        expect(Array.isArray(callArgs.config.tools)).toBe(true);

        const toolDeclarations = callArgs.config.tools.flatMap(
          (t: any) => t.functionDeclarations || [],
        );
        const fetchTrendsTool = toolDeclarations.find(
          (d: any) => d.name === 'fetch_platform_trends',
        );
        expect(fetchTrendsTool).toBeDefined();
        expect(fetchTrendsTool.parameters.properties.platform).toBeDefined();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: live-agent-voice-assistant, Property 2: Tool argument forwarding
   *
   * When Gemini returns a functionCall for fetch_platform_trends with a platform argument,
   * analyzeTrends must be called with that exact platform and domain 'tech'.
   *
   * **Validates: Requirements 2.1, 2.2**
   */
  it('Property 2: Tool argument forwarding passes platform to analyzeTrends', async () => {
    await fc.assert(
      fc.asyncProperty(
        transcriptArb,
        fc.uuid(),
        platformArb,
        async (transcript, sessionId, platform) => {
          vi.clearAllMocks();

          // First call: Gemini returns a function call
          mocks.mockGenerateContent
            .mockResolvedValueOnce(makeFunctionCallResponse(platform))
            .mockResolvedValueOnce(makeTextResponse('Here are the trends...'));

          mocks.mockAnalyzeTrends.mockResolvedValue({
            trends: [],
            platform,
            domain: 'tech',
            summary: 'Trends summary',
          });

          await generateAgentResponse(transcript, sessionId);

          expect(mocks.mockAnalyzeTrends).toHaveBeenCalledTimes(1);
          const trendCallArgs = mocks.mockAnalyzeTrends.mock.calls[0][0];
          expect(trendCallArgs.platform).toBe(platform);
          expect(trendCallArgs.domain).toBe('tech');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: live-agent-voice-assistant, Property 3: Tool execution round-trip
   *
   * When analyzeTrends succeeds, the result is fed back to Gemini as a functionResponse,
   * and the final text is extracted from the subsequent Gemini reply.
   *
   * **Validates: Requirements 2.3, 2.4**
   */
  it('Property 3: Tool execution round-trip feeds functionResponse back to Gemini', async () => {
    await fc.assert(
      fc.asyncProperty(
        transcriptArb,
        fc.uuid(),
        platformArb,
        async (transcript, sessionId, platform) => {
          vi.clearAllMocks();

          const trendResult = {
            trends: [{ title: 'Test Trend' }],
            platform,
            domain: 'tech',
            summary: 'Trending now',
          };

          // First call: function call; second call: final text
          mocks.mockGenerateContent
            .mockResolvedValueOnce(makeFunctionCallResponse(platform))
            .mockResolvedValueOnce(makeTextResponse('Based on the trends...'));

          mocks.mockAnalyzeTrends.mockResolvedValue(trendResult);

          const result = await generateAgentResponse(transcript, sessionId);

          // Verify second generateContent call was made (the round-trip)
          expect(mocks.mockGenerateContent).toHaveBeenCalledTimes(2);

          // Verify the second call includes functionResponse
          const secondCallArgs = mocks.mockGenerateContent.mock.calls[1][0];
          const allParts = secondCallArgs.contents.flatMap((c: any) => c.parts || []);
          const functionResponsePart = allParts.find(
            (p: any) => p.functionResponse,
          );
          expect(functionResponsePart).toBeDefined();
          expect(functionResponsePart.functionResponse.name).toBe(
            'fetch_platform_trends',
          );

          // Verify final text is extracted
          expect(result.agentText).toBe('Based on the trends...');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: live-agent-voice-assistant, Property 4: Tool invocation recording
   *
   * For any tool invocation (success or failure), recordToolInvocation is called
   * with tool name 'fetch_platform_trends'.
   *
   * **Validates: Requirements 2.6**
   */
  it('Property 4: Tool invocation recording for success and failure', async () => {
    await fc.assert(
      fc.asyncProperty(
        transcriptArb,
        fc.uuid(),
        platformArb,
        fc.boolean(),
        async (transcript, sessionId, platform, shouldSucceed) => {
          vi.clearAllMocks();

          // Enable AlloyDB so recordToolInvocation actually runs
          mocks.mockIsAlloyDbConfigured.mockReturnValue(true);
          mocks.mockPoolQuery.mockResolvedValue({ rows: [] });

          mocks.mockGenerateContent
            .mockResolvedValueOnce(makeFunctionCallResponse(platform))
            .mockResolvedValueOnce(makeTextResponse('Response after tool'));

          if (shouldSucceed) {
            mocks.mockAnalyzeTrends.mockResolvedValue({
              trends: [],
              platform,
              domain: 'tech',
              summary: 'Summary',
            });
          } else {
            mocks.mockAnalyzeTrends.mockRejectedValue(
              new Error('Trend fetch failed'),
            );
          }

          await generateAgentResponse(transcript, sessionId);

          // Verify recordToolInvocation was called via pool.query
          // The INSERT INTO tool_invocations query should have been called
          expect(mocks.mockPoolQuery).toHaveBeenCalled();
          const insertCall = mocks.mockPoolQuery.mock.calls.find(
            (call: any[]) =>
              typeof call[0] === 'string' &&
              call[0].includes('tool_invocations'),
          );
          expect(insertCall).toBeDefined();

          // Verify tool name is 'fetch_platform_trends'
          const params = insertCall![1] as any[];
          expect(params[1]).toBe('fetch_platform_trends');

          // Verify status matches success/failure
          const expectedStatus = shouldSucceed ? 'completed' : 'failed';
          expect(params[4]).toBe(expectedStatus);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: live-agent-voice-assistant, Property 5: System instruction invariant
   *
   * For any Gemini request, the systemInstruction must contain the AI Creative Director directive.
   *
   * **Validates: Requirements 3.1, 3.2, 3.3**
   */
  it('Property 5: System instruction invariant in all Gemini requests', async () => {
    await fc.assert(
      fc.asyncProperty(transcriptArb, fc.uuid(), async (transcript, sessionId) => {
        vi.clearAllMocks();
        mocks.mockGenerateContent.mockResolvedValue(
          makeTextResponse('Creative direction response'),
        );

        await generateAgentResponse(transcript, sessionId);

        expect(mocks.mockGenerateContent).toHaveBeenCalled();

        // Check every generateContent call has the system instruction
        for (const call of mocks.mockGenerateContent.mock.calls) {
          const callArgs = call[0];
          expect(callArgs.config).toBeDefined();
          expect(callArgs.config.systemInstruction).toBe(
            LIVE_AGENT_SYSTEM_INSTRUCTION,
          );
          // Verify it contains the AI Creative Director directive
          expect(callArgs.config.systemInstruction).toContain(
            'AI Creative Director',
          );
          expect(callArgs.config.systemInstruction).toContain(
            'fetch_platform_trends',
          );
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: live-agent-voice-assistant, Property 6: Audio modality in request configuration
   *
   * For any Gemini request, responseModalities must include 'AUDIO'.
   *
   * **Validates: Requirements 4.1**
   */
  it('Property 6: Audio modality is always included in request configuration', async () => {
    await fc.assert(
      fc.asyncProperty(transcriptArb, fc.uuid(), async (transcript, sessionId) => {
        vi.clearAllMocks();
        mocks.mockGenerateContent.mockResolvedValue(
          makeTextResponse('Audio-enabled response'),
        );

        await generateAgentResponse(transcript, sessionId);

        expect(mocks.mockGenerateContent).toHaveBeenCalled();

        // Check every generateContent call includes AUDIO modality
        for (const call of mocks.mockGenerateContent.mock.calls) {
          const callArgs = call[0];
          expect(callArgs.config).toBeDefined();
          expect(callArgs.config.responseModalities).toBeDefined();
          expect(Array.isArray(callArgs.config.responseModalities)).toBe(true);
          expect(callArgs.config.responseModalities).toContain('AUDIO');
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: live-agent-voice-assistant, Property 7: Audio extraction and response shape
   *
   * When Gemini returns inline audio data, audioBase64 should be non-null.
   * When Gemini returns no audio, audioBase64 should be null.
   *
   * **Validates: Requirements 4.3, 4.4, 4.5**
   */
  it('Property 7: Audio extraction and response shape', async () => {
    await fc.assert(
      fc.asyncProperty(
        transcriptArb,
        fc.uuid(),
        fc.boolean(),
        fc.base64String({ minLength: 4, maxLength: 200 }),
        async (transcript, sessionId, hasAudio, audioData) => {
          vi.clearAllMocks();

          if (hasAudio) {
            mocks.mockGenerateContent.mockResolvedValue(
              makeAudioResponse('Response with audio', audioData),
            );
          } else {
            mocks.mockGenerateContent.mockResolvedValue(
              makeTextResponse('Response without audio'),
            );
          }

          const result = await generateAgentResponse(transcript, sessionId);

          // agentText should always be populated
          expect(result.agentText).toBeTruthy();
          expect(typeof result.agentText).toBe('string');

          if (hasAudio) {
            // audioBase64 should be non-null when audio data is present
            expect(result.audioBase64).not.toBeNull();
            expect(result.audioBase64).toBe(audioData);
          } else {
            // audioBase64 should be null when no audio data
            expect(result.audioBase64).toBeNull();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
