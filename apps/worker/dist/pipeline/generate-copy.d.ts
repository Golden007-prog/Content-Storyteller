import { PipelineStage, PipelineContext, StageResult, JobState } from '@content-storyteller/shared';
/**
 * GenerateCopy stage: generate a structured CopyPackage from the Creative Brief
 * using the Google GenAI SDK, then persist the copy asset.
 */
export declare class GenerateCopy implements PipelineStage {
    readonly name = "GenerateCopy";
    readonly jobState = JobState.GeneratingCopy;
    execute(context: PipelineContext): Promise<StageResult>;
}
//# sourceMappingURL=generate-copy.d.ts.map