// Types
export { Platform, Tone } from './types/enums';
export { TrendPlatform } from './types/trends';
export type {
  TrendDomainPreset,
  TrendDomain,
  TrendRegion,
  TrendQuery,
  FreshnessLabel,
  TrendItem,
  TrendAnalysisResult,
} from './types/trends';
export { Job, JobState, AssetReference, AssetType, FallbackNotice, OutputPreference } from './types/job';
export type { OutputIntent, StepMetadata, StepStatus, StepsMap, JobWarning } from './types/job';
export type {
  GifStylePreset,
  ImageClassification,
  GifMotionConcept,
  GifStoryboardBeat,
  GifStoryboard,
  GifAssetMetadata,
} from './types/gif';
export {
  UploadMediaRequest,
  UploadMediaResponse,
  CreateJobRequest,
  CreateJobResponse,
  PollJobStatusResponse,
  RetrieveAssetsResponse,
  StreamEventShape,
  ErrorResponse,
  AssetReferenceWithUrl,
} from './types/api';
export { GenerationTaskMessage } from './types/messages';
export {
  TranscriptEntry,
  LiveSession,
  LiveSessionStatus,
  ExtractedCreativeDirection,
  StartLiveSessionResponse,
  LiveInputResponse,
  StopLiveSessionResponse,
} from './types/live-session';

// Schemas
export { CopyPackage } from './schemas/copy-package';
export { StoryboardScene, Storyboard } from './schemas/storyboard';
export { VideoBrief } from './schemas/video-brief';
export { CreativeBrief } from './schemas/creative-brief';
export { AssetBundle } from './schemas/asset-bundle';
export { ImageConcept } from './schemas/image-concept';
export {
  GenerationCapability,
  GenerationInput,
  GenerationOutput,
  StageResult,
  PipelineStage,
  PipelineContext,
} from './schemas/generation';

// AI Model Config
export type { CapabilitySlot, ModelConfigValues } from './ai/model-config';
export { MODEL_DEFAULTS, SLOT_ENV_VARS, LOCATION_DEFAULTS, SLOT_LOCATION_ENV_VARS, getModelConfig, getLocationForSlot, _resetConfigForTesting } from './ai/model-config';

// AI Model Router
export type { SlotStatus, ResolvedSlot, ResolvedModelMap } from './ai/model-router';
export {
  FALLBACK_CHAINS,
  initModelRouter,
  getModel,
  getLocation,
  getSlotInfo,
  getResolvedModels,
  RouterNotInitializedError,
  ModelUnavailableError,
  _resetRouterForTesting,
} from './ai/model-router';
