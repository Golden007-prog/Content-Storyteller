import type { TrendQuery } from '@content-storyteller/shared';
import type { TrendProvider, RawTrendSignal } from '../types';
/**
 * Gemini-based trend provider.
 * Uses Gemini to generate trend signals based on query context.
 * All signals are labeled as inferred since they come from AI knowledge.
 */
export declare class GeminiTrendProvider implements TrendProvider {
    name: string;
    fetchSignals(query: TrendQuery): Promise<RawTrendSignal[]>;
}
//# sourceMappingURL=gemini-provider.d.ts.map