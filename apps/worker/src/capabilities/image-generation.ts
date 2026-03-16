import {
  GenerationCapability,
  GenerationInput,
  GenerationOutput,
  CreativeBrief,
  getModel,
  getLocation,
} from '@content-storyteller/shared';
import { getGcpConfig } from '../config/gcp';

const IMAGE_MAX_RETRIES = 3;
const IMAGE_INITIAL_RETRY_DELAY_MS = 3000;

function sleepMs(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 503;
}

function isRetryableMessage(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes('resource_exhausted') || lower.includes('429') || lower.includes('quota') || lower.includes('503');
}

/**
 * Image generation capability backed by Vertex AI Imagen API.
 * Uses the Imagen REST API (predict endpoint) to generate real binary images.
 * Checks availability via a lightweight API probe and handles
 * access-denied (403/401) errors gracefully by reporting unavailable.
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

    if (!getGcpConfig().projectId) {
      this.cachedAvailability = false;
      this.lastCheckTime = now;
      return false;
    }

    try {
      const { GoogleAuth } = await import('google-auth-library');
      const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
      await auth.getAccessToken();
      this.cachedAvailability = true;
    } catch (err: unknown) {
      this.cachedAvailability = false;
    }

    this.lastCheckTime = now;
    return this.cachedAvailability;
  }

  async generate(input: GenerationInput): Promise<GenerationOutput> {
    const { jobId, data } = input;
    const prompt = (data.prompt as string) || '';
    const brief = data.brief as CreativeBrief | undefined;

    try {
      const { GoogleAuth } = await import('google-auth-library');
      const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
      const accessToken = await auth.getAccessToken();

      if (!accessToken) {
        return { success: false, assets: [], metadata: { reason: 'no-access-token' } };
      }

      const cfg = getGcpConfig();
      const location = getLocation('image');
      const model = getModel('image');
      const imagePrompt = prompt || buildImagePrompt(brief);

      // Imagen REST API predict endpoint
      const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${cfg.projectId}/locations/${location}/publishers/google/models/${model}:predict`;

      const requestBody = {
        instances: [{ prompt: imagePrompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: '1:1',
        },
      };

      let result: { predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }> } | undefined;

      for (let attempt = 0; attempt <= IMAGE_MAX_RETRIES; attempt++) {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          if (isAccessDeniedStatus(response.status) || isAccessDeniedMessage(errorText)) {
            return { success: false, assets: [], metadata: { reason: 'access-denied', detail: errorText } };
          }
          if (attempt < IMAGE_MAX_RETRIES && (isRetryableStatus(response.status) || isRetryableMessage(errorText))) {
            const delay = IMAGE_INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
            console.log(JSON.stringify({ level: 'warn', msg: 'Imagen 429 retry', attempt: attempt + 1, delayMs: delay }));
            await sleepMs(delay);
            continue;
          }
          throw new Error(`Imagen API failed (${response.status}): ${errorText}`);
        }

        result = await response.json() as typeof result;
        break;
      }

      if (!result) {
        throw new Error('Imagen API failed: max retries exceeded');
      }

      const base64Image = result.predictions?.[0]?.bytesBase64Encoded;

      if (!base64Image) {
        return { success: false, assets: [], metadata: { reason: 'no-image-data', jobId } };
      }

      return {
        success: true,
        assets: [base64Image],
        metadata: { jobId, model, promptUsed: imagePrompt },
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

function isAccessDeniedStatus(status: number): boolean {
  return status === 403 || status === 401;
}

function isAccessDeniedMessage(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes('permission denied') || lower.includes('403') || lower.includes('unauthorized');
}

function isAccessDenied(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const code = (err as Record<string, unknown>).code;
    const status = (err as Record<string, unknown>).status;
    if (code === 403 || code === '403' || status === 403 || status === '403') return true;
    if (code === 401 || code === '401' || status === 401 || status === '401') return true;
    const message = String((err as Record<string, unknown>).message || '');
    if (message.includes('403') || message.includes('401') || message.toLowerCase().includes('permission denied')) {
      return true;
    }
  }
  return false;
}
