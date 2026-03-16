import { Firestore } from '@google-cloud/firestore';
import {
  LiveSession,
  LiveSessionStatus,
  TranscriptEntry,
  ExtractedCreativeDirection,
  getModel,
  ModelUnavailableError,
  TrendPlatform,
  TrendItem,
} from '@content-storyteller/shared';
import type { TrendDomain, TrendQuery } from '@content-storyteller/shared';
import { GoogleGenAI, Type } from '@google/genai';
import { logger } from '../middleware/logger';
import { getGcpConfig } from '../config/gcp';
import { generateContent } from './genai';
import { analyzeTrends } from './trends/analyzer';
import { isAlloyDbConfigured } from './firestore';
import { getPool } from './alloydb';

export const FETCH_TRENDS_TOOL = {
  functionDeclarations: [{
    name: 'fetch_platform_trends',
    description: 'Fetch current trending topics for a given social media platform.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        platform: {
          type: Type.STRING,
          description: 'Target platform: instagram_reels, x_twitter, linkedin, or all_platforms',
        },
      },
      required: ['platform'],
    },
  }],
};

export const LIVE_AGENT_SYSTEM_INSTRUCTION =
  `You are an AI Creative Director and Trend Analyst assistant for Content Storyteller — a multimodal AI platform that transforms ideas into polished marketing assets.

Your role:
- Help users brainstorm content ideas, creative direction, and marketing strategies
- Analyze trends across Instagram Reels, X/Twitter, and LinkedIn when asked
- Suggest content angles, hooks, hashtags, tones, and platform-specific strategies
- Guide users toward a clear creative brief they can use to generate content packages

Personality:
- Warm, enthusiastic, and knowledgeable — like a creative agency partner on a call
- Keep responses conversational and concise (2-4 sentences max unless the user asks for detail)
- Use specific, actionable suggestions rather than generic advice
- Reference current trends and platform best practices

When users ask about trends:
- Use the fetch_platform_trends tool to get real data
- Present trends in a conversational way with specific hashtags, hooks, and content angles
- Suggest how the user can leverage each trend for their specific needs

When users describe what they want to create:
- Ask clarifying questions about target audience, platform, and tone
- Suggest specific creative directions with examples
- Help them refine their idea into a clear brief

Always stay focused on content creation, marketing, and creative strategy. Be specific and actionable.`;

function getDb(): Firestore {
  const cfg = getGcpConfig();
  return new Firestore({ projectId: cfg.projectId, databaseId: cfg.firestoreDatabase });
}

function liveSessions() {
  return getDb().collection('liveSessions');
}

// ── AlloyDB persistence helpers (best-effort) ──────────────────────

/**
 * Persist a completed live session to AlloyDB.
 * Writes to live_agent_sessions and live_agent_messages tables.
 * Best-effort — errors are logged but never thrown.
 */
export async function persistSessionToAlloyDb(
  sessionId: string,
  messages: TranscriptEntry[],
  extractedDirection?: ExtractedCreativeDirection,
): Promise<void> {
  if (!isAlloyDbConfigured()) return;
  try {
    const pool = getPool();

    // Upsert session record
    await pool.query(
      `INSERT INTO live_agent_sessions (session_id, status, extracted_direction, ended_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (session_id) DO UPDATE SET
         status = EXCLUDED.status,
         extracted_direction = EXCLUDED.extracted_direction,
         ended_at = EXCLUDED.ended_at`,
      [
        sessionId,
        'ended',
        extractedDirection ? JSON.stringify(extractedDirection) : null,
      ],
    );

    // Insert each message
    for (const msg of messages) {
      await pool.query(
        `INSERT INTO live_agent_messages (session_id, role, text, created_at)
         VALUES ($1, $2, $3, $4)`,
        [sessionId, msg.role, msg.text, msg.timestamp ? new Date(msg.timestamp) : new Date()],
      );
    }
  } catch (err) {
    logger.error('[LiveSession] AlloyDB persistSession failed (best-effort)', {
      sessionId,
      error: (err as Error).message,
    });
  }
}

/**
 * Record a tool invocation to AlloyDB tool_invocations table.
 * Best-effort — errors are logged but never thrown.
 */
export async function recordToolInvocation(
  sessionId: string,
  toolName: string,
  inputParams: Record<string, unknown>,
  outputResult: Record<string, unknown> | null,
  status: string,
): Promise<void> {
  if (!isAlloyDbConfigured()) return;
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO tool_invocations (session_id, tool_name, input_params, output_result, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        sessionId,
        toolName,
        JSON.stringify(inputParams),
        outputResult ? JSON.stringify(outputResult) : null,
        status,
      ],
    );
  } catch (err) {
    logger.error('[LiveSession] AlloyDB recordToolInvocation failed (best-effort)', {
      sessionId,
      toolName,
      error: (err as Error).message,
    });
  }
}

/**
 * Create a new live session document.
 */
export async function createLiveSession(): Promise<LiveSession> {
  const docRef = liveSessions().doc();
  const now = new Date();
  const session: LiveSession = {
    sessionId: docRef.id,
    transcript: [],
    status: LiveSessionStatus.Active,
    createdAt: now,
  };
  await docRef.set(session);
  return session;
}

