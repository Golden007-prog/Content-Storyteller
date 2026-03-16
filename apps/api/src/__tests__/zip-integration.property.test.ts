/**
 * Property-based tests for download/ZIP integration.
 *
 * Tests verify the ZIP bundle handler classifies assets correctly,
 * generates descriptive filenames, includes manifest.json as supplemental,
 * and individual asset downloads return real files.
 *
 * **Validates: Requirements 8.1-8.6**
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import http from 'http';
import { AssetType, JobState } from '@content-storyteller/shared';
import type { AssetReference } from '@content-storyteller/shared';

// ── Hoisted mocks ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  let docIdCounter = 0;
  const resetDocIdCounter = () => { docIdCounter = 0; };

  const mockFileSave = vi.fn().mockResolvedValue(undefined);
  const mockFileDownload = vi.fn().mockResolvedValue([Buffer.from('data')]);
  const mockGetSignedUrl = vi.fn().mockResolvedValue(['https://storage.example.com/signed-url']);
  const mockBucketFile = vi.fn().mockReturnValue({
    save: mockFileSave,
    download: mockFileDownload,
    getSignedUrl: mockGetSignedUrl,
  });
  const mockBucket = vi.fn().mockReturnValue({ file: mockBucketFile });

  const mockDocSet = vi.fn().mockResolvedValue(undefined);
  const mockDocGet = vi.fn().mockResolvedValue({ exists: true, data: () => ({}) });
  const mockDocUpdate = vi.fn().mockResolvedValue(undefined);
  const mockDoc = vi.fn().mockImplementation((id?: string) => ({
    id: id || `mock-doc-${++docIdCounter}`,
    set: mockDocSet,
    get: mockDocGet,
    update: mockDocUpdate,
  }));
  const mockWhere = vi.fn().mockReturnThis();
  const mockOrderBy = vi.fn().mockReturnThis();
  const mockGetDocs = vi.fn().mockResolvedValue({ docs: [] });
  const mockCollection = vi.fn().mockReturnValue({
    doc: mockDoc,
    where: mockWhere,
    orderBy: mockOrderBy,
    get: mockGetDocs,
  });

  const mockPublishMessage = vi.fn().mockResolvedValue('mock-message-id');
  const mockTopic = vi.fn().mockReturnValue({ publishMessage: mockPublishMessage });

  return {
    mockFileSave, mockFileDownload, mockGetSignedUrl, mockBucketFile, mockBucket,
    mockDocSet, mockDocGet, mockDocUpdate, mockDoc, mockCollection,
    mockWhere, mockOrderBy, mockGetDocs,
    mockPublishMessage, mockTopic,
    resetDocIdCounter,
  };
});

vi.mock('@google-cloud/storage', () => ({
  Storage: vi.fn().mockImplementation(() => ({ bucket: mocks.mockBucket })),
}));

vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => ({
    collection: mocks.mockCollection,
  })),
}));

vi.mock('@google-cloud/pubsub', () => ({
  PubSub: vi.fn().mockImplementation(() => ({ topic: mocks.mockTopic })),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: vi.fn().mockResolvedValue({ text: 'Mock response' }),
    },
  })),
  Type: { STRING: 'STRING', OBJECT: 'OBJECT', NUMBER: 'NUMBER', INTEGER: 'INTEGER', BOOLEAN: 'BOOLEAN', ARRAY: 'ARRAY' },
}));

import { app } from '../index';

// ── Helpers ─────────────────────────────────────────────────────────

function makeRawRequest(
  server: http.Server,
  method: string,
  path: string,
): Promise<{ status: number; buffer: Buffer; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path,
        method,
        headers: { Accept: 'application/zip' },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => { chunks.push(Buffer.from(chunk)); });
        res.on('end', () => {
          resolve({
            status: res.statusCode || 500,
            buffer: Buffer.concat(chunks),
            headers: res.headers,
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function makeJsonRequest(
  server: http.Server,
  method: string,
  path: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path,
        method,
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 500, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode || 500, body: { raw: data } as Record<string, unknown> });
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * Extract filenames from a ZIP buffer by scanning the central directory.
 * ZIP central directory entries contain filenames as plain ASCII text.
 */
