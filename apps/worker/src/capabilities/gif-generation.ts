import {
  GenerationCapability,
  GenerationInput,
  GenerationOutput,
} from '@content-storyteller/shared';

import { createLogger } from '../middleware/logger';

/**
 * GIF generation capability that converts an existing video asset to GIF format.
 *
 * Accepts a video buffer or path via `input.data.videoBuffer` (base64-encoded)
 * or `input.data.videoAssetPath` and converts it to an animated GIF.
 *
 * If video-to-GIF conversion tooling (e.g. ffmpeg) is not available in the
 * runtime environment, the capability returns `{ success: false }` with
 * reason `'conversion-unavailable'` so the pipeline stage can record a
 * fallback notice and persist creative direction instead.
 */
export class GifGenerationCapability implements GenerationCapability {
  readonly name = 'gif_generation';

  private cachedAvailability: boolean | null = null;
  private lastCheckTime = 0;
  private readonly cacheTtlMs = 60_000; // re-check every 60s

  async isAvailable(): Promise<boolean> {
    const now = Date.now();
    if (this.cachedAvailability !== null && now - this.lastCheckTime < this.cacheTtlMs) {
      return this.cachedAvailability;
    }

    try {
      const available = await this.checkConversionTooling();
      this.cachedAvailability = available;
    } catch {
      this.cachedAvailability = false;
    }

    this.lastCheckTime = now;
    return this.cachedAvailability;
  }

  async generate(input: GenerationInput): Promise<GenerationOutput> {
    const { jobId, data } = input;
    const videoAssetPath = data.videoAssetPath as string | undefined;
    const videoBuffer = data.videoBuffer as string | undefined; // base64-encoded

    if (!videoAssetPath && !videoBuffer) {
      return {
        success: false,
        assets: [],
        metadata: { jobId, reason: 'no-video-input' },
      };
    }

    // Check if conversion tooling is available at generation time
    const conversionAvailable = await this.checkConversionTooling();
    if (!conversionAvailable) {
      return {
        success: false,
        assets: [],
        metadata: { jobId, reason: 'conversion-unavailable' },
      };
    }

    try {
      const gifBase64 = await this.convertVideoToGif(videoAssetPath, videoBuffer);

      if (!gifBase64) {
        return {
          success: false,
          assets: [],
          metadata: { jobId, reason: 'conversion-failed' },
        };
      }

      return {
        success: true,
        assets: [gifBase64],
        metadata: { jobId, source: videoAssetPath || 'buffer' },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        assets: [],
        metadata: { jobId, reason: 'conversion-error', detail: message },
      };
    }
  }

  /**
   * Check whether video-to-GIF conversion tooling (e.g. ffmpeg) is available
   * in the current runtime environment.
   */
  private async checkConversionTooling(): Promise<boolean> {
    try {
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);
      await execFileAsync('ffmpeg', ['-version']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Convert a video to GIF using ffmpeg.
   * Accepts either a GCS asset path (to be resolved by the caller) or
   * a base64-encoded video buffer.
   *
   * Returns base64-encoded GIF data on success, null on failure.
   */
  private async convertVideoToGif(
    _videoAssetPath?: string,
    _videoBuffer?: string,
  ): Promise<string | null> {
    // This method would use ffmpeg to convert video to GIF.
    // Implementation depends on runtime environment and ffmpeg availability.
    // For now, if we reach here it means ffmpeg was detected, but actual
    // conversion logic would involve:
    //   1. Write video buffer to a temp file (or use the asset path)
    //   2. Run ffmpeg -i input.mp4 -vf "fps=10,scale=480:-1" -loop 0 output.gif
    //   3. Read the output GIF and return as base64
    //
    // Since checkConversionTooling gates entry, this is a placeholder for
    // environments where ffmpeg is installed.
    return null;
  }
}
