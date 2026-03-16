import { Firestore } from '@google-cloud/firestore';
import {
  LiveSession,
  LiveSessionStatus,
  TranscriptEntry,
  ExtractedCreativeDirection,
  getModel,
  ModelUnavailableError,
} from '@content-storyteller/shared';
import { logger } from '../middleware/logger';
import { getGcpConfig } from '../config/gcp';
import { generateContent } from './genai';

function getDb(): Firestore {
  const cfg = getGcpConfig();
  return new Firestore({ projectId: cfg.projectId, databaseId: cfg.firestoreDatabase });
}

function liveSessions() {
  return getDb().collection('liveSessions');
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
 * Uses the shared genai.ts module (Vertex AI primary, API key fallback).
 */
export async function processLiveInput(
  sessionId: string,
  userText: string,
): Promise<{ agentText: string; transcript: TranscriptEntry[] }> {
  const now = new Date().toISOString();

  const userEntry: TranscriptEntry = { role: 'user', text: userText, timestamp: now };
  const transcriptAfterUser = await appendTranscript(sessionId, userEntry);

  let agentText: string;
  try {
    agentText = await generateAgentResponse(transcriptAfterUser);
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

  return { transcript: session.transcript, extractedCreativeDirection: extracted };
}

/**
 * Generate a conversational creative-director response via Gemini.
 * Uses the shared generateContent (Vertex AI primary path).
 */
async function generateAgentResponse(transcript: TranscriptEntry[]): Promise<string> {
  const model = getModel('live');
  const conversationHistory = transcript
    .map((t) => `${t.role === 'user' ? 'User' : 'Creative Director'}: ${t.text}`)
    .join('\n');

  const prompt = `You are a Creative Director assistant helping a user brainstorm marketing content.
Based on the conversation so far, provide a helpful, concise response that guides them toward
defining their creative direction (platform, tone, key themes, campaign angle).

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
