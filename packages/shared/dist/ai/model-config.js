"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SLOT_ENV_VARS = exports.SLOT_LOCATION_ENV_VARS = exports.LOCATION_DEFAULTS = exports.MODEL_DEFAULTS = void 0;
exports.getModelConfig = getModelConfig;
exports.getLocationForSlot = getLocationForSlot;
exports._resetConfigForTesting = _resetConfigForTesting;
/** Default model identifiers per capability slot */
exports.MODEL_DEFAULTS = {
    text: 'gemini-3-flash-preview',
    textFallback: 'gemini-3-flash-preview',
    reasoning: 'gemini-3.1-pro-preview',
    image: 'gemini-3.1-flash-image-preview',
    imageHQ: 'gemini-3-pro-image-preview',
    videoFast: 'veo-3.1-fast-generate-001',
    videoFinal: 'veo-3.1-generate-001',
    live: 'gemini-live-2.5-flash-native-audio',
};
/** Default Vertex AI location per capability slot */
exports.LOCATION_DEFAULTS = {
    text: 'global',
    textFallback: 'global',
    reasoning: 'global',
    image: 'global',
    imageHQ: 'global',
    videoFast: 'us-central1',
    videoFinal: 'us-central1',
    live: 'global',
};
/** Environment variable names for per-slot location overrides */
exports.SLOT_LOCATION_ENV_VARS = {
    text: 'VERTEX_TEXT_LOCATION',
    textFallback: 'VERTEX_TEXT_FALLBACK_LOCATION',
    reasoning: 'VERTEX_REASONING_LOCATION',
    image: 'VERTEX_IMAGE_LOCATION',
    imageHQ: 'VERTEX_IMAGE_HQ_LOCATION',
    videoFast: 'VERTEX_VIDEO_FAST_LOCATION',
    videoFinal: 'VERTEX_VIDEO_FINAL_LOCATION',
    live: 'VERTEX_LIVE_LOCATION',
};
/** Environment variable names per slot */
exports.SLOT_ENV_VARS = {
    text: 'VERTEX_TEXT_MODEL',
    textFallback: 'VERTEX_TEXT_FALLBACK_MODEL',
    reasoning: 'VERTEX_REASONING_MODEL',
    image: 'VERTEX_IMAGE_MODEL',
    imageHQ: 'VERTEX_IMAGE_HQ_MODEL',
    videoFast: 'VERTEX_VIDEO_FAST_MODEL',
    videoFinal: 'VERTEX_VIDEO_FINAL_MODEL',
    live: 'VERTEX_LIVE_MODEL',
};
let cachedConfig = null;
/**
 * Reads env vars and returns model config with overrides applied.
 * Result is cached as a singleton; use _resetConfigForTesting() to clear.
 */
function getModelConfig() {
    if (cachedConfig)
        return cachedConfig;
    const slots = { ...exports.MODEL_DEFAULTS };
    for (const [slot, envVar] of Object.entries(exports.SLOT_ENV_VARS)) {
        const value = process.env[envVar];
        if (value) {
            slots[slot] = value;
        }
    }
    const locations = { ...exports.LOCATION_DEFAULTS };
    for (const [slot, envVar] of Object.entries(exports.SLOT_LOCATION_ENV_VARS)) {
        const value = process.env[envVar];
        if (value) {
            locations[slot] = value;
        }
    }
    cachedConfig = {
        projectId: process.env.GOOGLE_CLOUD_PROJECT || '',
        location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
        slots,
        locations,
    };
    return cachedConfig;
}
/** Get the resolved location for a specific capability slot. */
function getLocationForSlot(slot) {
    return getModelConfig().locations[slot];
}
/** Reset cached config — for test isolation only. */
function _resetConfigForTesting() {
    cachedConfig = null;
}
//# sourceMappingURL=model-config.js.map