import type { TrendQuery } from '@content-storyteller/shared';
import type { RawTrendSignal } from './types';

/**
 * Computes a momentum score (0–100) for a raw trend signal.
 * Uses rawScore as a velocity indicator if available, otherwise defaults to 50.
 */
export function computeMomentumScore(signal: RawTrendSignal): number {
  const base = signal.rawScore != null ? signal.rawScore : 50;
  return Math.max(0, Math.min(100, base));
}

/**
 * Computes a relevance score (0–100) for a raw trend signal against a query.
 * Checks keyword matching against domain and platform alignment.
 */
export function computeRelevanceScore(signal: RawTrendSignal, query: TrendQuery): number {
  let score = 50; // base score

  // Domain keyword matching: check if domain appears in title or description
  const domain = query.domain.toLowerCase();
  const title = signal.rawTitle.toLowerCase();
  const description = signal.rawDescription.toLowerCase();

  if (title.includes(domain)) {
    score += 25;
  }
  if (description.includes(domain)) {
    score += 15;
  }

  // Platform alignment: boost if signal platform matches query platform
  if (query.platform === signal.platform || query.platform === 'all_platforms') {
    score += 10;
  }

  return Math.max(0, Math.min(100, score));
}
