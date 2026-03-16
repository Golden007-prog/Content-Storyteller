/**
 * AlloyDB Integration Property Tests — Media Pipeline Asset Fix
 *
 * Tests the AlloyDB storage layer and dual-write integration:
 * 1. Asset CRUD operations against AlloyDB
 * 2. Dual-write: createJob writes to both Firestore and AlloyDB
 * 3. Legacy read: queryAssets falls back to Firestore when AlloyDB has no data
 * 4. Asset query by job_id, asset_type, status
 *
 * **Validates: Requirements 5.1, 5.4, 20.1, 20.2, 21.1**
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

// ── Hoisted mocks ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  let docIdCounter = 0;
  const resetDocIdCounter = () => { docIdCounter = 0; };

  const mockDocSet = vi.fn().mockResolvedValue(undefined);
  const mockDocGet = vi.fn().mockResolvedValue({ exists: true, data: () => ({}) });
  const mockDocUpdate = vi.fn().mockResolvedValue(undefined);
  const mockDoc = vi.fn().mockImplementation((id?: string) => ({
    id: id || `mock-doc-${++docIdCounter}`,
    set: mockDocSet,
    get: mockDocGet,
    update: mockDocUpdate,
  }));
  const mockCollection = vi.fn().mockReturnValue({ doc: mockDoc });

  const mockPoolQuery = vi.fn();
  const mockPool = { query: mockPoolQuery, on: vi.fn(), end: vi.fn() };

  return {
    mockDocSet, mockDocGet, mockDocUpdate, mockDoc, mockCollection,
    mockPoolQuery, mockPool,
    resetDocIdCounter,
  };
});

// ── Mock GCP services ───────────────────────────────────────────────

vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => ({
    collection: mocks.mockCollection,
  })),
}));

vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => mocks.mockPool),
}));

// ── Import modules under test (after mocks) ────────────────────────

import {
  createAsset,
  getAssetsByJobId,
  updateAssetStatus,
  getAssetsByType,
  getAssetWithVersions,
  _resetPoolForTesting,
} from '../services/alloydb';
import type { CreateAssetInput, Asset } from '../services/alloydb';

import {
  createJob,
  queryAssets,
  recordAssetWithDualWrite,
} from '../services/firestore';

// ── Generators ──────────────────────────────────────────────────────

const ASSET_TYPES = ['copy', 'image', 'video', 'gif', 'storyboard', 'voiceover',
  'thumbnail', 'image_concept', 'video_brief_meta', 'gif_creative_direction'] as const;
const STATUSES = ['pending', 'completed', 'failed', 'skipped'] as const;
const FALLBACK_TYPES = new Set(['image_concept', 'video_brief_meta', 'gif_creative_direction']);

const arbAssetType = fc.constantFrom(...ASSET_TYPES);
const arbStatus = fc.constantFrom(...STATUSES);

function arbCreateAssetInput(): fc.Arbitrary<CreateAssetInput> {
  return fc.record({
    job_id: fc.constant('test-job-id'),
    asset_type: arbAssetType,
    storage_path: fc.constant('gs://bucket/path/file.png'),
    status: arbStatus,
    is_fallback: fc.boolean(),
  });
}

/** Build a fake AlloyDB Asset row from a CreateAssetInput */
function fakeAssetRow(input: CreateAssetInput, assetId: string): Asset {
  const now = new Date();
  return {
    asset_id: assetId,
    project_id: input.project_id ?? null,
    job_id: input.job_id,
    asset_type: input.asset_type,
    mime_type: input.mime_type ?? null,
    storage_path: input.storage_path,
    signed_url: null, public_url: null, preview_url: null,
    status: input.status ?? 'pending',
    source_model: null, generation_prompt: null, derived_from_asset_id: null,
    width: null, height: null, duration_seconds: null,
    file_size_bytes: null, checksum: null,
    is_fallback: input.is_fallback ?? false,
    created_at: now, updated_at: now,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('AlloyDB Integration Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetDocIdCounter();
    _resetPoolForTesting();
    process.env.ALLOYDB_CONNECTION_STRING = 'postgresql://test:test@localhost:5432/testdb';
  });

  // ── Property 1: createAsset returns a record with all fields set correctly ──

  describe('Property 1: createAsset returns record with all fields set correctly', () => {
    it('for any valid CreateAssetInput, createAsset returns a record matching the input', async () => {
      /**
       * **Validates: Requirements 5.1, 5.4**
       */
      await fc.assert(
        fc.asyncProperty(arbCreateAssetInput(), async (input) => {
          vi.clearAllMocks();
          _resetPoolForTesting();
          const expectedRow = fakeAssetRow(input, 'new-asset-id');
          mocks.mockPoolQuery.mockResolvedValueOnce({ rows: [expectedRow] });

          const result = await createAsset(input);

          expect(result.job_id).toBe(input.job_id);
          expect(result.asset_type).toBe(input.asset_type);
          expect(result.storage_path).toBe(input.storage_path);
          expect(result.status).toBe(input.status ?? 'pending');
          expect(result.is_fallback).toBe(input.is_fallback ?? false);
          expect(result.asset_id).toBeDefined();
          expect(result.created_at).toBeInstanceOf(Date);

          const [sql] = mocks.mockPoolQuery.mock.calls[0];
          expect(sql).toContain('INSERT INTO assets');
          expect(sql).toContain('RETURNING *');
        }),
        { numRuns: 20 },
      );
    });
  });

  // ── Property 2: getAssetsByJobId returns exactly N assets ──

  describe('Property 2: getAssetsByJobId returns exactly N assets', () => {
    it('for any job with N assets, getAssetsByJobId returns exactly N assets', async () => {
      /**
       * **Validates: Requirements 5.1**
       */
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 10 }),
          async (n) => {
            vi.clearAllMocks();
            _resetPoolForTesting();
            const jobId = 'test-job';
            const rows: Asset[] = Array.from({ length: n }, (_, i) =>
              fakeAssetRow({ job_id: jobId, asset_type: 'image', storage_path: `gs://b/img-${i}.png` }, `asset-${i}`),
            );
            mocks.mockPoolQuery.mockResolvedValueOnce({ rows });

            const result = await getAssetsByJobId(jobId);

            expect(result).toHaveLength(n);
            const [sql, params] = mocks.mockPoolQuery.mock.calls[0];
            expect(sql).toContain('WHERE job_id = $1');
            expect(params).toEqual([jobId]);
          },
        ),
        { numRuns: 15 },
      );
    });
  });

  // ── Property 3: updateAssetStatus changes status and updated_at ──

  describe('Property 3: updateAssetStatus changes status and updated_at', () => {
    it('for any asset, updateAssetStatus returns the updated row with new status', async () => {
      /**
       * **Validates: Requirements 5.1**
       */
      await fc.assert(
        fc.asyncProperty(arbStatus, async (newStatus) => {
          vi.clearAllMocks();
          _resetPoolForTesting();
          const assetId = 'test-asset-id';
          const updatedRow = fakeAssetRow(
            { job_id: 'j1', asset_type: 'image', storage_path: 'gs://b/p', status: newStatus },
            assetId,
          );
          mocks.mockPoolQuery.mockResolvedValueOnce({ rows: [updatedRow] });

          const result = await updateAssetStatus(assetId, newStatus);

          expect(result).not.toBeNull();
          expect(result!.asset_id).toBe(assetId);
          expect(result!.status).toBe(newStatus);
          const [sql, params] = mocks.mockPoolQuery.mock.calls[0];
          expect(sql).toContain('UPDATE assets SET status');
          expect(sql).toContain('updated_at = NOW()');
          expect(params).toEqual([newStatus, assetId]);
        }),
        { numRuns: 10 },
      );
    });

    it('returns null when asset does not exist', async () => {
      mocks.mockPoolQuery.mockResolvedValueOnce({ rows: [] });
      const result = await updateAssetStatus('nonexistent-id', 'completed');
      expect(result).toBeNull();
    });
  });

  // ── Property 4: getAssetsByType returns only matching assets ──

  describe('Property 4: getAssetsByType returns only matching assets', () => {
    it('for any asset type filter, getAssetsByType queries with correct parameters', async () => {
      /**
       * **Validates: Requirements 5.1, 5.4**
       */
      await fc.assert(
        fc.asyncProperty(
          arbAssetType,
          fc.integer({ min: 0, max: 5 }),
          async (assetType, count) => {
            vi.clearAllMocks();
            _resetPoolForTesting();
            const jobId = 'test-job';
            const rows: Asset[] = Array.from({ length: count }, (_, i) =>
              fakeAssetRow({ job_id: jobId, asset_type: assetType, storage_path: `gs://b/${assetType}-${i}.bin` }, `a-${i}`),
            );
            mocks.mockPoolQuery.mockResolvedValueOnce({ rows });

            const result = await getAssetsByType(jobId, assetType);

            expect(result).toHaveLength(count);
            for (const row of result) {
              expect(row.asset_type).toBe(assetType);
              expect(row.job_id).toBe(jobId);
            }
            const [sql, params] = mocks.mockPoolQuery.mock.calls[0];
            expect(sql).toContain('WHERE job_id = $1 AND asset_type = $2');
            expect(params).toEqual([jobId, assetType]);
          },
        ),
        { numRuns: 15 },
      );
    });
  });

  // ── Property 5: getAssetWithVersions returns both asset and versions ──

  describe('Property 5: getAssetWithVersions returns asset and versions', () => {
    it('for any asset with versions, getAssetWithVersions returns both', async () => {
      /**
       * **Validates: Requirements 5.1, 5.4**
       */
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 5 }),
          async (versionCount) => {
            vi.clearAllMocks();
            _resetPoolForTesting();
            const assetId = 'test-asset';
            const assetRow = fakeAssetRow(
              { job_id: 'j1', asset_type: 'image', storage_path: 'gs://b/img.png' },
              assetId,
            );
            const versionRows = Array.from({ length: versionCount }, (_, i) => ({
              version_id: `v-${i}`,
              asset_id: assetId,
              version_number: i + 1,
              storage_path: `gs://b/img-v${i + 1}.png`,
              file_size_bytes: null,
              checksum: null,
              created_at: new Date(),
            }));

            // First query: asset lookup, second: versions lookup
            mocks.mockPoolQuery
              .mockResolvedValueOnce({ rows: [assetRow] })
              .mockResolvedValueOnce({ rows: versionRows });

            const result = await getAssetWithVersions(assetId);

            expect(result).not.toBeNull();
            expect(result!.asset.asset_id).toBe(assetId);
            expect(result!.versions).toHaveLength(versionCount);
            for (let i = 0; i < versionCount; i++) {
              expect(result!.versions[i].asset_id).toBe(assetId);
              expect(result!.versions[i].version_number).toBe(i + 1);
            }
          },
        ),
        { numRuns: 10 },
      );
    });

    it('returns null when asset does not exist', async () => {
      mocks.mockPoolQuery.mockResolvedValueOnce({ rows: [] });
      const result = await getAssetWithVersions('nonexistent');
      expect(result).toBeNull();
    });
  });

  // ── Property 6: Dual-write — createJob writes to both Firestore and AlloyDB ──

  describe('Property 6: Dual-write — createJob writes to both stores', () => {
    it('createJob writes to Firestore and AlloyDB when configured', async () => {
      /**
       * **Validates: Requirements 20.1, 20.2**
       */
      mocks.mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const job = await createJob({
        correlationId: 'corr-dual',
        idempotencyKey: 'key-dual',
        uploadedMediaPaths: ['gs://bucket/file.png'],
        promptText: 'Test dual write',
        platform: 'instagram_reels' as any,
        tone: 'professional' as any,
      });

      // Firestore write happened
      expect(mocks.mockDocSet).toHaveBeenCalledTimes(1);
      expect(job.id).toBeDefined();
      expect(job.state).toBe('queued');

      // AlloyDB write happened
      expect(mocks.mockPoolQuery).toHaveBeenCalledTimes(1);
      const [sql] = mocks.mockPoolQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO jobs');
    });

    it('createJob still succeeds when AlloyDB write fails (best-effort)', async () => {
      /**
       * **Validates: Requirements 20.1**
       */
      mocks.mockPoolQuery.mockRejectedValueOnce(new Error('AlloyDB connection refused'));

      const job = await createJob({
        correlationId: 'corr-fail',
        idempotencyKey: 'key-fail',
        uploadedMediaPaths: [],
      });

      expect(mocks.mockDocSet).toHaveBeenCalledTimes(1);
      expect(job.id).toBeDefined();
    });

    it('createJob skips AlloyDB when not configured', async () => {
      /**
       * **Validates: Requirements 20.1, 21.1**
       */
      delete process.env.ALLOYDB_CONNECTION_STRING;
      _resetPoolForTesting();

      const job = await createJob({
        correlationId: 'corr-no-alloy',
        idempotencyKey: 'key-no-alloy',
        uploadedMediaPaths: [],
      });

      expect(mocks.mockDocSet).toHaveBeenCalledTimes(1);
      expect(job.id).toBeDefined();
      expect(mocks.mockPoolQuery).not.toHaveBeenCalled();
    });
  });

  // ── Property 7: Legacy — queryAssets falls back to Firestore ──

  describe('Property 7: Legacy — queryAssets falls back to Firestore', () => {
    it('queryAssets marks fallback-type assets as legacy from Firestore', async () => {
      /**
       * **Validates: Requirements 20.2, 21.1**
       */
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbAssetType, { minLength: 1, maxLength: 6 }),
          async (assetTypes) => {
            vi.clearAllMocks();
            _resetPoolForTesting();
            process.env.ALLOYDB_CONNECTION_STRING = 'postgresql://test:test@localhost:5432/testdb';

            const jobId = 'legacy-job';
            const assets = assetTypes.map((type, i) => ({
              assetId: `asset-${i}`,
              jobId,
              assetType: type,
              storagePath: `gs://bucket/${jobId}/${type}/asset-${i}.bin`,
              generationTimestamp: new Date(),
              status: 'completed' as const,
            }));

            const job = {
              id: jobId, correlationId: 'corr', idempotencyKey: 'key',
              state: 'completed', uploadedMediaPaths: [],
              assets, fallbackNotices: [],
              createdAt: new Date(), updatedAt: new Date(),
            };

            // AlloyDB getAssetsByJobId returns empty → Firestore fallback
            mocks.mockPoolQuery.mockResolvedValueOnce({ rows: [] });
            mocks.mockDocGet.mockResolvedValueOnce({ exists: true, data: () => job });

            const result = await queryAssets(jobId);

            expect(result).toHaveLength(assetTypes.length);
            for (let i = 0; i < result.length; i++) {
              const asset = result[i] as any;
              if (FALLBACK_TYPES.has(assetTypes[i])) {
                expect(asset.isLegacy).toBe(true);
              } else {
                expect(asset.isLegacy).toBe(false);
              }
            }
          },
        ),
        { numRuns: 15 },
      );
    });

    it('queryAssets returns AlloyDB assets when AlloyDB has data', async () => {
      /**
       * **Validates: Requirements 5.1, 20.1**
       */
      const alloyRows = [
        fakeAssetRow({ job_id: 'j1', asset_type: 'image', storage_path: 'gs://b/img.png' }, 'a1'),
        fakeAssetRow({ job_id: 'j1', asset_type: 'video', storage_path: 'gs://b/vid.mp4' }, 'a2'),
      ];
      mocks.mockPoolQuery.mockResolvedValueOnce({ rows: alloyRows });

      const result = await queryAssets('j1');

      expect(result).toHaveLength(2);
      expect(result[0].assetType).toBe('image');
      expect(result[1].assetType).toBe('video');
      expect(mocks.mockDocGet).not.toHaveBeenCalled();
    });

    it('queryAssets returns empty when job not found in either store', async () => {
      /**
       * **Validates: Requirements 21.1**
       */
      mocks.mockPoolQuery.mockResolvedValueOnce({ rows: [] });
      mocks.mockDocGet.mockResolvedValueOnce({ exists: false, data: () => null });

      const result = await queryAssets('nonexistent');
      expect(result).toEqual([]);
    });
  });

  // ── recordAssetWithDualWrite ──

  describe('recordAssetWithDualWrite writes to both stores', () => {
    it('writes asset to Firestore job.assets array and AlloyDB', async () => {
      /**
       * **Validates: Requirements 20.1, 5.1**
       */
      const existingJob = { id: 'j1', assets: [], state: 'processing' };
      mocks.mockDocGet.mockResolvedValueOnce({ exists: true, data: () => existingJob });
      mocks.mockPoolQuery.mockResolvedValueOnce({
        rows: [fakeAssetRow({ job_id: 'j1', asset_type: 'image', storage_path: 'gs://b/img.png' }, 'new-a')],
      });

      await recordAssetWithDualWrite('j1', {
        assetId: 'new-a',
        jobId: 'j1',
        assetType: 'image' as any,
        storagePath: 'gs://b/img.png',
        generationTimestamp: new Date(),
        status: 'completed',
      });

      // Firestore update was called
      expect(mocks.mockDocUpdate).toHaveBeenCalledTimes(1);
      const updateArgs = mocks.mockDocUpdate.mock.calls[0][0];
      expect(updateArgs.assets).toHaveLength(1);
      expect(updateArgs.assets[0].assetId).toBe('new-a');

      // AlloyDB INSERT was called
      expect(mocks.mockPoolQuery).toHaveBeenCalledTimes(1);
      const [sql] = mocks.mockPoolQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO assets');
    });
  });
});
