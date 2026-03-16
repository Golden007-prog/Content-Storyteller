import { GoogleGenAI } from '@google/genai';
import { getGcpConfig } from '../config/gcp';

/**
 * Google GenAI SDK helper for the Worker service.
 *
 * Auth strategy:
 *   - Default (production): Vertex AI via ADC
 *   - Fallback (local dev): GEMINI_API_KEY if set
 */

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

/**
 * Generate content with multimodal parts using a specific model.
 * The model parameter is required — callers get it from the ModelRouter.
 */
export async function generateContentMultimodal(
  parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }>,
  model: string,
): Promise<string> {
  const genai = getGenAI();

  try {
    const result = await genai.models.generateContent({
      model,
      contents: [{ role: 'user', parts }],
    });
    return result.text ?? '';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`GenAI generateContent (multimodal) failed: ${message}`);
  }
}
