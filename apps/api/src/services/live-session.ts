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
import { logger } from '../middleware/logger';
import { getGcpConfig } from '../config/gcp';
import { generateContent } from './genai';
import { analyzeTrends } from './trends/analyzer';
import { isAlloyDbConfigured } from './firestore';
import { getPool } from './alloydb';

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
 * Integrates Trend Analyzer when platform/domain keywords are detected.
 * Uses the shared genai.ts module (Vertex AI primary, API key fallback).
 */
export async function processLiveInput(
  sessionId: string,
  userText: string,
): Promise<{ agentText: string; transcript: TranscriptEntry[] }> {
  const now = new Date().toISOString();

  const userEntry: TranscriptEntry = { role: 'user', text: userText, timestamp: now };
  const transcriptAfterUser = await appendTranscript(sessionId, userEntry);

  // Detect trend intent and fetch trend data before generating response
  let trendSection = '';
  const { platform, domain, hasTrendIntent } = detectTrendKeywords(userText);

  if (hasTrendIntent) {
    const trendQuery: TrendQuery = {
      platform: platform || TrendPlatform.AllPlatforms,
      domain: domain || 'tech',
      region: { scope: 'global' },
    };
    try {
      const trendResult = await analyzeTrends(trendQuery);

      // Record successful tool invocation to AlloyDB (best-effort)
      recordToolInvocation(
        sessionId,
        'analyzeTrends',
        trendQuery as unknown as Record<string, unknown>,
        { trendCount: trendResult.trends.length, platform: trendResult.platform, domain: trendResult.domain },
        'completed',
      ).catch(() => { /* best-effort, already logged internally */ });

      if (trendResult.trends.length > 0) {
        trendSection = `\n\n--- CURRENT TREND DATA ---\nPlatform: ${trendResult.platform} | Domain: ${trendResult.domain}\nSummary: ${trendResult.summary}\n\nTop Trends:\n${formatTrendsForPrompt(trendResult.trends)}\n--- END TREND DATA ---\n\nUse the trend data above to provide specific, data-driven creative direction. Reference specific trends, suggest relevant hashtags, and recommend content angles based on what's currently trending.`;
      }
    } catch (err) {
      // Record failed tool invocation to AlloyDB (best-effort)
      recordToolInvocation(
        sessionId,
        'analyzeTrends',
        trendQuery as unknown as Record<string, unknown>,
        { error: (err as Error).message },
        'failed',
      ).catch(() => { /* best-effort, already logged internally */ });

      logger.warn('Failed to fetch trends for live agent', { error: err });
      // Even if full trend analysis fails, include trend-aware context
      const platformLabel = platform || 'all platforms';
      const domainLabel = domain || 'general';
      trendSection = `\n\n--- TREND CONTEXT ---\nThe user is asking about trending content. Platform: ${platformLabel} | Domain: ${domainLabel}\nProvide trend-aware creative direction with hashtag suggestions and momentum insights.\n--- END TREND CONTEXT ---`;
    }
  }

  let agentText: string;
  try {
    agentText = await generateAgentResponse(transcriptAfterUser, trendSection);
  } catch (err) {
    if (err instanceof ModelUnavailableError) {
      throw err;
    }
    logger.warn('Gemini Live unavailable, using echo fallback', { error: err });
    agentText = `I heard: "${userText}". Let me help you shape your creative direction. What platform are you targeting?`;
  }

  const agentEntry: TranscriptEntry = {
    role: 'agent',
    text: agentText,
    timestamp: new Date().toISOString(),
  };
  const finalTranscript = await appendTranscript(sessionId, agentEntry);

  return { agentText, transcript: finalTranscript };
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
 * Generate a conversational creative-director response via Gemini.
 * Includes trend data in the prompt when available.
 * Uses the shared generateContent (Vertex AI primary path).
 */
async function generateAgentResponse(transcript: TranscriptEntry[], trendSection: string = ''): Promise<string> {
  let model: string;
  try {
    model = getModel('live');
  } catch {
    // Fallback model when router not initialized
    model = 'gemini-2.0-flash-001';
  }

  const conversationHistory = transcript
    .map((t) => `${t.role === 'user' ? 'User' : 'Creative Director'}: ${t.text}`)
    .join('\n');

  const prompt = `You are a Creative Director assistant helping a user brainstorm marketing content.
Based on the conversation so far, provide a helpful, concise response that guides them toward
defining their creative direction (platform, tone, key themes, campaign angle).
${trendSection}
Conversation:
${conversationHistory}

Creative Director:`;

  const result = await generateContent(prompt, model);
  return result.trim() || 'Could you tell me more about what you\'re looking to create?';
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
