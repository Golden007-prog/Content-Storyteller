import type { TrendQuery } from '@content-storyteller/shared';
import type { RawTrendSignal } from './types';
/**
 * Computes a momentum score (0–100) for a raw trend signal.
 * Uses rawScore as a velocity indicator if available, otherwise defaults to 50.
 */
export declare function computeMomentumScore(signal: RawTrendSignal): number;
/**
 * Computes a relevance score (0–100) for a raw trend signal against a query.
 * Checks keyword matching against domain and platform alignment.
 */
export declare function computeRelevanceScore(signal: RawTrendSignal, query: TrendQuery): number;
//# sourceMappingURL=scoring.d.ts.map