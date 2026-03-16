import type { TrendPlatform, TrendRegion, TrendQuery } from '@content-storyteller/shared';
export interface RawTrendSignal {
    rawTitle: string;
    rawDescription: string;
    sourceName: string;
    platform: TrendPlatform;
    region: TrendRegion;
    rawScore?: number;
    collectedAt: string;
    isInferred: boolean;
}
export interface TrendProvider {
    name: string;
    fetchSignals(query: TrendQuery): Promise<RawTrendSignal[]>;
}
//# sourceMappingURL=types.d.ts.map