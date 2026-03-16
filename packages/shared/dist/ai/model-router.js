"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelUnavailableError = exports.RouterNotInitializedError = exports.FALLBACK_CHAINS = void 0;
exports.initModelRouter = initModelRouter;
exports.getModel = getModel;
exports.getLocation = getLocation;
exports.getSlotInfo = getSlotInfo;
exports.getResolvedModels = getResolvedModels;
exports._resetRouterForTesting = _resetRouterForTesting;
const model_config_1 = require("./model-config");
// ── Fallback chains ────────────────────────────────────────────────────
exports.FALLBACK_CHAINS = {
    text: ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.0-flash-001'],
    imageHQ: ['gemini-3-pro-image-preview', 'gemini-3.1-flash-image-preview'],
    videoFinal: ['veo-3.1-generate-001', 'veo-3.1-fast-generate-001'],
};
// ── Error classes ──────────────────────────────────────────────────────
class RouterNotInitializedError extends Error {
    constructor() {
        super('ModelRouter has not been initialized. Call initModelRouter() at startup.');
        this.name = 'RouterNotInitializedError';
    }
}
exports.RouterNotInitializedError = RouterNotInitializedError;
class ModelUnavailableError extends Error {
    slot;
    constructor(slot) {
        super(`Model for capability "${slot}" is unavailable and has no fallback.`);
        this.name = 'ModelUnavailableError';
        this.slot = slot;
    }
}
exports.ModelUnavailableError = ModelUnavailableError;
// ── Module state ───────────────────────────────────────────────────────
let resolvedMap = null;
// ── Helpers ────────────────────────────────────────────────────────────
const ALL_SLOTS = [
    'text', 'textFallback', 'reasoning', 'image',
    'imageHQ', 'videoFast', 'videoFinal', 'live',
];
function isEnvOverride(slot) {
    const envVar = model_config_1.SLOT_ENV_VARS[slot];
    return !!process.env[envVar];
}
function isLocationEnvOverride(slot) {
    const envVar = model_config_1.SLOT_LOCATION_ENV_VARS[slot];
    return !!process.env[envVar];
}
// ── Public API ─────────────────────────────────────────────────────────
/**
 * Initialize the model router. Performs availability checks for each slot,
 * walks fallback chains as needed, and caches the immutable resolved map.
 * Must be called once at service startup.
 */
async function initModelRouter(options) {
    const config = (0, model_config_1.getModelConfig)();
    const { projectId, slots, locations } = config;
    const checkAvailability = options?.checkAvailability ?? (async () => true);
    const map = {};
    for (const slot of ALL_SLOTS) {
        const primary = slots[slot];
        const slotLocation = locations[slot];
        const override = isEnvOverride(slot);
        // Env overrides skip availability checks entirely
        if (override) {
            map[slot] = {
                model: primary,
                location: slotLocation,
                status: 'available',
                primary,
                fallbackUsed: null,
                isOverride: true,
            };
            console.log(`[ModelRouter] ${slot}: ${primary} @ ${slotLocation} (env override)`);
            continue;
        }
        const chain = exports.FALLBACK_CHAINS[slot];
        if (chain) {
            // Slot has a fallback chain — walk it
            let resolved = false;
            for (const candidate of chain) {
                const available = await checkAvailability(candidate, projectId, slotLocation);
                if (available) {
                    const usedFallback = candidate !== primary ? candidate : null;
                    map[slot] = {
                        model: candidate,
                        location: slotLocation,
                        status: 'available',
                        primary,
                        fallbackUsed: usedFallback,
                        isOverride: false,
                    };
                    if (usedFallback) {
                        console.warn(`[ModelRouter] ${slot}: primary ${primary} unavailable, using fallback ${candidate} @ ${slotLocation}`);
                    }
                    else {
                        console.log(`[ModelRouter] ${slot}: ${candidate} @ ${slotLocation}`);
                    }
                    resolved = true;
                    break;
                }
            }
            if (!resolved) {
                // All models in chain unavailable — mark degraded, use last in chain
                const lastModel = chain[chain.length - 1];
                map[slot] = {
                    model: lastModel,
                    location: slotLocation,
                    status: 'degraded',
                    primary,
                    fallbackUsed: lastModel !== primary ? lastModel : null,
                    isOverride: false,
                };
                console.error(`[ModelRouter] ${slot}: all models unavailable, marked degraded (using ${lastModel} @ ${slotLocation})`);
            }
        }
        else {
            // No fallback chain — check primary directly
            const available = await checkAvailability(primary, projectId, slotLocation);
            if (available) {
                map[slot] = {
                    model: primary,
                    location: slotLocation,
                    status: 'available',
                    primary,
                    fallbackUsed: null,
                    isOverride: false,
                };
                console.log(`[ModelRouter] ${slot}: ${primary} @ ${slotLocation}`);
            }
            else {
                map[slot] = {
                    model: primary,
                    location: slotLocation,
                    status: 'unavailable',
                    primary,
                    fallbackUsed: null,
                    isOverride: false,
                };
                console.error(`[ModelRouter] ${slot}: ${primary} unavailable @ ${slotLocation}, no fallback`);
            }
        }
    }
    resolvedMap = Object.freeze(map);
    return resolvedMap;
}
/**
 * Get the resolved model for a capability slot.
 * Throws RouterNotInitializedError if initModelRouter() has not been called.
 * Throws ModelUnavailableError if the slot is marked unavailable.
 */
function getModel(slot) {
    if (!resolvedMap)
        throw new RouterNotInitializedError();
    const info = resolvedMap[slot];
    if (info.status === 'unavailable')
        throw new ModelUnavailableError(slot);
    return info.model;
}
/**
 * Get the resolved location for a capability slot.
 * Throws RouterNotInitializedError if initModelRouter() has not been called.
 */
function getLocation(slot) {
    if (!resolvedMap)
        throw new RouterNotInitializedError();
    return resolvedMap[slot].location;
}
/**
 * Get the full resolved slot info (model, status, fallback info).
 */
function getSlotInfo(slot) {
    if (!resolvedMap)
        throw new RouterNotInitializedError();
    return resolvedMap[slot];
}
/**
 * Get the entire resolved model map (for health endpoints).
 */
function getResolvedModels() {
    if (!resolvedMap)
        throw new RouterNotInitializedError();
    return resolvedMap;
}
/**
 * Reset router state — for test isolation only.
 */
function _resetRouterForTesting() {
    resolvedMap = null;
}
//# sourceMappingURL=model-router.js.map