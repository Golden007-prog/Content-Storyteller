export enum TrendPlatform {
  InstagramReels = 'instagram_reels',
  XTwitter = 'x_twitter',
  LinkedIn = 'linkedin',
  AllPlatforms = 'all_platforms',
}

export type TrendDomainPreset =
  | 'tech'
  | 'fashion'
  | 'finance'
  | 'fitness'
  | 'education'
  | 'gaming'
  | 'startup';

export type TrendDomain = TrendDomainPreset | (string & {});

export interface TrendRegion {
  scope: 'global' | 'country' | 'state_province';
  country?: string;
  stateProvince?: string;
}

export interface TrendQuery {
  platform: TrendPlatform;
  domain: TrendDomain;
  region: TrendRegion;
  timeWindow?: '24h' | '7d' | '30d';
  language?: string;
}

export type FreshnessLabel = 'Fresh' | 'Rising Fast' | 'Established' | 'Fading';

export interface TrendItem {
  title: string;
  keyword: string;
  description: string;
  momentumScore: number;       // 0–100
  relevanceScore: number;      // 0–100
  suggestedHashtags: string[];
  suggestedHook: string;
  suggestedContentAngle: string;
  sourceLabels: string[];
  region: TrendRegion;
  platform: TrendPlatform;
  freshnessLabel: FreshnessLabel;
}

export interface TrendAnalysisResult {
  queryId: string;
  platform: TrendPlatform;
  domain: TrendDomain;
  region: TrendRegion;
  timeWindow?: string;
  language?: string;
  generatedAt: string;         // ISO 8601
  summary: string;
  trends: TrendItem[];
}
