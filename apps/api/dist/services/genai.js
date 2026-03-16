"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateContent = generateContent;
const genai_1 = require("@google/genai");
const gcp_1 = require("../config/gcp");
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
let genaiInstance = null;
function getGenAI() {
    if (!genaiInstance) {
        const cfg = (0, gcp_1.getGcpConfig)();
        if (cfg.geminiApiKey) {
            // Optional local dev fallback — AI Studio API key
            genaiInstance = new genai_1.GoogleGenAI({ apiKey: cfg.geminiApiKey });
        }
        else {
            // Primary path — Vertex AI via ADC
            genaiInstance = new genai_1.GoogleGenAI({
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
async function generateContent(prompt, model) {
    const genai = getGenAI();
    try {
        const result = await genai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
        return result.text ?? '';
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`GenAI generateContent failed: ${message}`);
    }
}
//# sourceMappingURL=genai.js.map