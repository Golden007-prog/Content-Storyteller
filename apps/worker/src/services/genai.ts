import { GoogleGenAI } from '@google/genai';
import { getGcpConfig } from '../config/gcp';

/**
 * Google GenAI SDK helper for the Worker service.
 *
 * Auth strategy:
 *   - Default (production): Vertex AI via ADC
 *   - Fallback (local dev): GEMINI_API_KEY if set
 *
 * Retry strategy:
 *   - Retries on 429 (RESOURCE_EXHAUSTED) with exponential backoff
 *   - Max 5 retries, starting at 2s delay, doubling each time (2s, 4s, 8s, 16s, 32s)
 */

const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 2000;

let genaiInstance: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI {
  if (!genaiInstance) {
    const cfg = getGcpConfig();
    if (cfg.geminiApiKey) {
      genaiInstance = new GoogleGenAI({ apiKey: cfg.geminiApiKey });
    } else {
      genaiInstance = new GoogleGenAI({
        vertexai: true,
        project: cfg.projectId,
        location: cfg.location,
      });
    }
  }
  return genaiInstance;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('429') || 
         message.includes('RESOURCE_EXHAUSTED') || 
         message.includes('Resource exhausted') ||
         message.includes('quota');
}

/**
 * Generate content using a specific model via Vertex AI (or API key fallback).
 * The model parameter is required — callers get it from the ModelRouter.
 */
export async function generateContent(prompt: string, model: string): Promise<string> {
  const genai = getGenAI();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await genai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      return result.text ?? '';
    } catch (err) {
      if (attempt < MAX_RETRIES && isRetryableError(err)) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        console.log(JSON.stringify({ level: 'warn', msg: 'GenAI 429 retry', attempt: attempt + 1, maxRetries: MAX_RETRIES, delayMs: delay }));
        await sleep(delay);
        continue;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`GenAI generateContent failed: ${message}`);
    }
  }
  throw new Error('GenAI generateContent failed: max retries exceeded');
}

/**
 * Generate content with multimodal parts using a specific model.
 * The model parameter is required — callers get it from the ModelRouter.
 */
export async function generateContentMultimodal(
  parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }>,
  model: string,
): Promise<string> {
  const genai = getGenAI();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await genai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
      });
      return result.text ?? '';
    } catch (err) {
      if (attempt < MAX_RETRIES && isRetryableError(err)) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        console.log(JSON.stringify({ level: 'warn', msg: 'GenAI multimodal 429 retry', attempt: attempt + 1, maxRetries: MAX_RETRIES, delayMs: delay }));
        await sleep(delay);
        continue;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`GenAI generateContent (multimodal) failed: ${message}`);
    }
  }
  throw new Error('GenAI generateContent (multimodal) failed: max retries exceeded');
}
