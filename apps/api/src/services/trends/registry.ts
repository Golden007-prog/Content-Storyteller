import type { TrendProvider } from './types';
import { GeminiTrendProvider } from './providers/gemini-provider';

/**
 * Returns all registered trend providers.
 * Currently includes only the Gemini provider.
 * Extensible for future providers (RSS feeds, social APIs, Google Trends, etc.)
 */
export function getProviders(): TrendProvider[] {
  return [new GeminiTrendProvider()];
}
