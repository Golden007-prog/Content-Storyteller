import { PipelineStage, PipelineContext, StageResult, JobState } from '@content-storyteller/shared';
/**
 * ProcessInput stage: Creative Director Agent that produces a platform-aware,
 * tone-aware Creative Brief using the Google GenAI SDK.
 */
export declare class ProcessInput implements PipelineStage {
    readonly name = "ProcessInput";
    readonly jobState = JobState.ProcessingInput;
    execute(context: PipelineContext): Promise<StageResult>;
}
//# sourceMappingURL=process-input.d.ts.map