import type {
  TrendQuery,
  TrendAnalysisResult,
  TrendItem,
  FreshnessLabel,
  TrendPlatform,
  TrendRegion,
} from '@content-storyteller/shared';
import { getModel } from '@content-storyteller/shared';
import { getProviders } from './registry';
import { normalizeSignals, NormalizedSignal } from './normalize';
import type { RawTrendSignal } from './types';
import { generateContent } from '../genai';

/**
 * Builds the Gemini prompt for trend consolidation, clustering, ranking,
 * and content generation.
 */
function buildGeminiPrompt(
  query: TrendQuery,
  signals: NormalizedSignal[],
): string {
  const regionLabel =
    query.region.scope === 'global'
      ? 'globally'
      : query.region.scope === 'state_province'
        ? `in ${query.region.stateProvince}, ${query.region.country}`
        : `in ${query.region.country}`;

  const signalContext =
    signals.length > 0
      ? `\nHere are raw trend signals collected from providers:\n${JSON.stringify(
          signals.map((s) => ({
            title: s.rawTitle,
            description: s.rawDescription,
            source: s.sourceName,
            momentumScore: s.momentumScore,
            relevanceScore: s.relevanceScore,
            isInferred: s.isInferred,
          })),
          null,
          2,
        )}\n\nConsolidate, cluster similar topics, and rank these signals.`
      : `No raw signals were collected from providers. Generate trend insights from your own knowledge. Label all sourceLabels as ["inferred"].`;

  const lines = [
    'You are an expert trend analyst for social media content creation.',
    '',
    `Platform: ${query.platform}`,
    `Domain: ${query.domain}`,
    `Region: ${regionLabel}`,
    query.timeWindow ? `Time window: last ${query.timeWindow}` : '',
    query.language ? `Language/audience: ${query.language}` : '',
    '',
    signalContext,
    '',
    `Use domain-specific language for the "${query.domain}" domain.`,
    query.region.scope !== 'global'
      ? `Prioritize region-specific context for ${regionLabel}.`
      : '',
    '',
    'Ranking criteria (composite score):',
    '- momentum × 0.3 + relevance × 0.3 + freshness × 0.2 + platform_fit × 0.2',
    '',
    'Freshness labels: "Fresh", "Rising Fast", "Established", "Fading"',
    '',
    'Return ONLY a valid JSON object (no markdown, no explanation) with this exact shape:',
    '{',
    '  "summary": "<overall narrative of the trend landscape for this platform and domain>",',
    '  "trends": [',
    '    {',
    '      "title": "<short trend title>",',
    '      "keyword": "<primary keyword>",',
    '      "description": "<why this trend matters, tailored to the domain>",',
    '      "momentumScore": <0-100>,',
    '      "relevanceScore": <0-100>,',
    '      "suggestedHashtags": ["#tag1", "#tag2"],',
    '      "suggestedHook": "<platform-tailored hook>",',
    '      "suggestedContentAngle": "<content creation angle>",',
    `      "sourceLabels": [${signals.length > 0 ? '"gemini", ...' : '"inferred"'}],`,
    `      "region": ${JSON.stringify(query.region)},`,
    `      "platform": "${query.platform}",`,
    '      "freshnessLabel": "<Fresh|Rising Fast|Established|Fading>"',
    '    }',
    '  ]',
    '}',
    '',
    'Return 5-10 trends sorted by composite score (descending).',
  ];

  return lines.filter((l) => l !== undefined).join('\n');
}

const VALID_FRESHNESS: FreshnessLabel[] = ['Fresh', 'Rising Fast', 'Established', 'Fading'];

/**
 * Parses and validates the Gemini JSON response into TrendItem[].
 */
