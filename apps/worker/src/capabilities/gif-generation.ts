import {
  GenerationCapability,
  GenerationInput,
  GenerationOutput,
} from '@content-storyteller/shared';

import { createLogger } from '../middleware/logger';
import * as os from 'os';
import * as crypto from 'crypto';
import * as path from 'path';

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
      await execFileAsync('ffmpeg', ['-version'], {});
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
    videoAssetPath?: string,
    videoBuffer?: string,
  ): Promise<string | null> {
    const log = createLogger(undefined, undefined);
    const tmpDir = os.tmpdir();
    const uniqueId = crypto.randomUUID();
    const inputPath = path.join(tmpDir, `gif-input-${uniqueId}.mp4`);
    const outputPath = path.join(tmpDir, `gif-output-${uniqueId}.gif`);

    try {
      const fs = await import('fs');
      const fsp = fs.promises;

      // Step 1: Get video data into a temp file
      if (videoBuffer) {
        // Decode base64 video buffer and write to temp file
        const videoData = Buffer.from(videoBuffer, 'base64');
        await fsp.writeFile(inputPath, videoData);
      } else if (videoAssetPath) {
        // Download from Cloud Storage
        try {
          const { Storage } = await import('@google-cloud/storage');
          const { getGcpConfig } = await import('../config/gcp');
          const cfg = getGcpConfig();
          const storage = new Storage({ projectId: cfg.projectId });
          const bucket = storage.bucket(cfg.assetsBucket);
          const file = bucket.file(videoAssetPath);
          const [contents] = await file.download();
          await fsp.writeFile(inputPath, contents);
        } catch (downloadErr: unknown) {
          const msg = downloadErr instanceof Error ? downloadErr.message : String(downloadErr);
          log.error('Failed to download video from Cloud Storage', { videoAssetPath, error: msg });
          return null;
        }
      } else {
        return null;
      }

      // Step 2: Run ffmpeg conversion with 60s timeout
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);

      // Write a minimal GIF placeholder so the output path exists;
      // ffmpeg -y will overwrite it with the real conversion output.
      const minimalGif = Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64',
      );
      await fsp.writeFile(outputPath, minimalGif);

      await execFileAsync('ffmpeg', [
        '-y',
        '-i', inputPath,
        '-vf', 'fps=10,scale=480:-1',
        '-loop', '0',
        outputPath,
      ], { timeout: 60_000 });

      // Step 3: Read output GIF and return as base64
      const gifData = await fsp.readFile(outputPath);
      if (gifData.length === 0) {
        log.warn('ffmpeg produced empty GIF output');
        return null;
      }

      return gifData.toString('base64');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('GIF conversion failed', { error: message });
      return null;
    } finally {
      // Step 4: Cleanup temp files
      try {
        const fs = await import('fs');
        const fsp = fs.promises;
        await fsp.unlink(inputPath).catch(() => {});
        await fsp.unlink(outputPath).catch(() => {});
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