/**
 * Get a live session by ID.
 */
export async function getLiveSession(sessionId: string): Promise<LiveSession | null> {
  const doc = await liveSessions().doc(sessionId).get();
  if (!doc.exists) return null;
  return doc.data() as LiveSession;
}

/**
 * Append a transcript entry and return updated transcript.
 */
export async function appendTranscript(
  sessionId: string,
  entry: TranscriptEntry,
): Promise<TranscriptEntry[]> {
  const session = await getLiveSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const updated = [...session.transcript, entry];
  await liveSessions().doc(sessionId).update({ transcript: updated });
  return updated;
}

/**
 * Process user input through Gemini and return agent response.
 * Delegates to generateAgentResponse which handles Vertex AI function calling
 * (including autonomous trend-fetching via fetch_platform_trends tool).
 */
export async function processLiveInput(
  sessionId: string,
  userText: string,
): Promise<{ agentText: string; audioBase64: string | null; transcript: TranscriptEntry[] }> {
  const now = new Date().toISOString();

  const userEntry: TranscriptEntry = { role: 'user', text: userText, timestamp: now };
  const transcriptAfterUser = await appendTranscript(sessionId, userEntry);

  let agentText: string;
  let audioBase64: string | null = null;
  try {
    const agentResponse = await generateAgentResponse(transcriptAfterUser, sessionId);
    agentText = agentResponse.agentText;
    audioBase64 = agentResponse.audioBase64;
  } catch (err) {
    if (err instanceof ModelUnavailableError) {
      throw err;
    }
    logger.warn('Gemini generateContent failed, using fallback', { error: err });
    agentText = `That's interesting! Tell me more about your vision — what platform are you targeting, and who's your audience?`;
  }

  const agentEntry: TranscriptEntry = {
    role: 'agent',
    text: agentText,
    timestamp: new Date().toISOString(),
  };
  const finalTranscript = await appendTranscript(sessionId, agentEntry);

  return { agentText, audioBase64, transcript: finalTranscript };
}

/**
 * End a live session: persist final transcript and extract creative direction.
 */
export async function endLiveSession(
  sessionId: string,
): Promise<{ transcript: TranscriptEntry[]; extractedCreativeDirection?: ExtractedCreativeDirection }> {
  const session = await getLiveSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  let extracted: ExtractedCreativeDirection | undefined;
  try {
    extracted = await extractCreativeDirection(session.transcript);
  } catch (err) {
    logger.warn('Failed to extract creative direction', { error: err });
  }

  await liveSessions().doc(sessionId).update({
    status: LiveSessionStatus.Ended,
    endedAt: new Date(),
    ...(extracted && { extractedCreativeDirection: extracted }),
  });

  // Persist session history to AlloyDB (best-effort, non-blocking)
  persistSessionToAlloyDb(sessionId, session.transcript, extracted).catch(() => {
    /* best-effort, already logged internally */
  });

  return { transcript: session.transcript, extractedCreativeDirection: extracted };
}

// ── Platform/domain keyword detection for trend integration ─────────

const PLATFORM_KEYWORDS: Record<string, TrendPlatform> = {
  instagram: TrendPlatform.InstagramReels,
  'instagram reels': TrendPlatform.InstagramReels,
  reels: TrendPlatform.InstagramReels,
  twitter: TrendPlatform.XTwitter,
  'x twitter': TrendPlatform.XTwitter,
  x: TrendPlatform.XTwitter,
  linkedin: TrendPlatform.LinkedIn,
};

const DOMAIN_KEYWORDS: Record<string, TrendDomain> = {
  tech: 'tech',
  technology: 'tech',
  software: 'tech',
  ai: 'tech',
  fashion: 'fashion',
  style: 'fashion',
  clothing: 'fashion',
  finance: 'finance',
  fintech: 'finance',
  money: 'finance',
  investing: 'finance',
  fitness: 'fitness',
  health: 'fitness',
  workout: 'fitness',
  education: 'education',
  learning: 'education',
  gaming: 'gaming',
  games: 'gaming',
  startup: 'startup',
  startups: 'startup',
  entrepreneurship: 'startup',
};

const TREND_TRIGGER_WORDS = [
  'trend', 'trending', 'trends', 'popular', 'viral', 'what\'s hot',
  'what is trending', 'what\'s trending', 'whats trending',
  'hashtag', 'hashtags',
];

/**
 * Detect platform and domain keywords in user text.
 */
export function detectTrendKeywords(text: string): { platform?: TrendPlatform; domain?: TrendDomain; hasTrendIntent: boolean } {
  const lower = text.toLowerCase();

  let platform: TrendPlatform | undefined;
  for (const [keyword, plat] of Object.entries(PLATFORM_KEYWORDS)) {
    if (lower.includes(keyword)) {
      platform = plat;
      break;
    }
  }

  let domain: TrendDomain | undefined;
  for (const [keyword, dom] of Object.entries(DOMAIN_KEYWORDS)) {
    if (lower.includes(keyword)) {
      domain = dom;
      break;
    }
  }

  const hasTrendIntent = TREND_TRIGGER_WORDS.some((w) => lower.includes(w))
    || (!!platform && !!domain);

  return { platform, domain, hasTrendIntent };
}

