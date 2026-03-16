import { LiveSession, TranscriptEntry, ExtractedCreativeDirection } from '@content-storyteller/shared';
/**
 * Create a new live session document.
 */
export declare function createLiveSession(): Promise<LiveSession>;
/**
 * Get a live session by ID.
 */
export declare function getLiveSession(sessionId: string): Promise<LiveSession | null>;
/**
 * Append a transcript entry and return updated transcript.
 */
export declare function appendTranscript(sessionId: string, entry: TranscriptEntry): Promise<TranscriptEntry[]>;
/**
 * Process user input through Gemini and return agent response.
 * Uses the shared genai.ts module (Vertex AI primary, API key fallback).
 */
export declare function processLiveInput(sessionId: string, userText: string): Promise<{
    agentText: string;
    transcript: TranscriptEntry[];
}>;
/**
 * End a live session: persist final transcript and extract creative direction.
 */
export declare function endLiveSession(sessionId: string): Promise<{
    transcript: TranscriptEntry[];
    extractedCreativeDirection?: ExtractedCreativeDirection;
}>;
//# sourceMappingURL=live-session.d.ts.map