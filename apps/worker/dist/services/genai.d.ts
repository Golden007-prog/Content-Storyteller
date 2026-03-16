/**
 * Generate content using a specific model via Vertex AI (or API key fallback).
 * The model parameter is required — callers get it from the ModelRouter.
 */
export declare function generateContent(prompt: string, model: string): Promise<string>;
/**
 * Generate content with multimodal parts using a specific model.
 * The model parameter is required — callers get it from the ModelRouter.
 */
export declare function generateContentMultimodal(parts: Array<{
    text: string;
} | {
    inlineData: {
        data: string;
        mimeType: string;
    };
}>, model: string): Promise<string>;
//# sourceMappingURL=genai.d.ts.map