/**
 * Format trend items into a concise prompt section.
 */
function formatTrendsForPrompt(trends: TrendItem[]): string {
  const top = trends.slice(0, 5);
  return top.map((t, i) =>
    `${i + 1}. "${t.title}" (momentum: ${t.momentumScore}/100, freshness: ${t.freshnessLabel})\n` +
    `   Hashtags: ${t.suggestedHashtags.join(', ')}\n` +
    `   Hook: ${t.suggestedHook}\n` +
    `   Angle: ${t.suggestedContentAngle}`,
  ).join('\n');
}

/**
 * Generate a conversational creative-director response via Gemini with function calling.
 * Uses Vertex AI native tool-use so Gemini can autonomously invoke fetch_platform_trends.
 * Returns both text and optional base64 audio.
 */
export async function generateAgentResponse(
  transcript: TranscriptEntry[],
  sessionId: string,
): Promise<{ agentText: string; audioBase64: string | null }> {
  let model: string;
  try {
    model = getModel('text');
  } catch {
    model = 'gemini-2.5-flash';
  }

  const cfg = getGcpConfig();
  const genai = cfg.geminiApiKey
    ? new GoogleGenAI({ apiKey: cfg.geminiApiKey })
    : new GoogleGenAI({ vertexai: true, project: cfg.projectId, location: cfg.location });

  const contents = transcript.map((t) => ({
    role: t.role === 'user' ? 'user' : 'model',
    parts: [{ text: t.text }],
  }));

  let response = await genai.models.generateContent({
    model,
    contents,
    config: {
      tools: [FETCH_TRENDS_TOOL],
      systemInstruction: LIVE_AGENT_SYSTEM_INSTRUCTION,
    },
  });

  // Tool execution loop: handle function calls from Gemini
  if (response.functionCalls && response.functionCalls.length > 0) {
    const fc = response.functionCalls[0];
    const platform = (fc.args as Record<string, unknown>)?.platform as string || 'all_platforms';

    let trendResult: Record<string, unknown>;
    let status = 'completed';
    try {
      const trendQuery = {
        platform: platform as any,
        domain: 'tech' as const,
        region: { scope: 'global' as const },
      };
      const result = await analyzeTrends(trendQuery);
      trendResult = { trendCount: result.trends.length, platform: result.platform, domain: result.domain, summary: result.summary, trends: result.trends };
    } catch (err) {
      status = 'failed';
      trendResult = { error: (err as Error).message };
    }

    // Record tool invocation (best-effort)
    recordToolInvocation(
      sessionId,
      'fetch_platform_trends',
      { platform },
      trendResult,
      status,
    ).catch(() => {});

    // Feed function response back to Gemini
    const functionResponseContent = {
      role: 'user' as const,
      parts: [{
        functionResponse: {
          name: fc.name,
          response: trendResult,
        },
      }],
    };

    response = await genai.models.generateContent({
      model,
      contents: [...contents, { role: 'model', parts: [{ functionCall: fc }] }, functionResponseContent],
      config: {
        tools: [FETCH_TRENDS_TOOL],
        systemInstruction: LIVE_AGENT_SYSTEM_INSTRUCTION,
      },
    });
  }

  const agentText = response.text?.trim() || 'Could you tell me more about what you\'re looking to create?';

  // Audio is handled client-side via Web Speech API (speechSynthesis)
  const audioBase64: string | null = null;

  return { agentText, audioBase64 };
}

/**
 * Extract structured creative direction from a conversation transcript.
 * Uses the shared generateContent (Vertex AI primary path).
 */
async function extractCreativeDirection(
  transcript: TranscriptEntry[],
): Promise<ExtractedCreativeDirection> {
  try {
    const fullText = transcript.map((t) => `${t.role}: ${t.text}`).join('\n');

    const prompt = `Analyze this creative brainstorming conversation and extract:
1. A suggested prompt for content generation
2. A suggested platform (instagram_reel, linkedin_launch_post, x_twitter_thread, general_promo_package)
3. A suggested tone (cinematic, punchy, sleek, professional)
4. Key themes (array of strings)
5. A raw summary

Return ONLY valid JSON:
{"suggestedPrompt":"...","suggestedPlatform":"...","suggestedTone":"...","keyThemes":["..."],"rawSummary":"..."}

Conversation:
${fullText}`;

    const text = await generateContent(prompt, getModel('text'));
    const trimmed = text.trim() || '{}';
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    return JSON.parse(jsonMatch[0]) as ExtractedCreativeDirection;
  } catch {
    const userMessages = transcript.filter((t) => t.role === 'user').map((t) => t.text);
    return {
      suggestedPrompt: userMessages.join('. '),
      keyThemes: [],
      rawSummary: userMessages.join(' | '),
    };
  }
}
