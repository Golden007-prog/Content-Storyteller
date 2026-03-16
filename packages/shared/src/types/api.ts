import { AssetReference, Job, JobState, OutputPreference, OutputIntent, StepsMap, JobWarning } from './job';
import { AssetBundle } from '../schemas/asset-bundle';
import { Platform, Tone } from './enums';
import { CreativeBrief } from '../schemas/creative-brief';
import { CopyPackage } from '../schemas/copy-package';
import { Storyboard } from '../schemas/storyboard';
import { VideoBrief } from '../schemas/video-brief';
import { ImageConcept } from '../schemas/image-concept';
import { GifAssetMetadata } from './gif';

export interface UploadMediaRequest {
  file: Uint8Array;
  fileName: string;
  contentType: string;
}

export interface UploadMediaResponse {
  uploadPath: string;
  fileName: string;
  contentType: string;
  size: number;
}

export interface CreateJobRequest {
  uploadedMediaPaths: string[];
  idempotencyKey: string;
  promptText: string;
  platform: Platform;
  tone: Tone;
  outputPreference?: OutputPreference;
}

export interface CreateJobResponse {
  jobId: string;
  state: JobState;
  createdAt: Date;
}

export interface PollJobStatusResponse {
  jobId: string;
  state: JobState;
  assets: AssetReference[];
  errorMessage?: string;
  updatedAt: Date;
  creativeBrief?: CreativeBrief;
  platform?: Platform;
  tone?: Tone;
  requestedOutputs?: string[];
  skippedOutputs?: string[];
  outputIntent?: OutputIntent;
}

export interface RetrieveAssetsResponse {
  bundle: AssetBundle;
}

export interface StreamEventShape {
  event: string;
  data: {
    jobId: string;
    state: JobState;
    assets?: AssetReference[];
    errorMessage?: string;
    timestamp: string;
    creativeBrief?: CreativeBrief;
    partialCopy?: Partial<CopyPackage>;
    partialStoryboard?: Partial<Storyboard>;
    partialVideoBrief?: Partial<VideoBrief>;
    partialImageConcepts?: ImageConcept[];
    partialGifAsset?: GifAssetMetadata;
    outputIntent?: OutputIntent;
    steps?: StepsMap;
    requestedOutputs?: string[];
    skippedOutputs?: string[];
    warnings?: JobWarning[];
  };
}

export interface AssetReferenceWithUrl extends AssetReference {
  signedUrl: string;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    correlationId: string;
  };
}
