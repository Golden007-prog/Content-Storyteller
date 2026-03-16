import React, { useState } from 'react';
import { TrendPlatform } from '@content-storyteller/shared';
import type { TrendQuery, TrendRegion } from '@content-storyteller/shared';

interface TrendFiltersProps {
  onSubmit: (query: TrendQuery) => void;
  isLoading: boolean;
}

const PLATFORM_OPTIONS: { value: TrendPlatform; label: string }[] = [
  { value: TrendPlatform.AllPlatforms, label: 'All' },
  { value: TrendPlatform.InstagramReels, label: 'Instagram' },
  { value: TrendPlatform.XTwitter, label: 'Twitter' },
  { value: TrendPlatform.LinkedIn, label: 'LinkedIn' },
];

const DOMAIN_PRESETS = [
  { value: 'all', label: 'All' },
  { value: 'tech', label: 'Tech' },
  { value: 'fashion', label: 'Fashion' },
  { value: 'finance', label: 'Finance' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'education', label: 'Education' },
  { value: 'gaming', label: 'Gaming' },
  { value: 'startup', label: 'Startup' },
] as const;

const TIME_WINDOW_OPTIONS: { value: '' | '24h' | '7d' | '30d'; label: string }[] = [
  { value: '', label: 'All' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
];

const REGION_SCOPES: { value: TrendRegion['scope']; label: string }[] = [
  { value: 'global', label: 'Global' },
  { value: 'country', label: 'Country' },
  { value: 'state_province', label: 'State/Province' },
];

export function TrendFilters({ onSubmit, isLoading }: TrendFiltersProps) {
  const [platform, setPlatform] = useState<TrendPlatform>(TrendPlatform.InstagramReels);
  const [domain, setDomain] = useState<string>('tech');
  const [regionScope, setRegionScope] = useState<TrendRegion['scope']>('global');
  const [country, setCountry] = useState<string>('');
  const [stateProvince, setStateProvince] = useState<string>('');
  const [timeWindow, setTimeWindow] = useState<'' | '24h' | '7d' | '30d'>('');
  const [language, setLanguage] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    if (!platform) { setValidationError('Please select a platform.'); return; }
    const resolvedDomain = domain === 'all' ? 'tech' : domain;
    const region: TrendRegion = { scope: regionScope };
    if (regionScope === 'country' || regionScope === 'state_province') region.country = country;
    if (regionScope === 'state_province') region.stateProvince = stateProvince;
    const query: TrendQuery = { platform, domain: resolvedDomain, region };
    if (timeWindow) query.timeWindow = timeWindow;
    if (language.trim()) query.language = language.trim();
    onSubmit(query);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Platform pills */}
      <FilterRow label="Platform">
        {PLATFORM_OPTIONS.map((opt) => (
          <PillButton key={opt.value} active={platform === opt.value} onClick={() => setPlatform(opt.value)}>{opt.label}</PillButton>
        ))}
      </FilterRow>

      {/* Time window pills */}
      <FilterRow label="Time">
        {TIME_WINDOW_OPTIONS.map((opt) => (
          <PillButton key={opt.value} active={timeWindow === opt.value} onClick={() => setTimeWindow(opt.value)}>{opt.label}</PillButton>
        ))}
      </FilterRow>

      {/* Category pills */}
      <FilterRow label="Category">
        {DOMAIN_PRESETS.map((opt) => (
          <PillButton key={opt.value} active={domain === opt.value} onClick={() => setDomain(opt.value)}>{opt.label}</PillButton>
        ))}
      </FilterRow>

      {/* Region */}
      <FilterRow label="Region">
        {REGION_SCOPES.map((opt) => (
          <PillButton key={opt.value} active={regionScope === opt.value} onClick={() => setRegionScope(opt.value)}>{opt.label}</PillButton>
        ))}
      </FilterRow>

      {(regionScope === 'country' || regionScope === 'state_province') && (
        <div className="flex gap-3">
          <input type="text" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country..." className="input-base !text-sm flex-1" />
          {regionScope === 'state_province' && (
            <input type="text" value={stateProvince} onChange={(e) => setStateProvince(e.target.value)} placeholder="State / Province..." className="input-base !text-sm flex-1" />
          )}
        </div>
      )}

      {/* Language */}
      <div>
        <label htmlFor="trend-language" className="text-label mb-2 block">Language (optional)</label>
        <input id="trend-language" type="text" value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="e.g. English, Spanish..." className="input-base !text-sm" />
      </div>

      {validationError && <p className="text-sm text-red-600">{validationError}</p>}

      <button type="submit" disabled={isLoading} className="btn-primary w-full !py-3.5">
        {isLoading ? (
          <><span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Analyzing...</>
        ) : (
          <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg> Analyze Trends</>
        )}
      </button>
    </form>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider w-16 shrink-0">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function PillButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all duration-150 ${
        active
          ? 'bg-gradient-brand text-white shadow-sm shadow-brand-500/20'
          : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-300 hover:text-brand-600'
      }`}
    >
      {children}
    </button>
  );
}
