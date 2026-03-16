import type { TrendPlatform, TrendRegion, TrendQuery } from '@content-storyteller/shared';
import type { RawTrendSignal } from './types';
import { computeMomentumScore, computeRelevanceScore } from './scoring';

export interface NormalizedSignal {
  rawTitle: string;
  rawDescription: string;
  sourceName: string;
  platform: TrendPlatform;
  region: TrendRegion;
  rawScore: number | null;
  collectedAt: string;
  isInferred: boolean;
  momentumScore: number;   // 0–100
  relevanceScore: number;  // 0–100
}

/**
 * Standardizes a region's country/stateProvince labels to common English form.
 */
function standardizeRegion(region: TrendRegion): TrendRegion {
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
export function normalizeSignals(
  raw: RawTrendSignal[],
  query: TrendQuery,
): NormalizedSignal[] {
  const seen = new Set<string>();
  const results: NormalizedSignal[] = [];

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
      momentumScore: computeMomentumScore(signal),
      relevanceScore: computeRelevanceScore(signal, query),
    });
  }

  return results;
}
