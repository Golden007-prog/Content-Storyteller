"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProviders = getProviders;
const gemini_provider_1 = require("./providers/gemini-provider");
/**
 * Returns all registered trend providers.
 * Currently includes only the Gemini provider.
 * Extensible for future providers (RSS feeds, social APIs, Google Trends, etc.)
 */
function getProviders() {
    return [new gemini_provider_1.GeminiTrendProvider()];
}
//# sourceMappingURL=registry.js.map