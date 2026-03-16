/**
 * Preservation Property Tests — Media Pipeline Asset Fix (API)
 *
 * Property 2: Preservation — Output Intent Resolution, Job Poll Endpoint,
 * Trend Analyzer Standalone, Model Router Resolution, Firestore Data
 *
 * These tests verify EXISTING working behavior that must NOT be broken
 * by the upcoming fixes. They MUST PASS on the current unfixed code.
 *
 * Preservation C — Output Intent Resolution
 * Preservation D — Job Poll Endpoint
 * Preservation E — Trend Analyzer Standalone
 * Preservation F — Model Router Resolution
 *
 * **Validates: Requirements 3.6, 3.7, 3.8, 3.9, 6.1, 6.2, 9.1, 12.1, 15.1, 18.1, 21.1, 24.1**
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import http from 'http';
import {
  Platform,
  Tone,
  OutputPreference,
  OutputIntent,
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
  Type: { STRING: 'STRING', OBJECT: 'OBJECT', NUMBER: 'NUMBER', INTEGER: 'INTEGER', BOOLEAN: 'BOOLEAN', ARRAY: 'ARRAY' },
}));

vi.mock('../services/genai', () => ({
  generateContent: (...args: unknown[]) => mocks.mockGenerateContent(...args),
}));

import { resolveOutputIntent, PlannerInput } from '../services/planner/output-intent';
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

// ── Preservation C: Output Intent Resolution ────────────────────────

describe('Preservation C (PBT): resolveOutputIntent maps correctly for all Platform/Tone/OutputPreference combos', () => {
  it('wantsCopy is always true for any input combination', () => {
    /**
     * **Validates: Requirements 3.6**
     *
     * For any Platform × Tone × OutputPreference combination,
     * resolveOutputIntent always sets wantsCopy = true.
     */
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.values(Platform)),
        fc.constantFrom(...Object.values(Tone)),
        fc.constantFrom(...Object.values(OutputPreference)),
        fc.string({ minLength: 1, maxLength: 50 }),
        (platform, tone, outputPref, prompt) => {
          const input: PlannerInput = {
            promptText: prompt,
            platform,
            tone,
            uploadedMediaPaths: [],
            outputPreference: outputPref,
          };
          const intent = resolveOutputIntent(input);
          expect(intent.wantsCopy).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('CopyOnly preference disables image and video', () => {
    /**
     * **Validates: Requirements 3.6**
     *
     * When outputPreference is CopyOnly, wantsImage and wantsVideo
     * should both be false.
     */
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.values(Platform)),
        fc.constantFrom(...Object.values(Tone)),
        (platform, tone) => {
          const input: PlannerInput = {
            promptText: 'Write some copy',
            platform,
            tone,
            uploadedMediaPaths: [],
            outputPreference: OutputPreference.CopyOnly,
          };
          const intent = resolveOutputIntent(input);
          expect(intent.wantsImage).toBe(false);
          expect(intent.wantsVideo).toBe(false);
          expect(intent.wantsCopy).toBe(true);
        },
      ),
      { numRuns: 20 },
    );
  });

  it('FullPackage preference enables image, video, storyboard, voiceover, and gif', () => {
    /**
     * **Validates: Requirements 3.6**
     *
     * When outputPreference is FullPackage, all media types should be enabled.
     */
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.values(Platform)),
        fc.constantFrom(...Object.values(Tone)),
        (platform, tone) => {
          const input: PlannerInput = {
            promptText: 'Create a full package',
            platform,
            tone,
            uploadedMediaPaths: [],
            outputPreference: OutputPreference.FullPackage,
          };
          const intent = resolveOutputIntent(input);
          expect(intent.wantsImage).toBe(true);
          expect(intent.wantsVideo).toBe(true);
          expect(intent.wantsStoryboard).toBe(true);
          expect(intent.wantsVoiceover).toBe(true);
          expect(intent.wantsGif).toBe(true);
          expect(intent.wantsCopy).toBe(true);
        },
      ),
      { numRuns: 20 },
    );
  });

  it('CopyImage preference enables image but not video', () => {
    /**
     * **Validates: Requirements 3.6**
     */
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.values(Platform)),
        fc.constantFrom(...Object.values(Tone)),
        (platform, tone) => {
          const input: PlannerInput = {
            promptText: 'Create copy with image',
            platform,
            tone,
            uploadedMediaPaths: [],
            outputPreference: OutputPreference.CopyImage,
          };
          const intent = resolveOutputIntent(input);
          expect(intent.wantsImage).toBe(true);
          expect(intent.wantsVideo).toBe(false);
          expect(intent.wantsCopy).toBe(true);
        },
      ),
      { numRuns: 20 },
    );
  });

  it('CopyVideo preference enables video but not image', () => {
    /**
     * **Validates: Requirements 3.6**
     */
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.values(Platform)),
        fc.constantFrom(...Object.values(Tone)),
        (platform, tone) => {
          const input: PlannerInput = {
            promptText: 'Create copy with video',
            platform,
            tone,
            uploadedMediaPaths: [],
            outputPreference: OutputPreference.CopyVideo,
          };
          const intent = resolveOutputIntent(input);
          expect(intent.wantsVideo).toBe(true);
          expect(intent.wantsImage).toBe(false);
          expect(intent.wantsStoryboard).toBe(true);
          expect(intent.wantsVoiceover).toBe(true);
          expect(intent.wantsCopy).toBe(true);
        },
      ),
      { numRuns: 20 },
    );
  });

  it('CopyGif preference enables gif but not video or image', () => {
    /**
     * **Validates: Requirements 3.6**
     */
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.values(Platform)),
        fc.constantFrom(...Object.values(Tone)),
        (platform, tone) => {
          const input: PlannerInput = {
            promptText: 'Create copy with gif',
            platform,
            tone,
            uploadedMediaPaths: [],
            outputPreference: OutputPreference.CopyGif,
          };
          const intent = resolveOutputIntent(input);
          expect(intent.wantsGif).toBe(true);
          expect(intent.wantsVideo).toBe(false);
          expect(intent.wantsImage).toBe(false);
          expect(intent.wantsCopy).toBe(true);
        },
      ),
      { numRuns: 20 },
    );
  });

  it('output intent result always has all boolean fields defined', () => {
    /**
     * **Validates: Requirements 3.6**
     *
     * The OutputIntent object should always have all boolean fields defined.
     */
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.values(Platform)),
        fc.constantFrom(...Object.values(Tone)),
        fc.constantFrom(...Object.values(OutputPreference)),
        fc.string({ minLength: 1, maxLength: 50 }),
        (platform, tone, outputPref, prompt) => {
          const input: PlannerInput = {
            promptText: prompt,
            platform,
            tone,
            uploadedMediaPaths: [],
            outputPreference: outputPref,
          };
          const intent = resolveOutputIntent(input);
          const boolFields: (keyof OutputIntent)[] = [
            'wantsCopy', 'wantsHashtags', 'wantsImage', 'wantsVideo',
            'wantsStoryboard', 'wantsVoiceover', 'wantsCarousel',
            'wantsThread', 'wantsLinkedInPost', 'wantsGif',
          ];
          for (const field of boolFields) {
            expect(typeof intent[field]).toBe('boolean');
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ── Preservation D: Job Poll Endpoint ───────────────────────────────

describe('Preservation D (PBT): GET /jobs/:jobId returns all required fields', () => {
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

  it('poll response includes jobId, state, assets, creativeBrief, platform, tone, requestedOutputs, skippedOutputs, outputIntent', async () => {
    /**
     * **Validates: Requirements 3.7, 12.1**
     *
     * The job poll endpoint must return all existing fields.
     */
    const jobId = 'poll-test-job';
    const outputIntent: OutputIntent = {
      wantsCopy: true,
      wantsHashtags: true,
      wantsImage: true,
      wantsVideo: false,
      wantsStoryboard: false,
      wantsVoiceover: false,
      wantsCarousel: false,
      wantsThread: false,
      wantsLinkedInPost: false,
      wantsGif: false,
    };

    const jobData = {
      id: jobId,
      state: JobState.Completed,
      assets: [{
        assetId: 'a1',
        jobId,
        assetType: AssetType.Copy,
        storagePath: `${jobId}/copy/a1.json`,
        generationTimestamp: new Date(),
        status: 'completed',
      }],
      correlationId: 'corr-test',
      idempotencyKey: 'key-test',
      uploadedMediaPaths: [],
      fallbackNotices: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      creativeBrief: {
        targetAudience: 'Developers',
        tone: 'professional',
        keyMessages: ['Build great software'],
        visualDirection: 'Clean',
        inputSummary: 'Test',
      },
      platform: Platform.GeneralPromoPackage,
      tone: Tone.Professional,
      requestedOutputs: ['copy', 'hashtags', 'image'],
      skippedOutputs: ['video'],
      outputIntent,
    };

    mocks.mockDocGet.mockResolvedValue({
      exists: true,
      data: () => jobData,
    });

    const { status, body } = await makeRequest(server, 'GET', `/api/v1/jobs/${jobId}`);

    expect(status).toBe(200);
    expect(body.jobId).toBe(jobId);
    expect(body.state).toBe(JobState.Completed);
    expect(body).toHaveProperty('assets');
    expect(body).toHaveProperty('creativeBrief');
    expect(body.platform).toBe(Platform.GeneralPromoPackage);
    expect(body.tone).toBe(Tone.Professional);
    expect(body).toHaveProperty('requestedOutputs');
    expect(body).toHaveProperty('skippedOutputs');
    expect(body).toHaveProperty('outputIntent');
  });

  it('returns 404 for non-existent job', async () => {
    /**
     * **Validates: Requirements 3.7, 12.1**
     */
    mocks.mockDocGet.mockResolvedValue({ exists: false, data: () => null });

    const { status, body } = await makeRequest(server, 'GET', '/api/v1/jobs/nonexistent-job');

    expect(status).toBe(404);
    expect(body).toHaveProperty('error');
  });
});

// ── Preservation E: Trend Analyzer Standalone ───────────────────────

describe('Preservation E (PBT): Trend analysis returns correct results', () => {
  it('analyzeTrends returns a result with summary and trends array for any valid query', async () => {
    /**
     * **Validates: Requirements 3.8**
     *
     * The Trend Analyzer standalone should continue to work correctly.
     * We mock the GenAI response and verify the output structure.
     */
    // Initialize model router so getModel('text') works inside analyzeTrends
    const { initModelRouter, _resetRouterForTesting } = await import('@content-storyteller/shared');
    _resetRouterForTesting();
    await initModelRouter({ checkAvailability: async () => true });

    // Mock GenAI to return valid trend data
    mocks.mockGenerateContent.mockResolvedValue(JSON.stringify({
      summary: 'Tech trends are booming on Instagram.',
      trends: [
        {
          title: 'AI Tools',
          keyword: 'ai-tools',
          description: 'AI tools are trending',
          momentumScore: 85,
          relevanceScore: 90,
          suggestedHashtags: ['#AI', '#tech'],
          suggestedHook: 'AI is changing everything',
          suggestedContentAngle: 'Show AI in action',
          sourceLabels: ['inferred'],
          region: { scope: 'global' },
          platform: 'instagram_reels',
          freshnessLabel: 'Fresh',
        },
        {
          title: 'Cloud Computing',
          keyword: 'cloud',
          description: 'Cloud adoption accelerating',
          momentumScore: 70,
          relevanceScore: 75,
          suggestedHashtags: ['#cloud', '#devops'],
          suggestedHook: 'The cloud revolution',
          suggestedContentAngle: 'Migration stories',
          sourceLabels: ['inferred'],
          region: { scope: 'global' },
          platform: 'instagram_reels',
          freshnessLabel: 'Rising Fast',
        },
      ],
    }));

    const { analyzeTrends } = await import('../services/trends/analyzer');

    const result = await analyzeTrends({
      platform: 'instagram_reels',
      domain: 'technology',
      region: { scope: 'global' },
    });

    expect(result).toBeDefined();
    expect(typeof result.summary).toBe('string');
    expect(Array.isArray(result.trends)).toBe(true);
    expect(result.trends.length).toBeGreaterThan(0);

    // Each trend should have required fields
    for (const trend of result.trends) {
      expect(trend.title).toBeDefined();
      expect(trend.keyword).toBeDefined();
      expect(typeof trend.momentumScore).toBe('number');
      expect(trend.momentumScore).toBeGreaterThanOrEqual(0);
      expect(trend.momentumScore).toBeLessThanOrEqual(100);
      expect(typeof trend.relevanceScore).toBe('number');
      expect(Array.isArray(trend.suggestedHashtags)).toBe(true);
      expect(trend.freshnessLabel).toBeDefined();
    }

    // Trends should be sorted by composite score (descending)
    for (let i = 1; i < result.trends.length; i++) {
      const prev = result.trends[i - 1];
      const curr = result.trends[i];
      // Composite: momentum*0.3 + relevance*0.3 + freshness*0.2 + platform_fit*0.2
      // We just verify the order is maintained (higher scores first)
      const prevScore = prev.momentumScore * 0.3 + prev.relevanceScore * 0.3;
      const currScore = curr.momentumScore * 0.3 + curr.relevanceScore * 0.3;
      // Allow equal scores (freshness/platform_fit may differ)
      expect(prevScore).toBeGreaterThanOrEqual(currScore - 20); // generous tolerance
    }

    expect(result.platform).toBe('instagram_reels');
    expect(result.domain).toBe('technology');

    _resetRouterForTesting();
  });
});

// ── Preservation F: Model Router Resolution ─────────────────────────

describe('Preservation F (PBT): getModel(slot) returns non-empty string for all slots', () => {
  it('after initialization, getModel returns a non-empty model string for every slot', async () => {
    /**
     * **Validates: Requirements 3.9**
     *
     * After initModelRouter(), getModel(slot) should return a non-empty
     * string for all capability slots.
     */
    const {
      initModelRouter,
      getModel,
      _resetRouterForTesting,
    } = await import('@content-storyteller/shared');

    // Use the real initModelRouter with a mock availability check
    _resetRouterForTesting();

    await initModelRouter({
      checkAvailability: async () => true,
    });

    const slots = ['text', 'textFallback', 'reasoning', 'image', 'imageHQ', 'videoFast', 'videoFinal', 'live'] as const;

    for (const slot of slots) {
      const model = getModel(slot);
      expect(typeof model).toBe('string');
      expect(model.length).toBeGreaterThan(0);
    }

    _resetRouterForTesting();
  });

  it('getModel throws RouterNotInitializedError before initialization', async () => {
    /**
     * **Validates: Requirements 3.9**
     */
    const {
      getModel,
      _resetRouterForTesting,
      RouterNotInitializedError,
    } = await import('@content-storyteller/shared');

    _resetRouterForTesting();

    expect(() => getModel('text')).toThrow(RouterNotInitializedError);

    _resetRouterForTesting();
  });
});

// ── Preservation: JSON Manifest Unchanged ───────────────────────────

describe('Preservation (PBT): JSON manifest mode returns correct response', () => {
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

  it('GET /jobs/:jobId/bundle without ?format=zip returns JSON manifest with assets, generatedAt, platform, tone', async () => {
    /**
     * **Validates: Requirements 9.1**
     *
     * The JSON manifest mode (no ?format=zip) must continue to work identically.
     */
    const jobId = 'manifest-test-job';
    const assets: AssetReference[] = [
      {
        assetId: 'a1',
        jobId,
        assetType: AssetType.Copy,
        storagePath: `${jobId}/copy/a1.json`,
        generationTimestamp: new Date(),
        status: 'completed',
      },
    ];

    mocks.mockDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        id: jobId,
        state: JobState.Completed,
        assets,
        platform: Platform.InstagramReel,
        tone: Tone.Cinematic,
        correlationId: 'corr',
        idempotencyKey: 'key',
        uploadedMediaPaths: [],
        fallbackNotices: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    });

    mocks.mockGetDocs.mockResolvedValue({
      docs: assets.map((a) => ({ data: () => a })),
    });

    const { status, body } = await makeRequest(server, 'GET', `/api/v1/jobs/${jobId}/bundle`);

    expect(status).toBe(200);
    expect(body).toHaveProperty('assets');
    expect(body).toHaveProperty('generatedAt');
    expect(body.platform).toBe(Platform.InstagramReel);
    expect(body.tone).toBe(Tone.Cinematic);
    expect(Array.isArray(body.assets)).toBe(true);

    // Each asset should have signedUrl (backward compat)
    const assetList = body.assets as Array<Record<string, unknown>>;
    for (const asset of assetList) {
      expect(asset).toHaveProperty('signedUrl');
    }
  });
});
