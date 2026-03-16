import {
  GenerationCapability,
  GenerationInput,
  GenerationOutput,
  CreativeBrief,
  Storyboard,
  VideoBrief,
  getModel,
  getLocation,
} from '@content-storyteller/shared';

import { getGcpConfig } from '../config/gcp';

const VIDEO_POLL_INTERVAL_BASE_MS = 15_000; // initial poll interval
const VIDEO_POLL_INTERVAL_CAP_MS = 120_000; // max poll interval after backoff
const VIDEO_DEFAULT_TIMEOUT_MS = Number(process.env.VIDEO_GENERATION_TIMEOUT_MS) || 10 * 60 * 1000; // configurable, default 10 min
const CONSECUTIVE_TRANSIENT_WARN_THRESHOLD = 5;

/**
 * Video generation capability backed by Vertex AI Veo API.
 *
 * Uses the Vertex AI REST API to submit video generation jobs,
 * polls for completion with a 5-minute timeout, and returns
 * the resulting mp4 video data as base64.
 *
 * Falls back gracefully when the API is unavailable or access is denied.
 */
export class VideoGenerationCapability implements GenerationCapability {
  readonly name = 'video_generation';

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
      // Lightweight probe: check if we can get an access token via ADC
      const { GoogleAuth } = await import('google-auth-library');
      const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
      await auth.getAccessToken();
      this.cachedAvailability = true;
    } catch {
      this.cachedAvailability = false;
    }

    this.lastCheckTime = now;
    return this.cachedAvailability;
  }

  async generate(input: GenerationInput): Promise<GenerationOutput> {
    const { jobId, data } = input;
    const brief = data.brief as CreativeBrief | undefined;
    const storyboard = data.storyboard as Storyboard | undefined;
    const videoBrief = data.videoBrief as VideoBrief | undefined;
    // Allow caller to pass a custom timeout (e.g., remaining pipeline time)
    const timeoutMs = typeof data.timeoutMs === 'number' && data.timeoutMs > 0
      ? data.timeoutMs
      : VIDEO_DEFAULT_TIMEOUT_MS;

    const prompt = buildVeoPrompt(brief, storyboard, videoBrief);

    try {
      const { GoogleAuth } = await import('google-auth-library');
      const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
      const accessToken = await auth.getAccessToken();

      if (!accessToken) {
        return { success: false, assets: [], metadata: { reason: 'no-access-token' } };
      }

      const cfg = getGcpConfig();
      const loc = getLocation('videoFinal');
      // Submit video generation job to Vertex AI Veo API
      const endpoint = `https://${loc}-aiplatform.googleapis.com/v1/projects/${cfg.projectId}/locations/${loc}/publishers/google/models/${getModel('videoFinal')}:predictLongRunning`;

      const requestBody = {
        instances: [{ prompt }],
        parameters: {
          aspectRatio: '16:9',
          sampleCount: 1,
          durationSeconds: 8,
        },
      };

      const submitResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!submitResponse.ok) {
        const errorText = await submitResponse.text();
        if (isAccessDeniedStatus(submitResponse.status) || isAccessDeniedMessage(errorText)) {
          return { success: false, assets: [], metadata: { reason: 'access-denied', detail: errorText } };
        }
        throw new Error(`Veo API submit failed (${submitResponse.status}): ${errorText}`);
      }

      const submitResult = await submitResponse.json() as { name?: string };
      const operationName = submitResult.name;

      if (!operationName) {
        throw new Error('Veo API did not return an operation name');
      }

      // Poll for completion with dynamic timeout
      const videoData = await this.pollForCompletion(operationName, accessToken, timeoutMs);

      if (!videoData || typeof videoData === 'object') {
        const timeoutMeta = typeof videoData === 'object' && videoData !== null ? videoData : undefined;
        return {
          success: false,
          assets: [],
          metadata: {
            jobId,
            reason: timeoutMeta?.reason ?? 'timeout-or-no-video',
            operationName,
            ...(timeoutMeta ? { pollCount: timeoutMeta.pollCount, elapsedMs: timeoutMeta.elapsedMs } : {}),
          },
        };
      }

      return {
        success: true,
        assets: [videoData], // base64-encoded mp4 data
        metadata: { jobId, model: getModel('videoFinal'), operationName },
      };
    } catch (err: unknown) {
      if (isAccessDenied(err)) {
        return { success: false, assets: [], metadata: { reason: 'access-denied' } };
      }
      throw err;
    }
  }

  /**
   * Poll the Vertex AI long-running operation until completion or timeout.
   * Uses exponential backoff: 15s → 30s → 60s → 120s (cap) after transient errors.
   * Resets interval to 15s after a successful (OK) poll response.
   * Returns base64-encoded video data on success, or a structured metadata
   * object on timeout so the caller can surface a specific reason.
   * Includes per-poll logging for diagnosability.
   */
  private async pollForCompletion(
    operationName: string,
    accessToken: string,
    timeoutMs: number = VIDEO_DEFAULT_TIMEOUT_MS,
  ): Promise<string | { timeout: true; reason: string; pollCount: number; elapsedMs: number; operationName: string } | null> {
    const pollEndpoint = `https://${getLocation('videoFinal')}-aiplatform.googleapis.com/v1/${operationName}`;
    const deadline = Date.now() + timeoutMs;
    const startTime = Date.now();
    let pollCount = 0;
    let currentIntervalMs = VIDEO_POLL_INTERVAL_BASE_MS;
    let consecutiveTransientErrors = 0;

    while (Date.now() < deadline) {
      await sleep(currentIntervalMs);
      pollCount++;
      const elapsedMs = Date.now() - startTime;

      const pollResponse = await fetch(pollEndpoint, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (!pollResponse.ok) {
        const errorText = await pollResponse.text();
        consecutiveTransientErrors++;

        // Exponential backoff: double interval after transient error, cap at 120s
        currentIntervalMs = Math.min(currentIntervalMs * 2, VIDEO_POLL_INTERVAL_CAP_MS);

        console.log(JSON.stringify({
          level: consecutiveTransientErrors > CONSECUTIVE_TRANSIENT_WARN_THRESHOLD ? 'error' : 'warn',
          msg: consecutiveTransientErrors > CONSECUTIVE_TRANSIENT_WARN_THRESHOLD
            ? 'Veo poll excessive consecutive transient errors'
            : 'Veo poll non-OK response',
          pollCount,
          elapsedMs,
          currentIntervalMs,
          operationName,
          status: 'transient-error',
          consecutiveTransientErrors,
        }));

        if (isAccessDeniedStatus(pollResponse.status)) {
          throw Object.assign(new Error(`Poll access denied: ${errorText}`), { code: 403 });
        }
        // Transient error — continue polling with increased interval
        continue;
      }

      // Successful response — reset backoff
      consecutiveTransientErrors = 0;
      currentIntervalMs = VIDEO_POLL_INTERVAL_BASE_MS;

      const pollResult = await pollResponse.json() as {
        done?: boolean;
        response?: {
          predictions?: Array<{
            bytesBase64Encoded?: string;
            mimeType?: string;
          }>;
        };
        error?: { code?: number; message?: string };
      };

      const status = pollResult.done ? 'done' : pollResult.error ? 'error' : 'pending';
      console.log(JSON.stringify({ level: 'info', msg: 'Veo poll iteration', pollCount, elapsedMs, currentIntervalMs, operationName, status }));

      if (pollResult.error) {
        throw new Error(`Veo operation failed: ${pollResult.error.message || 'Unknown error'}`);
      }

      if (pollResult.done) {
        const predictions = pollResult.response?.predictions;
        if (predictions && predictions.length > 0 && predictions[0].bytesBase64Encoded) {
          return predictions[0].bytesBase64Encoded;
        }
        // Done but no video data
        return null;
      }
    }

    // Timeout reached — log structured warning
    const totalElapsed = Date.now() - startTime;
    console.log(JSON.stringify({ level: 'warn', msg: 'Veo polling timeout', pollCount, elapsedMs: totalElapsed, currentIntervalMs, operationName, timeoutMs }));
    return { timeout: true, reason: 'video-generation-timeout', pollCount, elapsedMs: totalElapsed, operationName };
  }
}

