export type GifStylePreset =
  | 'diagram_pulse'
  | 'workflow_step_highlight'
  | 'zoom_pan_explainer'
  | 'feature_spotlight'
  | 'text_callout_animation'
  | 'process_flow_reveal'
  | 'before_after_comparison';

export type ImageClassification =
  | 'diagram'
  | 'workflow'
  | 'ui_screenshot'
  | 'chart'
  | 'infographic'
  | 'other';

export interface GifMotionConcept {
  stylePreset: GifStylePreset;
  imageClassification: ImageClassification;
  motionDescription: string;
  focusRegions: string[];
  suggestedDurationMs: number;
}

export interface GifStoryboardBeat {
  beatNumber: number;
  description: string;
  durationMs: number;
  motionType: string;
  focusArea: string;
}

export interface GifStoryboard {
  beats: GifStoryboardBeat[];
  totalDurationMs: number;
  loopStrategy: 'seamless' | 'bounce' | 'restart';
  stylePreset: GifStylePreset;
}

export interface GifAssetMetadata {
  url: string;
  mimeType: 'image/gif';
  width: number;
  height: number;
  durationMs: number;
  loop: boolean;
  fileSizeBytes: number;
  posterImageUrl?: string;
}
