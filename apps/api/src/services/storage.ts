import { Storage } from '@google-cloud/storage';
import { getGcpConfig } from '../config/gcp';

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
    // Cloud fallback: use the API's own proxy endpoint to stream the asset
    const apiBaseUrl =
      process.env.API_BASE_URL ||
      (process.env.K_SERVICE && cfg.projectId
        ? `https://${process.env.K_SERVICE}-${cfg.projectId}.run.app`
        : '');
    if (apiBaseUrl) {
      return `${apiBaseUrl}/api/v1/assets/${encodeURIComponent(storagePath)}`;
    }
    throw err;
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
