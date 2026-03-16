import type { TrendPlatform, TrendRegion, TrendQuery } from '@content-storyteller/shared';
import type { RawTrendSignal } from './types';
export interface NormalizedSignal {
    rawTitle: string;
    rawDescription: string;
    sourceName: string;
    platform: TrendPlatform;
    region: TrendRegion;
    rawScore: number | null;
    collectedAt: string;
    isInferred: boolean;
    momentumScore: number;
    relevanceScore: number;
}
/**
 * Normalizes raw trend signals: standardizes regions, applies scoring,
 * and deduplicates by title similarity (simple lowercase comparison).
 */
export declare function normalizeSignals(raw: RawTrendSignal[], query: TrendQuery): NormalizedSignal[];
//# sourceMappingURL=normalize.d.ts.map