import { GoogleGenAI } from '@google/genai';
import { getGcpConfig } from '../config/gcp';

/**
 * Google GenAI SDK helper for the API service.
 *
 * Auth strategy:
 *   - Default (production): Vertex AI via ADC — uses projectId and location
 *     from shared GCP config. No API key needed.
 *   - Fallback (local dev): If GEMINI_API_KEY is set, uses Google AI Studio
 *     API key auth instead. This is optional and for convenience only.
 *
 * The Vertex AI path is the primary, hackathon-compliant path.
 */

let genaiInstance: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI {
  if (!genaiInstance) {
    const cfg = getGcpConfig();
    if (cfg.geminiApiKey) {
      // Optional local dev fallback — AI Studio API key
      genaiInstance = new GoogleGenAI({ apiKey: cfg.geminiApiKey });
    } else {
      // Primary path — Vertex AI via ADC
      genaiInstance = new GoogleGenAI({
        vertexai: true,
        project: cfg.projectId,
        location: cfg.location,
      });
    }
  }
  return genaiInstance;
}

/**
 * Generate content using a specific model via Vertex AI (or API key fallback).
 * The model parameter is required — callers get it from the ModelRouter.
 */
export async function generateContent(prompt: string, model: string): Promise<string> {
  const genai = getGenAI();

  try {
    const result = await genai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    return result.text ?? '';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`GenAI generateContent failed: ${message}`);
  }
}
