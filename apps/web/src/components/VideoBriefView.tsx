import type { VideoBrief } from '@content-storyteller/shared';
import { VideoPlayer } from './VideoPlayer';

export interface VideoBriefViewProps { videoBrief: Partial<VideoBrief>; videoUrl?: string; videoStatus?: 'ok' | 'timeout' | 'failed' | 'pending'; }

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-2">
      <p className="text-label mb-0.5">{label}</p>
      <p className="text-sm text-gray-800">{value}</p>
    </div>
  );
}

export function VideoBriefView({ videoBrief, videoUrl, videoStatus }: VideoBriefViewProps) {
  const { totalDuration, motionStyle, textOverlayStyle, cameraDirection, energyDirection } = videoBrief;
  const hasContent = totalDuration || motionStyle || textOverlayStyle || cameraDirection || energyDirection;

  const statusMessage = !videoUrl && videoStatus === 'timeout'
    ? 'Video rendering timed out — storyboard and brief shown as fallback.'
    : !videoUrl && videoStatus === 'failed'
    ? 'Video generation failed — storyboard and brief shown as fallback.'
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-600" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
        </div>
        <h3 className="text-base font-semibold text-gray-900">Video Brief</h3>
      </div>
      {videoUrl ? <VideoPlayer signedUrl={videoUrl} /> : statusMessage ? (
        <div className="card p-4 bg-amber-50 border-amber-200">
          <p className="text-sm text-amber-700">{statusMessage}</p>
        </div>
      ) : (
        <div className="card p-4 bg-amber-50 border-amber-200">
          <p className="text-sm text-amber-700">Video generation not available — storyboard and brief shown as fallback.</p>
        </div>
      )}
      {hasContent ? (
        <div className="card p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            {totalDuration && <DetailRow label="Total Duration" value={totalDuration} />}
            {motionStyle && <DetailRow label="Motion Style" value={motionStyle} />}
            {textOverlayStyle && <DetailRow label="Text Overlay" value={textOverlayStyle} />}
            {cameraDirection && <DetailRow label="Camera Direction" value={cameraDirection} />}
            {energyDirection && <DetailRow label="Energy Direction" value={energyDirection} />}
          </div>
        </div>
      ) : videoStatus !== 'timeout' && videoStatus !== 'failed' ? (
        <p className="text-sm text-gray-400 italic">No video brief available yet.</p>
      ) : null}
    </div>
  );
}
