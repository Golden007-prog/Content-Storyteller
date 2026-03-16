import { TrendPlatform } from '@content-storyteller/shared';
import type { TrendItem, FreshnessLabel } from '@content-storyteller/shared';

interface TrendCardProps {
  trend: TrendItem;
  onUseTrend: (trend: TrendItem) => void;
}

const FRESHNESS_STYLES: Record<FreshnessLabel, string> = {
  Fresh: 'bg-green-100 text-green-700',
  'Rising Fast': 'bg-brand-100 text-brand-700',
  Established: 'bg-gray-100 text-gray-600',
  Fading: 'bg-orange-100 text-orange-700',
};

const PLATFORM_LABELS: Record<string, string> = {
  [TrendPlatform.InstagramReels]: 'Instagram',
  [TrendPlatform.XTwitter]: 'Twitter',
  [TrendPlatform.LinkedIn]: 'LinkedIn',
  [TrendPlatform.AllPlatforms]: 'All Platforms',
};

function formatRegion(region: TrendItem['region']): string {
  if (region.scope === 'global') return 'Global';
  if (region.scope === 'country') return region.country || 'Country';
  if (region.scope === 'state_province') {
    return [region.stateProvince, region.country].filter(Boolean).join(', ') || 'State/Province';
  }
  return 'Unknown';
}

export function TrendCard({ trend, onUseTrend }: TrendCardProps) {
  return (
    <div className="card-elevated p-5 flex flex-col gap-3 group">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-base font-semibold text-gray-900 leading-snug">{trend.title}</h4>
        <span className={`pill shrink-0 ${FRESHNESS_STYLES[trend.freshnessLabel]}`}>
          {trend.freshnessLabel}
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-600 leading-relaxed line-clamp-2">{trend.description}</p>

      {/* Metrics row */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          {(trend.momentumScore * 100).toLocaleString()}
        </span>
        <span className="flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
          +{trend.momentumScore}%
        </span>
      </div>

      {/* Momentum bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500">Momentum</span>
          <span className="text-xs font-semibold text-gray-900">{trend.momentumScore}/100</span>
        </div>
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-brand rounded-full transition-all duration-500" style={{ width: `${Math.min(Math.max(trend.momentumScore, 0), 100)}%` }} />
        </div>
      </div>

      {/* Hashtags */}
      <div className="flex flex-wrap gap-1.5">
        {trend.suggestedHashtags.slice(0, 4).map((tag) => (
          <span key={tag} className="pill-neutral !text-[11px]">
            {tag.startsWith('#') ? tag : `#${tag}`}
          </span>
        ))}
      </div>

      {/* Platform + Region badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="pill-brand !text-[11px]">{PLATFORM_LABELS[trend.platform] || trend.platform}</span>
        <span className="pill-neutral !text-[11px]">{formatRegion(trend.region)}</span>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={() => onUseTrend(trend)}
        className="mt-auto btn-primary !py-2.5 !text-sm w-full opacity-90 group-hover:opacity-100 transition-opacity"
      >
        Use in Content Storyteller
      </button>
    </div>
  );
}
