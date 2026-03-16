import { JobState } from '../types/job';

export interface GenerationInput {
  jobId: string;
  data: Record<string, unknown>;
}

export interface GenerationOutput {
  success: boolean;
  assets: string[];
  metadata?: Record<string, unknown>;
}

export interface GenerationCapability {
  name: string;
  isAvailable(): Promise<boolean>;
  generate(input: GenerationInput): Promise<GenerationOutput>;
}

export interface StageResult {
  success: boolean;
  assets: string[];
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface PipelineContext {
  jobId: string;
  correlationId: string;
  uploadedMediaPaths: string[];
  workingData: Record<string, unknown>;
}

export interface PipelineStage {
  name: string;
  jobState: JobState;
  execute(context: PipelineContext): Promise<StageResult>;
}
