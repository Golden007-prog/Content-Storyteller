import { GenerationCapability, GenerationInput, GenerationOutput } from '@content-storyteller/shared';
/**
 * Image generation capability backed by Vertex AI.
 * Checks availability via a lightweight API probe and handles
 * access-denied (403) errors gracefully by reporting unavailable.
 */
export declare class ImageGenerationCapability implements GenerationCapability {
    readonly name = "image_generation";
    private cachedAvailability;
    private lastCheckTime;
    private readonly cacheTtlMs;
    isAvailable(): Promise<boolean>;
    generate(input: GenerationInput): Promise<GenerationOutput>;
}
//# sourceMappingURL=image-generation.d.ts.map