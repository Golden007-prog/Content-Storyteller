import { Storage } from '@google-cloud/storage';
import { getGcpConfig } from '../config/gcp';
import { logger } from '../middleware/logger';

function getStorage(): Storage {
  const cfg = getGcpConfig();
  return new Storage({ projectId: cfg.projectId });
}

/**
 * Upload a file buffer to the uploads bucket.
 * Returns the GCS URI (e.g. "gs://bucket/destination").
 */
export async function uploadFile(
  destination: string,
  data: Buffer,
  contentType: string,
  metadata?: Record<string, string>,
): Promise<string> {
  const cfg = getGcpConfig();
  const bucket = getStorage().bucket(cfg.uploadsBucket);
  const file = bucket.file(destination);
  await file.save(data, {
    contentType,
    metadata: metadata ? { metadata } : undefined,
  });
  return `gs://${cfg.uploadsBucket}/${destination}`;
}

export function getUploadsBucketName(): string {
  return getGcpConfig().uploadsBucket;
}

/**
 * Read a file from the assets bucket and return its contents as a Buffer.
 *
 * For binary GIF files (detected by .gif extension and GIF magic bytes),
 * returns JSON metadata with a signed/proxy URL instead of raw binary data.
 * This allows callers using readJsonAsset to get usable GIF metadata
 * even when the stored asset is a binary GIF file.
 */
export async function readAsset(path: string): Promise<Buffer> {
  const cfg = getGcpConfig();
  const bucket = getStorage().bucket(cfg.assetsBucket);
  const file = bucket.file(path);
  const [contents] = await file.download();

  // Binary GIF files can't be parsed as JSON — construct metadata with a signed URL
  if (path.endsWith('.gif') && contents.length >= 3 && contents.slice(0, 3).toString() === 'GIF') {
    const signedUrl = await generateSignedUrl(path);
    const metadata = {
      url: signedUrl,
      mimeType: 'image/gif',
      width: 480,
      height: 480,
      durationMs: 3000,
      loop: true,
      fileSizeBytes: contents.length,
    };
    return Buffer.from(JSON.stringify(metadata));
  }

  return contents;
}

/**
 * Generate a signed URL for reading an asset from the assets bucket.
 * URL is valid for 60 minutes.
 *
 * In local dev (non-cloud), falls back to a local proxy URL that streams
 * the file content via the API server (ADC user credentials can't sign URLs).
 */
export async function generateSignedUrl(storagePath: string): Promise<string> {
  const cfg = getGcpConfig();
  const bucketName = cfg.assetsBucket;
  const bucket = getStorage().bucket(bucketName);
  const file = bucket.file(storagePath);

  try {
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000,
    });
    return url;
  } catch (err) {
    if (!cfg.isCloud) {
      // Use local proxy endpoint instead of public URL (bucket is not public)
      const port = process.env.PORT || '8080';
      return `http://localhost:${port}/api/v1/assets/${encodeURIComponent(storagePath)}`;
    }
    // Cloud fallback: proxy through the API's own asset endpoint.
    // Try API_BASE_URL first, then auto-discover from Cloud Run metadata.
    let apiBaseUrl = process.env.API_BASE_URL || '';
    if (!apiBaseUrl) {
      // Cloud Run provides K_SERVICE (service name) and we can construct the URL
      // Format: https://{service}-{project-number}.{region}.run.app
      // However, project number isn't directly available, so we use a simpler approach:
      // The service URL is available via the Cloud Run metadata server, but that's async.
      // For now, log a warning and throw — the deployment should set API_BASE_URL.
      logger.warn('API_BASE_URL not set in cloud environment — signed URL fallback unavailable', {
        storagePath,
        kService: process.env.K_SERVICE,
      });
    }
    if (apiBaseUrl) {
      return `${apiBaseUrl}/api/v1/assets/${encodeURIComponent(storagePath)}`;
    }
    throw err;
  }
}

/** Result of a safe signed URL generation attempt. */
export interface SignedUrlResult {
  /** The resolved URL, or empty string on failure. */
  url: string;
  /** Error reason when URL generation failed; undefined on success. */
  error?: string;
}

/**
 * Safe variant of generateSignedUrl that never throws.
 *
 * On success returns `{ url }`. On failure logs the error with the asset
 * storage path and returns `{ url: '', error: reason }` so callers can
 * surface the failure in API response metadata without crashing.
 */
export async function generateSignedUrlSafe(storagePath: string): Promise<SignedUrlResult> {
  try {
    const url = await generateSignedUrl(storagePath);
    return { url };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error('Signed URL generation failed', {
      storagePath,
      error: reason,
    });
    return { url: '', error: reason };
  }
}

/**
 * Stream an asset file from the assets bucket. Used by the local dev proxy.
 */
export async function streamAsset(storagePath: string): Promise<{ stream: NodeJS.ReadableStream; contentType: string }> {
  const cfg = getGcpConfig();
  const bucket = getStorage().bucket(cfg.assetsBucket);
  const file = bucket.file(storagePath);
  const [metadata] = await file.getMetadata();
  const stream = file.createReadStream();
  return { stream, contentType: (metadata.contentType as string) || 'application/octet-stream' };
}
