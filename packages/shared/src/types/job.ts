export enum JobState {
  Queued = 'queued',
  ProcessingInput = 'processing_input',
  GeneratingCopy = 'generating_copy',
  GeneratingImages = 'generating_images',
  GeneratingVideo = 'generating_video',
  GeneratingGif = 'generating_gif',
  ComposingPackage = 'composing_package',
  Completed = 'completed',
  Failed = 'failed',
}

export enum AssetType {
  Copy = 'copy',
  Image = 'image',
  Video = 'video',
  Storyboard = 'storyboard',
  VoiceoverScript = 'voiceover_script',
  Gif = 'gif',
  ImageConcept = 'image_concept',
  VideoBriefMeta = 'video_brief_meta',
  GifCreativeDirection = 'gif_creative_direction',
}

export interface AssetReference {
  assetId: string;
  jobId: string;
  assetType: AssetType;
  storagePath: string;
  generationTimestamp: Date;
  status: 'pending' | 'completed' | 'skipped';
}

export interface FallbackNotice {
  capability: string;
  reason: string;
  timestamp: Date;
  stage: JobState;
}

export interface OutputIntent {
  wantsCopy: boolean;
  wantsHashtags: boolean;
  wantsImage: boolean;
  wantsVideo: boolean;
  wantsStoryboard: boolean;
  wantsVoiceover: boolean;
  wantsCarousel: boolean;
  wantsThread: boolean;
  wantsLinkedInPost: boolean;
  wantsGif: boolean;
}

export type StepStatus = 'queued' | 'running' | 'completed' | 'skipped' | 'failed';

export interface StepMetadata {
  status: StepStatus;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
}

export interface StepsMap {
  processInput: StepMetadata;
  generateCopy: StepMetadata;
  generateImages: StepMetadata;
  generateVideo: StepMetadata;
  generateGif: StepMetadata;
  composePackage: StepMetadata;
}

export interface JobWarning {
  stage: string;
  message: string;
  timestamp: Date;
  severity: 'info' | 'warning';
}

export enum OutputPreference {
  Auto = 'auto',
  CopyOnly = 'copy_only',
  CopyImage = 'copy_image',
  CopyVideo = 'copy_video',
  FullPackage = 'full_package',
  CopyGif = 'copy_gif',
}

export interface Job {
  id: string;
  correlationId: string;
  idempotencyKey: string;
  state: JobState;
  uploadedMediaPaths: string[];
  creativeBrief?: import('../schemas/creative-brief').CreativeBrief;
  assets: AssetReference[];
  fallbackNotices: FallbackNotice[];
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
  promptText?: string;
  platform?: import('./enums').Platform;
  tone?: import('./enums').Tone;
  outputIntent?: OutputIntent;
  outputPreference?: OutputPreference;
  steps?: StepsMap;
  requestedOutputs?: string[];
  completedOutputs?: string[];
  skippedOutputs?: string[];
  warnings?: JobWarning[];
}
