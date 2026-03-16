"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiTrendProvider = void 0;
const shared_1 = require("@content-storyteller/shared");
const genai_1 = require("../../genai");
/**
 * Gemini-based trend provider.
 * Uses Gemini to generate trend signals based on query context.
 * All signals are labeled as inferred since they come from AI knowledge.
 */
class GeminiTrendProvider {
    name = 'gemini';
    async fetchSignals(query) {
        const regionLabel = query.region.scope === 'global'
            ? 'globally'
            : query.region.scope === 'state_province'
                ? `in ${query.region.stateProvince}, ${query.region.country}`
                : `in ${query.region.country}`;
        const prompt = [
            `You are a trend analyst. Return a JSON array of trending topics for the "${query.platform}" platform`,
            `in the "${query.domain}" domain ${regionLabel}.`,
            query.timeWindow ? `Focus on trends from the last ${query.timeWindow}.` : '',
            query.language ? `Respond considering the "${query.language}" language audience.` : '',
            '',
            'Return ONLY a valid JSON array of objects with these exact fields:',
            '- rawTitle: short trend title',
            '- rawDescription: one-sentence description of the trend',
            `- platform: "${query.platform}"`,
            `- region: ${JSON.stringify(query.region)}`,
            '',
            'Return between 5 and 10 items. No markdown, no explanation — just the JSON array.',
        ]
            .filter(Boolean)
            .join('\n');
        try {
            const raw = await (0, genai_1.generateContent)(prompt, (0, shared_1.getModel)('text'));
            // Strip markdown fences if present
            const cleaned = raw.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
            const parsed = JSON.parse(cleaned);
            if (!Array.isArray(parsed)) {
                return [];
            }
            const now = new Date().toISOString();
            return parsed.map((item) => ({
                rawTitle: String(item.rawTitle ?? ''),
                rawDescription: String(item.rawDescription ?? ''),
                sourceName: 'gemini',
                platform: query.platform,
                region: query.region,
                collectedAt: now,
                isInferred: true,
            }));
        }
        catch {
            // On any failure (network, parse, etc.) return empty array
            return [];
        }
    }
}
exports.GeminiTrendProvider = GeminiTrendProvider;
//# sourceMappingURL=gemini-provider.js.map