interface TrendSummaryProps {
  summary: string;
}

export function TrendSummary({ summary }: TrendSummaryProps) {
  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-600" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
        </div>
        <h3 className="text-base font-semibold text-gray-900">Trend Landscape</h3>
      </div>
      <p className="text-sm text-gray-600 leading-relaxed">{summary}</p>
    </div>
  );
}
