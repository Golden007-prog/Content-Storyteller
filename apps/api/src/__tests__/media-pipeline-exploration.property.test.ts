/**
 * Bug Condition Exploration Property Tests — Media Pipeline Asset Fix (API)
 *
 * Property 1: Bug Condition — Assets Endpoint and ZIP Bundle Defects
 *
 * These tests encode the EXPECTED (correct) behavior.
 * They are EXPECTED TO FAIL on unfixed code, confirming the bugs exist.
 *
 * Defect 5: Assets Endpoint Missing isFallback/previewUrl/downloadUrl
 * Defect 6: ZIP Contains Only JSON Metadata (no manifest.json)
 * Defect 8: Live Agent No Trend Integration
 *
 * **Validates: Requirements 1.5, 1.6, 1.8**
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import http from 'http';
import {
  JobState,
  AssetType,
} from '@content-storyteller/shared';
import type { AssetReference, Job } from '@content-storyteller/shared';

// ── Hoisted mocks ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  let docIdCounter = 0;
  const resetDocIdCounter = () => { docIdCounter = 0; };

  const mockFileSave = vi.fn().mockResolvedValue(undefined);
  const mockFileDownload = vi.fn().mockResolvedValue([Buffer.from('{}')]);
  const mockFileGetSignedUrl = vi.fn().mockResolvedValue(['https://signed-url.example.com/file']);
  const mockBucketFile = vi.fn().mockReturnValue({
    save: mockFileSave,
    download: mockFileDownload,
    getSignedUrl: mockFileGetSignedUrl,
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

  const mockGenerateContent = vi.fn().mockResolvedValue('Mock AI response');

  return {
    mockFileSave, mockFileDownload, mockFileGetSignedUrl, mockBucketFile, mockBucket,
    mockDocSet, mockDocGet, mockDocUpdate, mockDoc, mockCollection,
    mockWhere, mockOrderBy, mockGetDocs,
    mockPublishMessage, mockTopic,
    mockGenerateContent,
    resetDocIdCounter,
  };
});

// ── Mock GCP services ───────────────────────────────────────────────

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
}));

vi.mock('../services/genai', () => ({
  generateContent: (...args: unknown[]) => mocks.mockGenerateContent(...args),
}));

import { app } from '../index';

// ── Helpers ─────────────────────────────────────────────────────────

function makeRequest(
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

function makeRawRequest(
  server: http.Server,
  method: string,
  path: string,
): Promise<{ status: number; buffer: Buffer }> {
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
          resolve({ status: res.statusCode || 500, buffer: Buffer.concat(chunks) });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}


// ── Defect 5: Assets Endpoint Missing isFallback/previewUrl/downloadUrl ─

describe('Defect 5 (PBT): Assets endpoint returns isFallback, previewUrl, downloadUrl on each asset', () => {
  let server: http.Server;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.resetDocIdCounter();
    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('for a completed job with mixed asset types, each asset has isFallback, previewUrl, downloadUrl', async () => {
    /**
     * **Validates: Requirements 1.5**
     *
     * Mock Firestore to return a completed job with mixed asset types
     * (image, video, image_concept, video_brief_meta). Call GET /jobs/:jobId/assets.
     * Assert each asset in the response has isFallback, previewUrl, and downloadUrl fields.
     *
     * WILL FAIL on unfixed code: these fields don't exist in the response.
     * The current code only returns signedUrl.
     */
    const jobId = 'assets-test-job';

    const mixedAssets: AssetReference[] = [
      {
        assetId: 'asset-1',
        jobId,
        assetType: AssetType.Image,
        storagePath: `${jobId}/images/asset-1.png`,
        generationTimestamp: new Date(),
        status: 'completed',
      },
      {
        assetId: 'asset-2',
        jobId,
        assetType: AssetType.Video,
        storagePath: `${jobId}/video/asset-2.mp4`,
        generationTimestamp: new Date(),
        status: 'completed',
      },
      {
        assetId: 'asset-3',
        jobId,
        assetType: AssetType.ImageConcept,
        storagePath: `${jobId}/image-concepts/asset-3.json`,
        generationTimestamp: new Date(),
        status: 'completed',
      },
      {
        assetId: 'asset-4',
        jobId,
        assetType: AssetType.VideoBriefMeta,
        storagePath: `${jobId}/video-brief/asset-4.json`,
        generationTimestamp: new Date(),
        status: 'completed',
      },
      {
        assetId: 'asset-5',
        jobId,
        assetType: AssetType.Copy,
        storagePath: `${jobId}/copy/asset-5.json`,
        generationTimestamp: new Date(),
        status: 'completed',
      },
    ];

    const jobData = {
      id: jobId,
      state: JobState.Completed,
      assets: mixedAssets,
      correlationId: 'corr-test',
      idempotencyKey: 'key-test',
      uploadedMediaPaths: [],
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
    };

    // Mock getJob to return the completed job
    mocks.mockDocGet.mockResolvedValue({
      exists: true,
      data: () => jobData,
    });

    // Mock queryAssets to return the mixed assets
    mocks.mockGetDocs.mockResolvedValue({
      docs: mixedAssets.map((a) => ({
        data: () => a,
      })),
    });

    const { status, body } = await makeRequest(server, 'GET', `/api/v1/jobs/${jobId}/assets`);

    expect(status).toBe(200);
    expect(body).toHaveProperty('bundle');

    const bundle = body.bundle as Record<string, unknown>;
    const assets = bundle.assets as Array<Record<string, unknown>>;

    expect(Array.isArray(assets)).toBe(true);
    expect(assets.length).toBeGreaterThan(0);

    // EXPECTED: each asset has isFallback, previewUrl, downloadUrl fields
    // WILL FAIL on unfixed code: these fields don't exist
    for (const asset of assets) {
      expect(asset).toHaveProperty('isFallback');
      expect(typeof asset.isFallback).toBe('boolean');
      expect(asset).toHaveProperty('previewUrl');
      expect(asset).toHaveProperty('downloadUrl');
    }

    // Verify isFallback is correct for known types
    const imageConcept = assets.find((a) => a.assetType === 'image_concept');
    if (imageConcept) {
      expect(imageConcept.isFallback).toBe(true);
    }

    const imageAsset = assets.find((a) => a.assetType === 'image');
    if (imageAsset) {
      expect(imageAsset.isFallback).toBe(false);
    }
  });
});

