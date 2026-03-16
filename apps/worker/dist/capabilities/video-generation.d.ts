import { GenerationCapability, GenerationInput, GenerationOutput } from '@content-storyteller/shared';
/**
 * Video generation capability backed by Vertex AI Veo API.
 *
 * Uses the Vertex AI REST API to submit video generation jobs,
 * polls for completion with a 10-minute timeout, and returns
 * the resulting mp4 video data as base64.
 *
 * Falls back gracefully when the API is unavailable or access is denied.
 */
export declare class VideoGenerationCapability implements GenerationCapability {
    readonly name = "video_generation";
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
//# sourceMappingURL=video-generation.d.ts.map