"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateContent = generateContent;
exports.generateContentMultimodal = generateContentMultimodal;
const genai_1 = require("@google/genai");
const gcp_1 = require("../config/gcp");
/**
 * Google GenAI SDK helper for the Worker service.
 *
 * Auth strategy:
 *   - Default (production): Vertex AI via ADC
 *   - Fallback (local dev): GEMINI_API_KEY if set
 */
let genaiInstance = null;
function getGenAI() {
    if (!genaiInstance) {
        const cfg = (0, gcp_1.getGcpConfig)();
        if (cfg.geminiApiKey) {
            genaiInstance = new genai_1.GoogleGenAI({ apiKey: cfg.geminiApiKey });
        }
        else {
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
/**
 * Generate content with multimodal parts using a specific model.
 * The model parameter is required — callers get it from the ModelRouter.
 */
async function generateContentMultimodal(parts, model) {
    const genai = getGenAI();
    try {
        const result = await genai.models.generateContent({
            model,
            contents: [{ role: 'user', parts }],
        });
        return result.text ?? '';
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`GenAI generateContent (multimodal) failed: ${message}`);
    }
}
//# sourceMappingURL=genai.js.map