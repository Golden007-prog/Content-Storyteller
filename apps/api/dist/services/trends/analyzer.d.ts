import type { TrendQuery, TrendAnalysisResult } from '@content-storyteller/shared';
/**
 * Main orchestrator: collects signals from providers, normalizes them,
 * passes to Gemini for consolidation and ranking, returns structured result.
 */
export declare function analyzeTrends(query: TrendQuery): Promise<TrendAnalysisResult>;
//# sourceMappingURL=analyzer.d.ts.map