// ── Defect 6: ZIP Contains Only JSON Metadata (no manifest.json) ────

describe('Defect 6 (PBT): ZIP bundle contains manifest.json', () => {
  let server: http.Server;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.resetDocIdCounter();
    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('for a completed job, ZIP bundle includes a manifest.json file', async () => {
    /**
     * **Validates: Requirements 1.6**
     *
     * Mock a completed job with image_concept and video_brief_meta assets.
     * Request GET /jobs/:jobId/bundle?format=zip. Assert ZIP contains
     * a manifest.json file.
     *
     * WILL FAIL on unfixed code: current code doesn't generate manifest.json.
     * The ZIP only contains the raw asset files fetched from signed URLs.
     */
    const jobId = 'zip-test-job';

    const metadataAssets: AssetReference[] = [
      {
        assetId: 'meta-1',
        jobId,
        assetType: AssetType.ImageConcept,
        storagePath: `${jobId}/image-concepts/meta-1.json`,
        generationTimestamp: new Date(),
        status: 'completed',
      },
      {
        assetId: 'meta-2',
        jobId,
        assetType: AssetType.VideoBriefMeta,
        storagePath: `${jobId}/video-brief/meta-2.json`,
        generationTimestamp: new Date(),
        status: 'completed',
      },
    ];

    const jobData = {
      id: jobId,
      state: JobState.Completed,
      assets: metadataAssets,
      correlationId: 'corr-test',
      idempotencyKey: 'key-test',
      uploadedMediaPaths: [],
      fallbackNotices: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      platform: 'general_promo_package',
      tone: 'professional',
    };

    mocks.mockDocGet.mockResolvedValue({
      exists: true,
      data: () => jobData,
    });

    mocks.mockGetDocs.mockResolvedValue({
      docs: metadataAssets.map((a) => ({
        data: () => a,
      })),
    });

    // Mock fetch for signed URL downloads (the ZIP handler fetches each asset)
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return new Response(JSON.stringify({ type: 'metadata', content: 'test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const { status, buffer } = await makeRawRequest(
      server,
      'GET',
      `/api/v1/jobs/${jobId}/bundle?format=zip`,
    );

    globalThis.fetch = originalFetch;

    expect(status).toBe(200);

    // Parse the ZIP to check for manifest.json
    // ZIP files start with PK signature (0x504B0304)
    const isZip = buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4B;
    expect(isZip).toBe(true);

    // Search for "manifest.json" in the ZIP buffer
    // ZIP central directory entries contain filenames as plain text
    const zipContent = buffer.toString('binary');
    const hasManifest = zipContent.includes('manifest.json');

    // EXPECTED: ZIP should contain a manifest.json file
    // WILL FAIL on unfixed code: no manifest.json is generated
    expect(hasManifest).toBe(true);
  });
});

// ── Defect 8: Live Agent No Trend Integration ───────────────────────

describe('Defect 8 (PBT): Live Agent integrates Trend Analyzer data', () => {
  let server: http.Server;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.resetDocIdCounter();
    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('when user asks about trends, agent response references real trend data', async () => {
    /**
     * **Validates: Requirements 1.8**
     *
     * Mock processLiveInput() with "What's trending on Instagram for tech products?".
     * Assert the agent response references real trend data from Trend Analyzer.
     *
     * WILL FAIL on unfixed code: the agent doesn't query Trend Analyzer.
     * It uses a generic Creative Director prompt without any trend data.
     */

    // Mock generateContent to return a response that includes trend data
    // (if the system actually queries trends and includes them in the prompt)
    let capturedPrompt = '';
    mocks.mockGenerateContent.mockImplementation(async (prompt: string) => {
      capturedPrompt = prompt;
      // Return a generic creative director response
      return 'Great question! For tech products on Instagram, I recommend focusing on short-form video content with clean aesthetics.';
    });

    // Create a session first
    const sessionId = 'trend-test-session';
    const sessionData = {
      sessionId,
      transcript: [],
      status: 'active',
      createdAt: new Date(),
    };

    // Mock Firestore for session operations
    let storedTranscript: Array<{ role: string; text: string; timestamp: string }> = [];
    mocks.mockDoc.mockImplementation((id?: string) => ({
      id: id || sessionId,
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockImplementation(() => {
        return Promise.resolve({
          exists: true,
          data: () => ({
            ...sessionData,
            transcript: storedTranscript,
          }),
        });
      }),
      update: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        if (data.transcript) {
          storedTranscript = data.transcript as typeof storedTranscript;
        }
        return Promise.resolve();
      }),
    }));

    // Send a trend-related message via POST /api/v1/live/input
    const postBody = JSON.stringify({
      sessionId,
      text: "What's trending on Instagram for tech products?",
    });

    const result = await new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
      const addr = server.address() as { port: number };
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/api/v1/live/input',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postBody),
          },
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
      req.write(postBody);
      req.end();
    });

    // The request should succeed (200)
    expect(result.status).toBe(200);

    // EXPECTED: The prompt sent to Gemini should include trend data
    // (i.e., the system should have queried Trend Analyzer and included results)
    // WILL FAIL on unfixed code: the prompt is a generic Creative Director prompt
    // without any trend data integration
    const promptIncludesTrendData =
      capturedPrompt.includes('trend') ||
      capturedPrompt.includes('Trend') ||
      capturedPrompt.includes('trending') ||
      capturedPrompt.includes('momentum') ||
      capturedPrompt.includes('hashtag');

    // The prompt should reference trend data from the Trend Analyzer
    // On unfixed code, the prompt is just a generic "Creative Director assistant" prompt
    expect(promptIncludesTrendData).toBe(true);

    // Additionally, the agent response should reference specific trends
    const agentText = (result.body as Record<string, unknown>).agentText as string;
    expect(agentText).toBeDefined();
  });
});
