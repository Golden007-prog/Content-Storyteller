/**
 * Live Agent Mode — Gemini Live API / ADK session types
 */

export interface TranscriptEntry {
  role: 'user' | 'agent';
  text: string;
  timestamp: string;
}

export interface LiveSession {
  sessionId: string;
  jobId?: string;
  transcript: TranscriptEntry[];
  extractedCreativeDirection?: ExtractedCreativeDirection;
  status: LiveSessionStatus;
  createdAt: Date;
  endedAt?: Date;
}

export enum LiveSessionStatus {
  Active = 'active',
  Ended = 'ended',
  Error = 'error',
}

export interface ExtractedCreativeDirection {
  suggestedPrompt: string;
  suggestedPlatform?: string;
  suggestedTone?: string;
  keyThemes: string[];
  rawSummary: string;
}

export interface StartLiveSessionResponse {
  sessionId: string;
  status: LiveSessionStatus;
}

export interface LiveInputResponse {
  sessionId: string;
  agentText: string;
  transcript: TranscriptEntry[];
}

export interface StopLiveSessionResponse {
  sessionId: string;
  transcript: TranscriptEntry[];
  extractedCreativeDirection?: ExtractedCreativeDirection;
}
