/**
 * Read a file from the uploads bucket and return its contents as a Buffer.
 */
export declare function readUpload(path: string): Promise<Buffer>;
/**
 * Write a file to the assets bucket. Returns the full GCS URI.
 */
export declare function writeAsset(destination: string, data: Buffer, contentType: string): Promise<string>;
/**
 * Write a file to the temp bucket for intermediate processing.
 * Returns the full GCS URI.
 */
export declare function writeTemp(destination: string, data: Buffer, contentType: string): Promise<string>;
//# sourceMappingURL=storage.d.ts.map