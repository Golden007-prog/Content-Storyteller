import { JobState } from '@content-storyteller/shared';
import type { StepsMap } from '@content-storyteller/shared';

interface Stage { key: JobState; label: string; }

const PIPELINE_STAGES: Stage[] = [
  { key: JobState.ProcessingInput, label: 'Processing Input' },
  { key: JobState.GeneratingCopy, label: 'Generating Copy' },
  { key: JobState.GeneratingImages, label: 'Generating Images' },
  { key: JobState.GeneratingVideo, label: 'Generating Video' },
  { key: JobState.GeneratingGif, label: 'Generating GIF' },
  { key: JobState.ComposingPackage, label: 'Composing Package' },
];

const STATE_ORDER: JobState[] = [
  JobState.Queued, JobState.ProcessingInput, JobState.GeneratingCopy,
  JobState.GeneratingImages, JobState.GeneratingVideo, JobState.GeneratingGif, JobState.ComposingPackage, JobState.Completed,
];

const STAGE_TO_STEP_KEY: Record<string, keyof StepsMap> = {
  [JobState.ProcessingInput]: 'processInput',
  [JobState.GeneratingCopy]: 'generateCopy',
  [JobState.GeneratingImages]: 'generateImages',
  [JobState.GeneratingVideo]: 'generateVideo',
  [JobState.GeneratingGif]: 'generateGif',
  [JobState.ComposingPackage]: 'composePackage',
};

function getStatus(stageKey: JobState, currentState: JobState, steps?: StepsMap): 'pending' | 'active' | 'completed' | 'skipped' {
  // If steps metadata is available, check for skipped status
  if (steps) {
    const stepKey = STAGE_TO_STEP_KEY[stageKey];
    if (stepKey && steps[stepKey]?.status === 'skipped') {
      return 'skipped';
    }
  }
  const si = STATE_ORDER.indexOf(stageKey);
  const ci = STATE_ORDER.indexOf(currentState);
  if (ci < 0 || si < 0) return 'pending';
  if (currentState === stageKey) return 'active';
  if (ci > si) return 'completed';
  return 'pending';
}

export interface GenerationTimelineProps { currentState: JobState; steps?: StepsMap; }

export function GenerationTimeline({ currentState, steps }: GenerationTimelineProps) {
  return (
    <div className="w-full" role="list" aria-label="Generation pipeline stages">
      {PIPELINE_STAGES.map((stage, index) => {
        const status = getStatus(stage.key, currentState, steps);
        const isLast = index === PIPELINE_STAGES.length - 1;
        return (
          <div key={stage.key} className="flex items-start" role="listitem">
            <div className="flex flex-col items-center mr-3">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                status === 'completed' ? 'bg-green-100 text-green-600 border-2 border-green-400' :
                status === 'active' ? 'bg-brand-100 text-brand-600 border-2 border-brand-400 animate-pulseGlow' :
                status === 'skipped' ? 'bg-gray-100 text-gray-400 border-2 border-gray-200' :
                'bg-gray-100 text-gray-400 border-2 border-gray-200'
              }`}>
                {status === 'completed' ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                ) : status === 'skipped' ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              {!isLast && <div className={`w-0.5 h-6 transition-colors duration-300 ${status === 'completed' ? 'bg-green-300' : 'bg-gray-200'}`} />}
            </div>
            <div className="pt-1.5 pb-6">
              <p className={`text-sm font-medium transition-colors ${
                status === 'completed' ? 'text-green-700' : status === 'active' ? 'text-brand-700' : status === 'skipped' ? 'text-gray-400' : 'text-gray-400'
              }`}>{stage.label}</p>
              {status === 'active' && <p className="text-xs text-brand-500 mt-0.5">In progress…</p>}
              {status === 'completed' && <p className="text-xs text-green-500 mt-0.5">Done</p>}
              {status === 'skipped' && <p className="text-xs text-gray-400 mt-0.5">Skipped</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
