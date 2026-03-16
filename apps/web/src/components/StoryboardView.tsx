import type { Storyboard } from '@content-storyteller/shared';

export interface StoryboardViewProps { storyboard: Partial<Storyboard>; }

export function StoryboardView({ storyboard }: StoryboardViewProps) {
  const { scenes, totalDuration, pacing } = storyboard;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-600" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
          </div>
          <h3 className="text-base font-semibold text-gray-900">Storyboard</h3>
        </div>
        {(totalDuration || pacing) && (
          <div className="flex gap-3 text-xs text-gray-500">
            {totalDuration && <span className="pill-neutral">⏱ {totalDuration}</span>}
            {pacing && <span className="pill-neutral">🎵 {pacing}</span>}
          </div>
        )}
      </div>
      {scenes && scenes.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {scenes.map((scene, i) => (
            <div key={i} className="card p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-7 h-7 rounded-lg bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center">{scene.sceneNumber}</span>
                <span className="text-xs text-gray-500 font-medium">{scene.duration}</span>
              </div>
              <p className="text-sm text-gray-800 leading-relaxed mb-3">{scene.description}</p>
              <div className="space-y-1.5">
                {scene.motionStyle && <DetailLine label="Motion" value={scene.motionStyle} />}
                {scene.cameraDirection && <DetailLine label="Camera" value={scene.cameraDirection} />}
                {scene.textOverlay && <DetailLine label="Text" value={scene.textOverlay} />}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400 italic">No scenes available yet.</p>
      )}
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500">
      <span className="font-medium text-gray-600">{label}:</span> {value}
    </div>
  );
}
