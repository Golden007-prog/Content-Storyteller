import type { TrendPlatform, TrendRegion, TrendQuery } from '@content-storyteller/shared';

export interface RawTrendSignal {
  rawTitle: string;
  rawDescription: string;
  sourceName: string;
  platform: TrendPlatform;
  region: TrendRegion;
  rawScore?: number;
  collectedAt: string; // ISO 8601
  isInferred: boolean;
}

export interface TrendProvider {
  name: string;
  fetchSignals(query: TrendQuery): Promise<RawTrendSignal[]>;
}
