"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadFile = uploadFile;
exports.getUploadsBucketName = getUploadsBucketName;
exports.readAsset = readAsset;
exports.generateSignedUrl = generateSignedUrl;
const storage_1 = require("@google-cloud/storage");
const gcp_1 = require("../config/gcp");
function getStorage() {
    const cfg = (0, gcp_1.getGcpConfig)();
    return new storage_1.Storage({ projectId: cfg.projectId });
}
/**
 * Upload a file buffer to the uploads bucket.
 * Returns the GCS URI (e.g. "gs://bucket/destination").
 */
async function uploadFile(destination, data, contentType, metadata) {
    const cfg = (0, gcp_1.getGcpConfig)();
    const bucket = getStorage().bucket(cfg.uploadsBucket);
    const file = bucket.file(destination);
    await file.save(data, {
        contentType,
        metadata: metadata ? { metadata } : undefined,
    });
    return `gs://${cfg.uploadsBucket}/${destination}`;
}
function getUploadsBucketName() {
    return (0, gcp_1.getGcpConfig)().uploadsBucket;
}
/**
 * Read a file from the assets bucket and return its contents as a Buffer.
 */
async function readAsset(path) {
    const cfg = (0, gcp_1.getGcpConfig)();
    const bucket = getStorage().bucket(cfg.assetsBucket);
    const file = bucket.file(path);
    const [contents] = await file.download();
    return contents;
}
/**
 * Generate a signed URL for reading an asset from the assets bucket.
 * URL is valid for 60 minutes.
 *
 * In local dev (non-cloud), falls back to a public GCS URL if signing
 * fails (user ADC cannot sign URLs without service-account keys).
 */
async function generateSignedUrl(storagePath) {
    const cfg = (0, gcp_1.getGcpConfig)();
    const bucketName = cfg.assetsBucket;
    const bucket = getStorage().bucket(bucketName);
    const file = bucket.file(storagePath);
    try {
        const [url] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 60 * 60 * 1000,
        });
        return url;
    }
    catch (err) {
        if (!cfg.isCloud) {
            console.warn(`[Storage] getSignedUrl failed in local dev, returning public URL fallback: ${err.message}`);
            return `https://storage.googleapis.com/${bucketName}/${storagePath}`;
        }
        // In cloud environments, re-throw — signing failures should not be silently swallowed
        throw err;
    }
}
//# sourceMappingURL=storage.js.map