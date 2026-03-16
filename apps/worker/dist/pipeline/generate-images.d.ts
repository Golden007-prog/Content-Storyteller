import { PipelineStage, PipelineContext, StageResult, JobState } from '@content-storyteller/shared';
/**
 * GenerateImages stage: generate structured ImageConcept objects from the
 * Creative Brief using the Google GenAI SDK, persist them as a JSON asset,
 * and optionally attempt actual image generation if the capability is available.
 */
export declare class GenerateImages implements PipelineStage {
    readonly name = "GenerateImages";
    readonly jobState = JobState.GeneratingImages;
    execute(context: PipelineContext): Promise<StageResult>;
}
//# sourceMappingURL=generate-images.d.ts.map