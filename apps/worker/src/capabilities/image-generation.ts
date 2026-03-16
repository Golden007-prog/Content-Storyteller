import {
  GenerationCapability,
  GenerationInput,
  GenerationOutput,
  CreativeBrief,
  getModel,
  getLocation,
} from '@content-storyteller/shared';
import { VertexAI } from '@google-cloud/vertexai';
import { getGcpConfig } from '../config/gcp';

/**
 * Image generation capability backed by Vertex AI.
 * Checks availability via a lightweight API probe and handles
 * access-denied (403) errors gracefully by reporting unavailable.
 */
export class ImageGenerationCapability implements GenerationCapability {
  readonly name = 'image_generation';

  private cachedAvailability: boolean | null = null;
  private lastCheckTime = 0;
  private readonly cacheTtlMs = 60_000; // re-check every 60s

  async isAvailable(): Promise<boolean> {
    const now = Date.now();
    if (this.cachedAvailability !== null && now - this.lastCheckTime < this.cacheTtlMs) {
      return this.cachedAvailability;
    }

    try {
      const cfg = getGcpConfig();
      const vertexAI = new VertexAI({ project: cfg.projectId, location: getLocation('image') });
      // Attempt to instantiate the generative model — this validates credentials
      // and project access without making a full generation call
      vertexAI.getGenerativeModel({ model: getModel('image') });
      this.cachedAvailability = true;
    } catch (err: unknown) {
      if (isAccessDenied(err)) {
        this.cachedAvailability = false;
      } else {
        // Transient errors — assume unavailable but don't cache long
        this.cachedAvailability = false;
      }
    }

    this.lastCheckTime = now;
    return this.cachedAvailability;
  }

  async generate(input: GenerationInput): Promise<GenerationOutput> {
    const { jobId, data } = input;
    const prompt = (data.prompt as string) || '';
    const brief = data.brief as CreativeBrief | undefined;

    try {
      const cfg = getGcpConfig();
      const vertexAI = new VertexAI({ project: cfg.projectId, location: getLocation('image') });
      const model = vertexAI.getGenerativeModel({ model: getModel('image') });

      const imagePrompt = prompt || buildImagePrompt(brief);

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: imagePrompt }] }],
      });

      const responseText =
        result.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      return {
        success: true,
        assets: responseText ? [responseText] : [],
        metadata: { jobId, model: getModel('image'), promptUsed: imagePrompt },
      };
    } catch (err: unknown) {
      if (isAccessDenied(err)) {
        return { success: false, assets: [], metadata: { reason: 'access-denied' } };
      }
      throw err;
    }
  }
}

function buildImagePrompt(brief?: CreativeBrief): string {
  if (!brief) return 'Generate a marketing visual';
  return `Create a detailed marketing image description for:
- Target Audience: ${brief.targetAudience}
- Tone: ${brief.tone}
- Visual Direction: ${brief.visualDirection}
- Key Messages: ${brief.keyMessages.join(', ')}`;
}

function isAccessDenied(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const code = (err as Record<string, unknown>).code;
    const status = (err as Record<string, unknown>).status;
    if (code === 403 || code === '403' || status === 403 || status === '403') return true;
    const message = String((err as Record<string, unknown>).message || '');
    if (message.includes('403') || message.toLowerCase().includes('permission denied')) {
      return true;
    }
  }
  return false;
}
