import React, { useState } from 'react';
import type { TrendQuery, TrendAnalysisResult, TrendItem } from '@content-storyteller/shared';
import { analyzeTrends } from '../api/client';
import { TrendFilters } from './TrendFilters';
import { TrendResults } from './TrendResults';
import { HeroSection } from './layout/HeroSection';

interface TrendAnalyzerPageProps {
  onUseTrend: (trend: TrendItem) => void;
}

export function TrendAnalyzerPage({ onUseTrend }: TrendAnalyzerPageProps) {
  const [analysisResult, setAnalysisResult] = useState<TrendAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (query: TrendQuery) => {
    setIsLoading(true); setError(null);
    try { const result = await analyzeTrends(query); setAnalysisResult(result); }
    catch (err) { setError(err instanceof Error ? err.message : 'Trend analysis failed. Please try again.'); }
    finally { setIsLoading(false); }
  };

  return (
    <div>
      {/* Hero */}
      <div className="section-lavender">
        <div className="section-wrapper">
          <HeroSection
            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>}
            title="Trend Analyzer Mode"
            subtitle="Discover trending topics and content angles powered by AI. Stay ahead with real-time insights across all major platforms."
          >
            {!analysisResult && !isLoading && (
              <>
                <button onClick={() => document.getElementById('trend-filters')?.scrollIntoView({ behavior: 'smooth' })} className="btn-primary !py-3.5 !px-8 !text-base">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                  Start Analyzing Trends
                </button>
                <p className="text-xs text-gray-400 mt-3">Real-time data from all major platforms worldwide</p>
              </>
            )}
          </HeroSection>
        </div>
      </div>

      {/* Content */}
      <div className="section-wrapper py-10" id="trend-filters">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
          {/* Main column */}
          <div className="space-y-8">
            <TrendFilters onSubmit={handleSubmit} isLoading={isLoading} />

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between">
                <span>{error}</span>
                <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-medium text-xs ml-3">Dismiss</button>
              </div>
            )}

            <TrendResults result={analysisResult} isLoading={isLoading} onUseTrend={onUseTrend} />
          </div>

          {/* Sidebar */}
          {analysisResult && (
            <div className="space-y-4">
              {/* AI Insights */}
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-500" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                  AI Insights
                </h3>
                <ul className="space-y-2.5">
                  {analysisResult.summary.split('. ').filter(Boolean).slice(0, 4).map((insight, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-brand-500 mt-0.5 shrink-0"><circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15" /><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      {insight.trim()}{insight.endsWith('.') ? '' : '.'}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Generate Ideas */}
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Generate Ideas</h3>
                <input type="text" placeholder="Enter your niche..." className="input-base !text-sm mb-3" />
                <button className="btn-primary w-full !py-2.5 !text-sm">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                  Generate
                </button>
                {analysisResult.trends.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {analysisResult.trends.slice(0, 4).map((t) => (
                      <span key={t.keyword} className="pill-brand cursor-pointer hover:bg-brand-200 transition-colors">{t.keyword}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Export */}
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Export</h3>
                <div className="space-y-2">
                  {[
                    { icon: '📊', label: 'Export Data', desc: 'CSV format' },
                    { icon: '📄', label: 'Generate Report', desc: 'PDF summary' },
                    { icon: '🔗', label: 'Share Link', desc: 'Shareable URL' },
                  ].map((item) => (
                    <button key={item.label} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-gray-50 transition-colors">
                      <span className="text-lg">{item.icon}</span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.label}</p>
                        <p className="text-xs text-gray-500">{item.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats section */}
      <div className="section-lavender py-16">
        <div className="section-wrapper">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: '2.5M+', label: 'Topics Analyzed' },
              { value: '50+', label: 'Platforms' },
              { value: 'Real-time', label: 'Updates' },
              { value: '98%', label: 'Accuracy' },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-3xl sm:text-4xl font-extrabold bg-gradient-brand bg-clip-text text-transparent">{stat.value}</p>
                <p className="text-sm text-gray-500 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
