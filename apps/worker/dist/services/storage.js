"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readUpload = readUpload;
exports.writeAsset = writeAsset;
exports.writeTemp = writeTemp;
const storage_1 = require("@google-cloud/storage");
const gcp_1 = require("../config/gcp");
function getStorage() {
    const cfg = (0, gcp_1.getGcpConfig)();
    return new storage_1.Storage({ projectId: cfg.projectId });
}
/**
 * Read a file from the uploads bucket and return its contents as a Buffer.
 */
async function readUpload(path) {
    const cfg = (0, gcp_1.getGcpConfig)();
    const bucket = getStorage().bucket(cfg.uploadsBucket);
    const file = bucket.file(path);
    const [contents] = await file.download();
    return contents;
}
/**
 * Write a file to the assets bucket. Returns the full GCS URI.
 */
async function writeAsset(destination, data, contentType) {
    const cfg = (0, gcp_1.getGcpConfig)();
    const bucket = getStorage().bucket(cfg.assetsBucket);
    const file = bucket.file(destination);
    await file.save(data, { contentType });
    return `gs://${cfg.assetsBucket}/${destination}`;
}
/**
 * Write a file to the temp bucket for intermediate processing.
 * Returns the full GCS URI.
 */
async function writeTemp(destination, data, contentType) {
    const cfg = (0, gcp_1.getGcpConfig)();
    const bucket = getStorage().bucket(cfg.tempBucket);
    const file = bucket.file(destination);
    await file.save(data, { contentType });
    return `gs://${cfg.tempBucket}/${destination}`;
}
//# sourceMappingURL=storage.js.map