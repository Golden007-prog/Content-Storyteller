"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageGenerationCapability = void 0;
const shared_1 = require("@content-storyteller/shared");
const vertexai_1 = require("@google-cloud/vertexai");
const gcp_1 = require("../config/gcp");
/**
 * Image generation capability backed by Vertex AI.
 * Checks availability via a lightweight API probe and handles
 * access-denied (403) errors gracefully by reporting unavailable.
 */
class ImageGenerationCapability {
    name = 'image_generation';
    cachedAvailability = null;
    lastCheckTime = 0;
    cacheTtlMs = 60_000; // re-check every 60s
    async isAvailable() {
        const now = Date.now();
        if (this.cachedAvailability !== null && now - this.lastCheckTime < this.cacheTtlMs) {
            return this.cachedAvailability;
        }
        try {
            const cfg = (0, gcp_1.getGcpConfig)();
            const vertexAI = new vertexai_1.VertexAI({ project: cfg.projectId, location: (0, shared_1.getLocation)('image') });
            // Attempt to instantiate the generative model — this validates credentials
            // and project access without making a full generation call
            vertexAI.getGenerativeModel({ model: (0, shared_1.getModel)('image') });
            this.cachedAvailability = true;
        }
        catch (err) {
            if (isAccessDenied(err)) {
                this.cachedAvailability = false;
            }
            else {
                // Transient errors — assume unavailable but don't cache long
                this.cachedAvailability = false;
            }
        }
        this.lastCheckTime = now;
        return this.cachedAvailability;
    }
    async generate(input) {
        const { jobId, data } = input;
        const prompt = data.prompt || '';
        const brief = data.brief;
        try {
            const cfg = (0, gcp_1.getGcpConfig)();
            const vertexAI = new vertexai_1.VertexAI({ project: cfg.projectId, location: (0, shared_1.getLocation)('image') });
            const model = vertexAI.getGenerativeModel({ model: (0, shared_1.getModel)('image') });
            const imagePrompt = prompt || buildImagePrompt(brief);
            const result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: imagePrompt }] }],
            });
            const responseText = result.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            return {
                success: true,
                assets: responseText ? [responseText] : [],
                metadata: { jobId, model: (0, shared_1.getModel)('image'), promptUsed: imagePrompt },
            };
        }
        catch (err) {
            if (isAccessDenied(err)) {
                return { success: false, assets: [], metadata: { reason: 'access-denied' } };
            }
            throw err;
        }
    }
}
exports.ImageGenerationCapability = ImageGenerationCapability;
function buildImagePrompt(brief) {
    if (!brief)
        return 'Generate a marketing visual';
    return `Create a detailed marketing image description for:
- Target Audience: ${brief.targetAudience}
- Tone: ${brief.tone}
- Visual Direction: ${brief.visualDirection}
- Key Messages: ${brief.keyMessages.join(', ')}`;
}
function isAccessDenied(err) {
    if (err && typeof err === 'object') {
        const code = err.code;
        const status = err.status;
        if (code === 403 || code === '403' || status === 403 || status === '403')
            return true;
        const message = String(err.message || '');
        if (message.includes('403') || message.toLowerCase().includes('permission denied')) {
            return true;
        }
    }
    return false;
}
//# sourceMappingURL=image-generation.js.map