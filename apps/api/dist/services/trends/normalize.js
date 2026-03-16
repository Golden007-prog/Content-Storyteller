"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeSignals = normalizeSignals;
const scoring_1 = require("./scoring");
/**
 * Standardizes a region's country/stateProvince labels to common English form.
 */
function standardizeRegion(region) {
    return {
        scope: region.scope,
        ...(region.country != null ? { country: region.country.trim() } : {}),
        ...(region.stateProvince != null ? { stateProvince: region.stateProvince.trim() } : {}),
    };
}
/**
 * Normalizes raw trend signals: standardizes regions, applies scoring,
 * and deduplicates by title similarity (simple lowercase comparison).
 */
function normalizeSignals(raw, query) {
    const seen = new Set();
    const results = [];
    for (const signal of raw) {
        // Deduplicate by lowercase title
        const key = signal.rawTitle.toLowerCase().trim();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        results.push({
            rawTitle: signal.rawTitle,
            rawDescription: signal.rawDescription,
            sourceName: signal.sourceName,
            platform: signal.platform,
            region: standardizeRegion(signal.region),
            rawScore: signal.rawScore ?? null,
            collectedAt: signal.collectedAt,
            isInferred: signal.isInferred,
            momentumScore: (0, scoring_1.computeMomentumScore)(signal),
            relevanceScore: (0, scoring_1.computeRelevanceScore)(signal, query),
        });
    }
    return results;
}
//# sourceMappingURL=normalize.js.map