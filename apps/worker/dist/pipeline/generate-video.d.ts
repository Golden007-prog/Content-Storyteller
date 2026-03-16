import { PipelineStage, PipelineContext, StageResult, JobState } from '@content-storyteller/shared';
/**
 * GenerateVideo stage: generate a structured Storyboard and VideoBrief from
 * the Creative Brief using the Google GenAI SDK, persist both as JSON assets,
 * and optionally attempt actual video generation if the capability is available.
 */
export declare class GenerateVideo implements PipelineStage {
    readonly name = "GenerateVideo";
    readonly jobState = JobState.GeneratingVideo;
    execute(context: PipelineContext): Promise<StageResult>;
}
//# sourceMappingURL=generate-video.d.ts.map