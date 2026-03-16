import type { TrendAnalysisResult, TrendItem } from '@content-storyteller/shared';
import { TrendSummary } from './TrendSummary';
import { TrendCard } from './TrendCard';

interface TrendResultsProps {
  result: TrendAnalysisResult | null;
  isLoading: boolean;
  onUseTrend: (trend: TrendItem) => void;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-24" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="skeleton h-64" />
        <div className="skeleton h-64" />
        <div className="skeleton h-64" />
      </div>
    </div>
  );
}

export function TrendResults({ result, isLoading, onUseTrend }: TrendResultsProps) {
  if (isLoading) return <LoadingSkeleton />;
  if (!result) return null;

  if (result.trends.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        </div>
        <p className="text-gray-500">No trends found. Try adjusting your filters.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TrendSummary summary={result.summary} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {result.trends.map((trend, idx) => (
          <TrendCard key={`${trend.keyword}-${idx}`} trend={trend} onUseTrend={onUseTrend} />
        ))}
      </div>
    </div>
  );
}
