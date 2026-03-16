import { Storage } from '@google-cloud/storage';
import { getGcpConfig } from '../config/gcp';

function getStorage(): Storage {
  const cfg = getGcpConfig();
  return new Storage({ projectId: cfg.projectId });
}

/**
 * Read a file from the uploads bucket and return its contents as a Buffer.
 */
export async function readUpload(path: string): Promise<Buffer> {
  const cfg = getGcpConfig();
  const bucket = getStorage().bucket(cfg.uploadsBucket);
  const file = bucket.file(path);
  const [contents] = await file.download();
  return contents;
}

/**
 * Write a file to the assets bucket. Returns the full GCS URI.
 */
export async function writeAsset(
  destination: string,
  data: Buffer,
  contentType: string,
): Promise<string> {
  const cfg = getGcpConfig();
  const bucket = getStorage().bucket(cfg.assetsBucket);
  const file = bucket.file(destination);
  await file.save(data, { contentType });
  return `gs://${cfg.assetsBucket}/${destination}`;
}

/**
 * Write a file to the temp bucket for intermediate processing.
 * Returns the full GCS URI.
 */
export async function writeTemp(
  destination: string,
  data: Buffer,
  contentType: string,
): Promise<string> {
  const cfg = getGcpConfig();
  const bucket = getStorage().bucket(cfg.tempBucket);
  const file = bucket.file(destination);
  await file.save(data, { contentType });
  return `gs://${cfg.tempBucket}/${destination}`;
}
