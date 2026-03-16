/**
 * Upload a file buffer to the uploads bucket.
 * Returns the GCS URI (e.g. "gs://bucket/destination").
 */
export declare function uploadFile(destination: string, data: Buffer, contentType: string, metadata?: Record<string, string>): Promise<string>;
export declare function getUploadsBucketName(): string;
/**
 * Read a file from the assets bucket and return its contents as a Buffer.
 */
export declare function readAsset(path: string): Promise<Buffer>;
/**
 * Generate a signed URL for reading an asset from the assets bucket.
 * URL is valid for 60 minutes.
 *
 * In local dev (non-cloud), falls back to a public GCS URL if signing
 * fails (user ADC cannot sign URLs without service-account keys).
 */
export declare function generateSignedUrl(storagePath: string): Promise<string>;
//# sourceMappingURL=storage.d.ts.map