function parseGeminiResponse(
  raw: string,
  query: TrendQuery,
): { summary: string; trends: TrendItem[] } {
  // Strip markdown fences if present
  const cleaned = raw.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
  const parsed = JSON.parse(cleaned);

  const summary: string = typeof parsed.summary === 'string' ? parsed.summary : '';
  const rawTrends: unknown[] = Array.isArray(parsed.trends) ? parsed.trends : [];

  const trends: TrendItem[] = rawTrends.map((item: any) => ({
    title: String(item.title ?? ''),
    keyword: String(item.keyword ?? ''),
    description: String(item.description ?? ''),
    momentumScore: clampScore(item.momentumScore),
    relevanceScore: clampScore(item.relevanceScore),
    suggestedHashtags: Array.isArray(item.suggestedHashtags)
      ? item.suggestedHashtags.map(String)
      : [],
    suggestedHook: String(item.suggestedHook ?? ''),
    suggestedContentAngle: String(item.suggestedContentAngle ?? ''),
    sourceLabels: Array.isArray(item.sourceLabels)
      ? item.sourceLabels.map(String)
      : ['inferred'],
    region: isValidRegion(item.region) ? item.region : query.region,
    platform: isValidPlatform(item.platform) ? item.platform : query.platform,
    freshnessLabel: VALID_FRESHNESS.includes(item.freshnessLabel)
      ? item.freshnessLabel
      : 'Established',
  }));

  // Sort by composite score: momentum × 0.3 + relevance × 0.3 + freshness × 0.2 + platform_fit × 0.2
  trends.sort((a, b) => compositeScore(b, query) - compositeScore(a, query));

  return { summary, trends };
}

function clampScore(val: unknown): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (isNaN(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function isValidRegion(r: unknown): r is TrendRegion {
  if (!r || typeof r !== 'object') return false;
  const region = r as any;
  return ['global', 'country', 'state_province'].includes(region.scope);
}

function isValidPlatform(p: unknown): p is TrendPlatform {
  return ['instagram_reels', 'x_twitter', 'linkedin', 'all_platforms'].includes(
    p as string,
  );
}

function freshnessWeight(label: FreshnessLabel): number {
  switch (label) {
    case 'Fresh':
      return 100;
    case 'Rising Fast':
      return 80;
    case 'Established':
      return 50;
    case 'Fading':
      return 20;
  }
}

function platformFitWeight(itemPlatform: TrendPlatform, queryPlatform: TrendPlatform): number {
  if (queryPlatform === 'all_platforms') return 80;
  return itemPlatform === queryPlatform ? 100 : 40;
}

function compositeScore(item: TrendItem, query: TrendQuery): number {
  return (
    item.momentumScore * 0.3 +
    item.relevanceScore * 0.3 +
    freshnessWeight(item.freshnessLabel) * 0.2 +
    platformFitWeight(item.platform, query.platform) * 0.2
  );
}

/**
 * Main orchestrator: collects signals from providers, normalizes them,
 * passes to Gemini for consolidation and ranking, returns structured result.
 */
export async function analyzeTrends(
  query: TrendQuery,
): Promise<TrendAnalysisResult> {
  // 1. Get all registered providers
  const providers = getProviders();

  // 2. Fetch signals from all providers concurrently
  const settled = await Promise.allSettled(
    providers.map((p) => p.fetchSignals(query)),
  );

  // 3. Collect successful results, log warnings for failures
  const allRawSignals: RawTrendSignal[] = [];
  settled.forEach((result, idx) => {
    if (result.status === 'fulfilled') {
      allRawSignals.push(...result.value);
    } else {
      console.warn(
        `Trend provider "${providers[idx].name}" failed: ${result.reason}`,
      );
    }
  });

  // 4. Normalize and score all signals
  const normalized = normalizeSignals(allRawSignals, query);

  // 5. Pass to Gemini for consolidation, clustering, ranking, content generation
  const prompt = buildGeminiPrompt(query, normalized);
  const geminiRaw = await generateContent(prompt, getModel('text'));

  // 6. Parse Gemini response
  const { summary, trends } = parseGeminiResponse(geminiRaw, query);

  // 7. Return structured result
  return {
    queryId: '', // set after Firestore persistence by the route handler
    platform: query.platform,
    domain: query.domain,
    region: query.region,
    timeWindow: query.timeWindow,
    language: query.language,
    generatedAt: new Date().toISOString(),
    summary,
    trends,
  };
}
