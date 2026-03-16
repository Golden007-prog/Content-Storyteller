"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.capabilityRegistry = void 0;
const gif_generation_1 = require("./gif-generation");
const image_generation_1 = require("./image-generation");
const video_generation_1 = require("./video-generation");
/**
 * Registry of generation capabilities. Pipeline stages use this to check
 * availability before attempting AI generation calls.
 *
 * Capabilities are registered at startup. If a capability is not registered
 * or reports itself as unavailable, the pipeline stage records a fallback
 * notice and continues.
 */
class CapabilityRegistry {
    capabilities = new Map();
    initialized = false;
    register(capability) {
        this.capabilities.set(capability.name, capability);
    }
    get(name) {
        return this.capabilities.get(name);
    }
    has(name) {
        return this.capabilities.has(name);
    }
    all() {
        return Array.from(this.capabilities.values());
    }
    /**
     * Initialize the registry with all known capabilities.
     * Safe to call multiple times — only registers on first call.
     */
    init() {
        if (this.initialized)
            return;
        this.register(new image_generation_1.ImageGenerationCapability());
        this.register(new video_generation_1.VideoGenerationCapability());
        this.register(new gif_generation_1.GifGenerationCapability());
        this.initialized = true;
    }
}
/** Singleton capability registry instance */
exports.capabilityRegistry = new CapabilityRegistry();
// Auto-initialize on import so pipeline stages can use capabilities immediately
exports.capabilityRegistry.init();
//# sourceMappingURL=capability-registry.js.map