function extractZipFilenames(buffer: Buffer): string[] {
  const filenames: string[] = [];
  // Central directory file header signature = 0x02014b50
  for (let i = 0; i < buffer.length - 46; i++) {
    if (
      buffer[i] === 0x50 &&
      buffer[i + 1] === 0x4b &&
      buffer[i + 2] === 0x01 &&
      buffer[i + 3] === 0x02
    ) {
      const filenameLength = buffer.readUInt16LE(i + 28);
      const extraLength = buffer.readUInt16LE(i + 30);
      const commentLength = buffer.readUInt16LE(i + 32);
      const filenameStart = i + 46;
      const filename = buffer.subarray(filenameStart, filenameStart + filenameLength).toString('utf-8');
      filenames.push(filename);
      // Skip past this entry
      i = filenameStart + filenameLength + extraLength + commentLength - 1;
    }
  }
  return filenames;
}

// Fallback types as defined in the route handler
const FALLBACK_TYPES = ['image_concept', 'video_brief_meta', 'gif_creative_direction'];

// Deliverable asset types
const DELIVERABLE_TYPES = ['copy', 'image', 'video', 'gif', 'storyboard', 'voiceover_script'];


// ── Property: ZIP bundle classifies assets correctly ────────────────

describe('ZIP Integration Property Tests', () => {
  let server: http.Server;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.resetDocIdCounter();
    originalFetch = globalThis.fetch;
    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // ── Property 1: Mixed asset types are classified correctly ────────
  describe('Property: ZIP bundle classifies deliverables vs fallback metadata', () => {
    it('for any completed job with mixed asset types, deliverables get root-level filenames and fallback goes to metadata/', () => {
      /**
       * **Validates: Requirements 8.1, 8.2, 8.3, 8.5**
       */
      return fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.subarray(DELIVERABLE_TYPES, { minLength: 1 }),
          fc.subarray(FALLBACK_TYPES, { minLength: 0 }),
          async (jobId, deliverableTypes, fallbackTypes) => {
            vi.clearAllMocks();
            mocks.resetDocIdCounter();

            const assets: AssetReference[] = [];
            let idx = 0;

            // Create deliverable assets
            for (const assetType of deliverableTypes) {
              const ext = assetType === 'image' ? '.png'
                : assetType === 'video' ? '.mp4'
                : assetType === 'gif' ? '.gif'
                : '.json';
              assets.push({
                assetId: `asset-${idx}`,
                jobId,
                assetType: assetType as AssetType,
                storagePath: `${jobId}/${assetType}/asset-${idx}${ext}`,
                generationTimestamp: new Date(),
                status: 'completed',
              });
              idx++;
            }

            // Create fallback metadata assets
            for (const assetType of fallbackTypes) {
              assets.push({
                assetId: `asset-${idx}`,
                jobId,
                assetType: assetType as AssetType,
                storagePath: `${jobId}/metadata/asset-${idx}.json`,
                generationTimestamp: new Date(),
                status: 'completed',
              });
              idx++;
            }

            mocks.mockDocGet.mockResolvedValue({
              exists: true,
              data: () => ({
                id: jobId,
                state: JobState.Completed,
                assets,
                fallbackNotices: [],
                createdAt: new Date(),
                updatedAt: new Date(),
                platform: 'general_promo_package',
                tone: 'professional',
              }),
            });

            mocks.mockGetDocs.mockResolvedValue({
              docs: assets.map((a) => ({ data: () => a })),
            });

            // Mock fetch to return content for each asset
            globalThis.fetch = vi.fn().mockImplementation(async () => {
              return new Response(Buffer.from('fake-binary-content'), {
                status: 200,
                headers: { 'Content-Type': 'application/octet-stream' },
              });
            }) as typeof fetch;

            const { status, buffer } = await makeRawRequest(
              server,
              'GET',
              `/api/v1/jobs/${jobId}/bundle?format=zip`,
            );

            expect(status).toBe(200);

            const filenames = extractZipFilenames(buffer);

            // Fallback metadata should be in metadata/ subdirectory
            for (const ft of fallbackTypes) {
              const metadataFiles = filenames.filter((f) => f.startsWith('metadata/'));
              if (ft === 'image_concept') {
                expect(metadataFiles.some((f) => f.includes('image-concept'))).toBe(true);
              } else if (ft === 'video_brief_meta') {
                expect(metadataFiles.some((f) => f.includes('video-brief'))).toBe(true);
              } else if (ft === 'gif_creative_direction') {
                expect(metadataFiles.some((f) => f.includes('gif-direction'))).toBe(true);
              }
            }

            // Deliverable assets should NOT be in metadata/ subdirectory
            for (const dt of deliverableTypes) {
              if (dt === 'image') {
                expect(filenames.some((f) => f.match(/^image-\d+\.(png|jpg)$/))).toBe(true);
              } else if (dt === 'video') {
                expect(filenames.includes('video.mp4')).toBe(true);
              } else if (dt === 'copy') {
                expect(filenames.includes('copy-package.txt')).toBe(true);
              }
            }
          },
        ),
        { numRuns: 30 },
      );
    });
  });

  // ── Property 2: manifest.json is always included ──────────────────
  describe('Property: manifest.json is always included in ZIP', () => {
    it('for any completed job, the ZIP always contains manifest.json', () => {
      /**
       * **Validates: Requirements 8.5, 8.6**
       */
      return fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.constantFrom(...DELIVERABLE_TYPES, ...FALLBACK_TYPES),
          async (jobId, assetType) => {
            vi.clearAllMocks();
            mocks.resetDocIdCounter();

            const assets: AssetReference[] = [{
              assetId: 'asset-0',
              jobId,
              assetType: assetType as AssetType,
              storagePath: `${jobId}/${assetType}/asset-0.json`,
              generationTimestamp: new Date(),
              status: 'completed',
            }];

            mocks.mockDocGet.mockResolvedValue({
              exists: true,
              data: () => ({
                id: jobId,
                state: JobState.Completed,
                assets,
                fallbackNotices: [],
                createdAt: new Date(),
                updatedAt: new Date(),
                platform: 'instagram_reel',
                tone: 'cinematic',
              }),
            });

            mocks.mockGetDocs.mockResolvedValue({
              docs: assets.map((a) => ({ data: () => a })),
            });

            globalThis.fetch = vi.fn().mockImplementation(async () => {
              return new Response(Buffer.from('test-content'), {
                status: 200,
                headers: { 'Content-Type': 'application/octet-stream' },
              });
            }) as typeof fetch;

            const { status, buffer } = await makeRawRequest(
              server,
              'GET',
              `/api/v1/jobs/${jobId}/bundle?format=zip`,
            );

            expect(status).toBe(200);
            const filenames = extractZipFilenames(buffer);
            expect(filenames.includes('manifest.json')).toBe(true);
          },
        ),
        { numRuns: 30 },
      );
    });
  });

  // ── Property 3: manifest.json is supplemental (not the only file) ─
  describe('Property: manifest.json is supplemental when real media assets exist', () => {
    it('for any ZIP with real media assets, manifest is not the only file', () => {
      /**
       * **Validates: Requirements 8.6**
       */
      return fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.subarray(DELIVERABLE_TYPES, { minLength: 1 }),
          async (jobId, deliverableTypes) => {
            vi.clearAllMocks();
            mocks.resetDocIdCounter();

            const assets: AssetReference[] = deliverableTypes.map((assetType, i) => {
              const ext = assetType === 'image' ? '.png'
                : assetType === 'video' ? '.mp4'
                : assetType === 'gif' ? '.gif'
                : '.json';
              return {
                assetId: `asset-${i}`,
                jobId,
                assetType: assetType as AssetType,
                storagePath: `${jobId}/${assetType}/asset-${i}${ext}`,
                generationTimestamp: new Date(),
                status: 'completed',
              };
            });

            mocks.mockDocGet.mockResolvedValue({
              exists: true,
              data: () => ({
                id: jobId,
                state: JobState.Completed,
                assets,
                fallbackNotices: [],
                createdAt: new Date(),
                updatedAt: new Date(),
                platform: 'general_promo_package',
                tone: 'professional',
              }),
            });

            mocks.mockGetDocs.mockResolvedValue({
              docs: assets.map((a) => ({ data: () => a })),
            });

            globalThis.fetch = vi.fn().mockImplementation(async () => {
              return new Response(Buffer.from('real-binary-content'), {
                status: 200,
                headers: { 'Content-Type': 'application/octet-stream' },
              });
            }) as typeof fetch;

            const { status, buffer } = await makeRawRequest(
              server,
              'GET',
              `/api/v1/jobs/${jobId}/bundle?format=zip`,
            );

            expect(status).toBe(200);
            const filenames = extractZipFilenames(buffer);

            // manifest.json should exist
            expect(filenames.includes('manifest.json')).toBe(true);

            // There should be more files than just manifest.json
            const nonManifestFiles = filenames.filter((f) => f !== 'manifest.json');
            expect(nonManifestFiles.length).toBeGreaterThan(0);
          },
        ),
        { numRuns: 30 },
      );
    });
  });

  // ── Property 4: Image assets get descriptive filenames ────────────
  describe('Property: Image assets get descriptive filenames', () => {
    it('image assets are named image-1.png, image-2.png, etc.', () => {
      /**
       * **Validates: Requirements 8.1, 8.5**
       */
      return fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 1, max: 5 }),
          async (jobId, imageCount) => {
            vi.clearAllMocks();
            mocks.resetDocIdCounter();

            const assets: AssetReference[] = Array.from({ length: imageCount }, (_, i) => ({
              assetId: `img-${i}`,
              jobId,
              assetType: AssetType.Image,
              storagePath: `${jobId}/images/img-${i}.png`,
              generationTimestamp: new Date(),
              status: 'completed',
            }));

            mocks.mockDocGet.mockResolvedValue({
              exists: true,
              data: () => ({
                id: jobId,
                state: JobState.Completed,
                assets,
                fallbackNotices: [],
                createdAt: new Date(),
                updatedAt: new Date(),
                platform: 'instagram_reel',
                tone: 'cinematic',
              }),
            });

            mocks.mockGetDocs.mockResolvedValue({
              docs: assets.map((a) => ({ data: () => a })),
            });

            globalThis.fetch = vi.fn().mockImplementation(async () => {
              return new Response(Buffer.from('PNG-binary-data'), {
                status: 200,
                headers: { 'Content-Type': 'image/png' },
              });
            }) as typeof fetch;

            const { status, buffer } = await makeRawRequest(
              server,
              'GET',
              `/api/v1/jobs/${jobId}/bundle?format=zip`,
            );

            expect(status).toBe(200);
            const filenames = extractZipFilenames(buffer);

            // Each image should have a descriptive filename
            for (let i = 1; i <= imageCount; i++) {
              expect(filenames.some((f) => f === `image-${i}.png`)).toBe(true);
            }
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  // ── Property 5: Fallback metadata goes into metadata/ subdirectory ─
  describe('Property: Fallback metadata goes into metadata/ subdirectory', () => {
    it('fallback assets are placed under metadata/ with descriptive names', () => {
      /**
       * **Validates: Requirements 8.5, 8.6**
       */
      return fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.subarray(FALLBACK_TYPES, { minLength: 1 }),
          async (jobId, fallbackAssetTypes) => {
            vi.clearAllMocks();
            mocks.resetDocIdCounter();

            const assets: AssetReference[] = fallbackAssetTypes.map((assetType, i) => ({
              assetId: `fb-${i}`,
              jobId,
              assetType: assetType as AssetType,
              storagePath: `${jobId}/metadata/fb-${i}.json`,
              generationTimestamp: new Date(),
              status: 'completed',
            }));

            mocks.mockDocGet.mockResolvedValue({
              exists: true,
              data: () => ({
                id: jobId,
                state: JobState.Completed,
                assets,
                fallbackNotices: [],
                createdAt: new Date(),
                updatedAt: new Date(),
                platform: 'general_promo_package',
                tone: 'sleek',
              }),
            });

            mocks.mockGetDocs.mockResolvedValue({
              docs: assets.map((a) => ({ data: () => a })),
            });

            globalThis.fetch = vi.fn().mockImplementation(async () => {
              return new Response(JSON.stringify({ type: 'metadata' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              });
            }) as typeof fetch;

            const { status, buffer } = await makeRawRequest(
              server,
              'GET',
              `/api/v1/jobs/${jobId}/bundle?format=zip`,
            );

            expect(status).toBe(200);
            const filenames = extractZipFilenames(buffer);

            // All fallback assets should be in metadata/ subdirectory
            const metadataFiles = filenames.filter((f) => f.startsWith('metadata/'));

            for (const ft of fallbackAssetTypes) {
              if (ft === 'image_concept') {
                expect(metadataFiles.some((f) => f.includes('image-concept'))).toBe(true);
              } else if (ft === 'video_brief_meta') {
                expect(metadataFiles.some((f) => f.includes('video-brief'))).toBe(true);
              } else if (ft === 'gif_creative_direction') {
                expect(metadataFiles.some((f) => f.includes('gif-direction'))).toBe(true);
              }
            }
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  // ── Property 6: Text deliverables get descriptive filenames ────────
  describe('Property: Text deliverables get descriptive filenames', () => {
    it('text assets like copy, storyboard, voiceover_script get descriptive .txt names', () => {
      /**
       * **Validates: Requirements 8.4, 8.5**
       */
      const textTypes = ['copy', 'storyboard', 'voiceover_script'] as const;

      return fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.subarray([...textTypes], { minLength: 1 }),
          async (jobId, selectedTextTypes) => {
            vi.clearAllMocks();
            mocks.resetDocIdCounter();

            const assets: AssetReference[] = selectedTextTypes.map((assetType, i) => ({
              assetId: `txt-${i}`,
              jobId,
              assetType: assetType as AssetType,
              storagePath: `${jobId}/${assetType}/txt-${i}.json`,
              generationTimestamp: new Date(),
              status: 'completed',
            }));

            mocks.mockDocGet.mockResolvedValue({
              exists: true,
              data: () => ({
                id: jobId,
                state: JobState.Completed,
                assets,
                fallbackNotices: [],
                createdAt: new Date(),
                updatedAt: new Date(),
                platform: 'linkedin_launch_post',
                tone: 'professional',
              }),
            });

            mocks.mockGetDocs.mockResolvedValue({
              docs: assets.map((a) => ({ data: () => a })),
            });

            globalThis.fetch = vi.fn().mockImplementation(async () => {
              return new Response(Buffer.from('Text content here'), {
                status: 200,
                headers: { 'Content-Type': 'text/plain' },
              });
            }) as typeof fetch;

            const { status, buffer } = await makeRawRequest(
              server,
              'GET',
              `/api/v1/jobs/${jobId}/bundle?format=zip`,
            );

            expect(status).toBe(200);
            const filenames = extractZipFilenames(buffer);

            const expectedFilenames: Record<string, string> = {
              copy: 'copy-package.txt',
              storyboard: 'storyboard.txt',
              voiceover_script: 'voiceover-script.txt',
            };

            for (const textType of selectedTextTypes) {
              const expected = expectedFilenames[textType];
              expect(filenames.includes(expected)).toBe(true);
            }
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  // ── Property: Full package ZIP contains expected files ─────────────
  describe('Property: Full package ZIP contains expected file types', () => {
    it('a full package with all asset types produces ZIP with copy-package.txt, images, video.mp4, manifest.json', () => {
      /**
       * **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6**
       */
      return fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          async (jobId) => {
            vi.clearAllMocks();
            mocks.resetDocIdCounter();

            // Full package: copy, images, video, gif, storyboard, voiceover, + fallback metadata
            const assets: AssetReference[] = [
              { assetId: 'a-copy', jobId, assetType: AssetType.Copy, storagePath: `${jobId}/copy/copy.json`, generationTimestamp: new Date(), status: 'completed' },
              { assetId: 'a-img1', jobId, assetType: AssetType.Image, storagePath: `${jobId}/images/img1.png`, generationTimestamp: new Date(), status: 'completed' },
              { assetId: 'a-img2', jobId, assetType: AssetType.Image, storagePath: `${jobId}/images/img2.png`, generationTimestamp: new Date(), status: 'completed' },
              { assetId: 'a-video', jobId, assetType: AssetType.Video, storagePath: `${jobId}/video/vid.mp4`, generationTimestamp: new Date(), status: 'completed' },
              { assetId: 'a-gif', jobId, assetType: AssetType.Gif, storagePath: `${jobId}/gif/loop.gif`, generationTimestamp: new Date(), status: 'completed' },
              { assetId: 'a-story', jobId, assetType: AssetType.Storyboard, storagePath: `${jobId}/storyboard/story.json`, generationTimestamp: new Date(), status: 'completed' },
              { assetId: 'a-voice', jobId, assetType: AssetType.VoiceoverScript, storagePath: `${jobId}/voiceover/voice.json`, generationTimestamp: new Date(), status: 'completed' },
              { assetId: 'a-ic', jobId, assetType: AssetType.ImageConcept, storagePath: `${jobId}/metadata/ic.json`, generationTimestamp: new Date(), status: 'completed' },
              { assetId: 'a-vb', jobId, assetType: AssetType.VideoBriefMeta, storagePath: `${jobId}/metadata/vb.json`, generationTimestamp: new Date(), status: 'completed' },
            ];

            mocks.mockDocGet.mockResolvedValue({
              exists: true,
              data: () => ({
                id: jobId,
                state: JobState.Completed,
                assets,
                fallbackNotices: [],
                createdAt: new Date(),
                updatedAt: new Date(),
                platform: 'general_promo_package',
                tone: 'cinematic',
              }),
            });

            mocks.mockGetDocs.mockResolvedValue({
              docs: assets.map((a) => ({ data: () => a })),
            });

            globalThis.fetch = vi.fn().mockImplementation(async () => {
              return new Response(Buffer.from('binary-content-here'), {
                status: 200,
                headers: { 'Content-Type': 'application/octet-stream' },
              });
            }) as typeof fetch;

            const { status, buffer } = await makeRawRequest(
              server,
              'GET',
              `/api/v1/jobs/${jobId}/bundle?format=zip`,
            );

            expect(status).toBe(200);
            const filenames = extractZipFilenames(buffer);

            // Expected files in the ZIP
            expect(filenames.includes('copy-package.txt')).toBe(true);
            expect(filenames.includes('image-1.png')).toBe(true);
            expect(filenames.includes('image-2.png')).toBe(true);
            expect(filenames.includes('video.mp4')).toBe(true);
            expect(filenames.includes('storyboard.txt')).toBe(true);
            expect(filenames.includes('voiceover-script.txt')).toBe(true);
            expect(filenames.includes('manifest.json')).toBe(true);

            // GIF should have animation.gif filename
            expect(filenames.some((f) => f === 'animation.gif')).toBe(true);

            // Fallback metadata in metadata/ subdirectory
            expect(filenames.includes('metadata/image-concept.json')).toBe(true);
            expect(filenames.includes('metadata/video-brief.json')).toBe(true);

            // manifest.json is supplemental — not the only file
            const nonManifest = filenames.filter((f) => f !== 'manifest.json');
            expect(nonManifest.length).toBeGreaterThan(0);
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  // ── Property: Individual asset downloads return real files ─────────
  describe('Property: Individual asset downloads return real files via assets endpoint', () => {
    it('for any completed job, GET /assets returns assets with signedUrl for download', () => {
      /**
       * **Validates: Requirements 8.1, 8.2, 8.3**
       */
      return fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.subarray(DELIVERABLE_TYPES, { minLength: 1 }),
          async (jobId, assetTypes) => {
            vi.clearAllMocks();
            mocks.resetDocIdCounter();

            const assets: AssetReference[] = assetTypes.map((assetType, i) => ({
              assetId: `dl-${i}`,
              jobId,
              assetType: assetType as AssetType,
              storagePath: `${jobId}/${assetType}/dl-${i}.bin`,
              generationTimestamp: new Date(),
              status: 'completed',
            }));

            mocks.mockDocGet.mockResolvedValue({
              exists: true,
              data: () => ({
                id: jobId,
                state: JobState.Completed,
                assets,
                fallbackNotices: [],
                createdAt: new Date(),
                updatedAt: new Date(),
                creativeBrief: {
                  targetAudience: 'test',
                  tone: 'professional',
                  keyMessages: ['test'],
                  visualDirection: 'test',
                  inputSummary: 'test',
                },
              }),
            });

            mocks.mockGetDocs.mockResolvedValue({
              docs: assets.map((a) => ({ data: () => a })),
            });

            const { status, body } = await makeJsonRequest(
              server,
              'GET',
              `/api/v1/jobs/${jobId}/assets`,
            );

            expect(status).toBe(200);
            const bundle = body.bundle as Record<string, unknown>;
            const returnedAssets = bundle.assets as Array<Record<string, unknown>>;

            expect(returnedAssets.length).toBe(assetTypes.length);

            // Each deliverable asset should have a non-empty downloadUrl
            for (const asset of returnedAssets) {
              expect(typeof asset.signedUrl).toBe('string');
              // Deliverable assets should have downloadUrl
              expect(asset).toHaveProperty('downloadUrl');
              expect(asset.isFallback).toBe(false);
              expect(typeof asset.downloadUrl).toBe('string');
              expect((asset.downloadUrl as string).length).toBeGreaterThan(0);
            }
          },
        ),
        { numRuns: 20 },
      );
    });
  });
});
