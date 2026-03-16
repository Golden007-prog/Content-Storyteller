import { PipelineStage, PipelineContext, StageResult, JobState, GifStylePreset, ImageClassification, GifStoryboardBeat } from '@content-storyteller/shared';
/**
 * Map an ImageClassification to the appropriate GifStylePreset.
 * Exported for independent testing.
 */
export declare function classificationToPreset(classification: ImageClassification): GifStylePreset;
/**
 * Validate and clamp a storyboard's beat count to the 3–6 range.
 * - If fewer than 3 beats, pads with default beats.
 * - If more than 6 beats, truncates to 6.
 * Exported for independent testing.
 */
export declare function validateStoryboardBeats(beats: GifStoryboardBeat[]): GifStoryboardBeat[];
/**
 * GenerateGif stage: analyze an uploaded image, classify it, generate a motion
 * concept and storyboard, then render a GIF via the gif_generation capability.
 *
 * Non-critical stage — failures produce warnings, not job failures.
 */
export declare class GenerateGif implements PipelineStage {
    readonly name = "GenerateGif";
    readonly jobState = JobState.GeneratingGif;
    execute(context: PipelineContext): Promise<StageResult>;
    /**
     * Persist motion concept and storyboard as JSON creative direction assets.
     */
    private persistCreativeDirection;
}
//# sourceMappingURL=generate-gif.d.ts.map