function buildVeoPrompt(
  brief?: CreativeBrief,
  storyboard?: Storyboard,
  videoBrief?: VideoBrief,
): string {
  const parts: string[] = [];

  if (brief) {
    parts.push(`Create a short promotional video for: ${brief.inputSummary || brief.keyMessages.join(', ')}`);
    parts.push(`Target audience: ${brief.targetAudience}`);
    parts.push(`Tone: ${brief.tone}`);
    parts.push(`Visual direction: ${brief.visualDirection}`);
    if (brief.campaignAngle) parts.push(`Campaign angle: ${brief.campaignAngle}`);
  } else {
    parts.push('Create a short promotional marketing video');
  }

  if (storyboard && storyboard.scenes.length > 0) {
    const sceneDesc = storyboard.scenes
      .map(s => `Scene ${s.sceneNumber}: ${s.description} (${s.duration}, ${s.motionStyle})`)
      .join('. ');
    parts.push(`Storyboard: ${sceneDesc}`);
  }

  if (videoBrief) {
    parts.push(`Motion style: ${videoBrief.motionStyle}`);
    parts.push(`Energy: ${videoBrief.energyDirection}`);
  }

  return parts.join('. ');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    const message = String((err as Record<string, unknown>).message || '');
    if (message.includes('403') || message.toLowerCase().includes('permission denied')) {
      return true;
    }
  }
  return false;
}
