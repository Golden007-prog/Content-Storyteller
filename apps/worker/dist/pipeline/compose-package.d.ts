import { PipelineStage, PipelineContext, StageResult, JobState } from '@content-storyteller/shared';
/**
 * ComposePackage stage: assemble the final Asset Bundle from all
 * generated assets, write the bundle manifest, and mark the Job completed.
 */
export declare class ComposePackage implements PipelineStage {
    readonly name = "ComposePackage";
    readonly jobState = JobState.ComposingPackage;
    execute(context: PipelineContext): Promise<StageResult>;
}
//# sourceMappingURL=compose-package.d.ts.map