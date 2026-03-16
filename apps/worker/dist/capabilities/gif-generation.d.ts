import { GenerationCapability, GenerationInput, GenerationOutput } from '@content-storyteller/shared';
/**
 * GIF generation capability backed by Vertex AI Veo API (videoFast slot).
 *
 * Uses the Vertex AI REST API to submit a short video generation job
 * via the videoFast model slot, polls for completion, and returns
 * the resulting MP4 video data as base64. The pipeline stage is
 * responsible for converting the MP4 to GIF format.
 *
 * Falls back gracefully when the API is unavailable or access is denied.
 */
export declare class GifGenerationCapability implements GenerationCapability {
    readonly name = "gif_generation";
    private cachedAvailability;
    private lastCheckTime;
    private readonly cacheTtlMs;
    isAvailable(): Promise<boolean>;
    generate(input: GenerationInput): Promise<GenerationOutput>;
    /**
     * Poll the Vertex AI long-running operation until completion or timeout.
     * Returns base64-encoded video data on success, null on timeout/failure.
     */
    private pollForCompletion;
}
//# sourceMappingURL=gif-generation.d.ts.map