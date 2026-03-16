"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLiveSession = createLiveSession;
exports.getLiveSession = getLiveSession;
exports.appendTranscript = appendTranscript;
exports.processLiveInput = processLiveInput;
exports.endLiveSession = endLiveSession;
const firestore_1 = require("@google-cloud/firestore");
const shared_1 = require("@content-storyteller/shared");
const logger_1 = require("../middleware/logger");
const gcp_1 = require("../config/gcp");
const genai_1 = require("./genai");
function getDb() {
    const cfg = (0, gcp_1.getGcpConfig)();
    return new firestore_1.Firestore({ projectId: cfg.projectId, databaseId: cfg.firestoreDatabase });
}
function liveSessions() {
    return getDb().collection('liveSessions');
}
/**
 * Create a new live session document.
 */
async function createLiveSession() {
    const docRef = liveSessions().doc();
    const now = new Date();
    const session = {
        sessionId: docRef.id,
        transcript: [],
        status: shared_1.LiveSessionStatus.Active,
        createdAt: now,
    };
    await docRef.set(session);
    return session;
}
/**
 * Get a live session by ID.
 */
async function getLiveSession(sessionId) {
    const doc = await liveSessions().doc(sessionId).get();
    if (!doc.exists)
        return null;
    return doc.data();
}
/**
 * Append a transcript entry and return updated transcript.
 */
async function appendTranscript(sessionId, entry) {
    const session = await getLiveSession(sessionId);
    if (!session)
        throw new Error(`Session ${sessionId} not found`);
    const updated = [...session.transcript, entry];
    await liveSessions().doc(sessionId).update({ transcript: updated });
    return updated;
}
/**
 * Process user input through Gemini and return agent response.
 * Uses the shared genai.ts module (Vertex AI primary, API key fallback).
 */
async function processLiveInput(sessionId, userText) {
    const now = new Date().toISOString();
    const userEntry = { role: 'user', text: userText, timestamp: now };
    const transcriptAfterUser = await appendTranscript(sessionId, userEntry);
    let agentText;
    try {
        agentText = await generateAgentResponse(transcriptAfterUser);
    }
    catch (err) {
        if (err instanceof shared_1.ModelUnavailableError) {
            throw err;
        }
        logger_1.logger.warn('Gemini Live unavailable, using echo fallback', { error: err });
        agentText = `I heard: "${userText}". Let me help you shape your creative direction. What platform are you targeting?`;
    }
    const agentEntry = {
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
async function endLiveSession(sessionId) {
    const session = await getLiveSession(sessionId);
    if (!session)
        throw new Error(`Session ${sessionId} not found`);
    let extracted;
    try {
        extracted = await extractCreativeDirection(session.transcript);
    }
    catch (err) {
        logger_1.logger.warn('Failed to extract creative direction', { error: err });
    }
    await liveSessions().doc(sessionId).update({
        status: shared_1.LiveSessionStatus.Ended,
        endedAt: new Date(),
        ...(extracted && { extractedCreativeDirection: extracted }),
    });
    return { transcript: session.transcript, extractedCreativeDirection: extracted };
}
/**
 * Generate a conversational creative-director response via Gemini.
 * Uses the shared generateContent (Vertex AI primary path).
 */
async function generateAgentResponse(transcript) {
    const model = (0, shared_1.getModel)('live');
    const conversationHistory = transcript
        .map((t) => `${t.role === 'user' ? 'User' : 'Creative Director'}: ${t.text}`)
        .join('\n');
    const prompt = `You are a Creative Director assistant helping a user brainstorm marketing content.
Based on the conversation so far, provide a helpful, concise response that guides them toward
defining their creative direction (platform, tone, key themes, campaign angle).

Conversation:
${conversationHistory}

Creative Director:`;
    const result = await (0, genai_1.generateContent)(prompt, model);
    return result.trim() || 'Could you tell me more about what you\'re looking to create?';
}
/**
 * Extract structured creative direction from a conversation transcript.
 * Uses the shared generateContent (Vertex AI primary path).
 */
async function extractCreativeDirection(transcript) {
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
        const text = await (0, genai_1.generateContent)(prompt, (0, shared_1.getModel)('text'));
        const trimmed = text.trim() || '{}';
        const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
        if (!jsonMatch)
            throw new Error('No JSON in response');
        return JSON.parse(jsonMatch[0]);
    }
    catch {
        const userMessages = transcript.filter((t) => t.role === 'user').map((t) => t.text);
        return {
            suggestedPrompt: userMessages.join('. '),
            keyThemes: [],
            rawSummary: userMessages.join(' | '),
        };
    }
}
//# sourceMappingURL=live-session.js.map