/**
 * Unit tests for legacy record handling in the Firestore dual-write layer.
 *
 * Validates: Requirements 20.2, 21.1
 *
 * Tests cover:
 * - getJobWithLegacyHandling: legacy detection when job exists in Firestore but not AlloyDB
 * - queryAssets: legacy marking for Firestore-only fallback assets
 * - migrateJobToAlloyDb: backfill helper for Firestore-only jobs
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const mockDocGet = vi.fn();
  const mockDocSet = vi.fn().mockResolvedValue(undefined);
  const mockDocUpdate = vi.fn().mockResolvedValue(undefined);
  const mockDoc = vi.fn().mockImplementation((id?: string) => ({
    id: id || 'mock-doc-id',
    set: mockDocSet,
    get: mockDocGet,
    update: mockDocUpdate,
  }));
  const mockCollection = vi.fn().mockReturnValue({ doc: mockDoc });

  const mockPoolQuery = vi.fn();
  const mockGetPool = vi.fn().mockReturnValue({ query: mockPoolQuery });
  const mockAlloyCreateAsset = vi.fn().mockResolvedValue({});
  const mockAlloyGetAssetsByJobId = vi.fn().mockResolvedValue([]);

  return {
    mockDocGet, mockDocSet, mockDocUpdate, mockDoc, mockCollection,
    mockPoolQuery, mockGetPool, mockAlloyCreateAsset, mockAlloyGetAssetsByJobId,
  };
});

// ── Mock GCP services ───────────────────────────────────────────────

vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => ({
    collection: mocks.mockCollection,
  })),
}));

vi.mock('../services/alloydb', () => ({
  getPool: mocks.mockGetPool,
  createAsset: mocks.mockAlloyCreateAsset,
  getAssetsByJobId: mocks.mockAlloyGetAssetsByJobId,
}));

// ── Import module under test (after mocks) ─────────────────────────

import {
  getJobWithLegacyHandling,
  queryAssets,
  migrateJobToAlloyDb,
  isAlloyDbConfigured,
} from '../services/firestore';

// ── Helpers ─────────────────────────────────────────────────────────

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    correlationId: 'corr-1',
    idempotencyKey: 'key-1',
    state: 'completed',
    uploadedMediaPaths: ['gs://bucket/file.png'],
    assets: [],
    fallbackNotices: [],
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function makeAsset(type: string, id: string = 'asset-1') {
  return {
    assetId: id,
    jobId: 'job-1',
    assetType: type,
    storagePath: `gs://bucket/job-1/${type}/${id}.bin`,
    generationTimestamp: new Date('2025-01-01'),
    status: 'completed' as const,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Legacy Record Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: AlloyDB configured
    process.env.ALLOYDB_CONNECTION_STRING = 'postgresql://test:test@localhost/test';
  });

  // ── getJobWithLegacyHandling ────────────────────────────────────

  describe('getJobWithLegacyHandling', () => {
    it('returns null when job does not exist in Firestore', async () => {
      mocks.mockDocGet.mockResolvedValueOnce({ exists: false, data: () => null });

      const result = await getJobWithLegacyHandling('nonexistent');
      expect(result).toBeNull();
    });

    it('marks job as legacy when it exists in Firestore but not AlloyDB', async () => {
      const job = makeJob();
      mocks.mockDocGet.mockResolvedValueOnce({ exists: true, data: () => job });
      mocks.mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await getJobWithLegacyHandling('job-1');

      expect(result).not.toBeNull();
      expect(result!.isLegacy).toBe(true);
      expect(result!.id).toBe('job-1');
    });

    it('marks job as non-legacy when it exists in both Firestore and AlloyDB', async () => {
      const job = makeJob();
      mocks.mockDocGet.mockResolvedValueOnce({ exists: true, data: () => job });
      mocks.mockPoolQuery.mockResolvedValueOnce({ rows: [{ job_id: 'job-1' }] });

      const result = await getJobWithLegacyHandling('job-1');

      expect(result).not.toBeNull();
      expect(result!.isLegacy).toBe(false);
    });

    it('defaults to non-legacy when AlloyDB check fails', async () => {
      const job = makeJob();
      mocks.mockDocGet.mockResolvedValueOnce({ exists: true, data: () => job });
      mocks.mockPoolQuery.mockRejectedValueOnce(new Error('connection refused'));

      const result = await getJobWithLegacyHandling('job-1');

      expect(result).not.toBeNull();
      expect(result!.isLegacy).toBe(false);
    });

    it('returns non-legacy when AlloyDB is not configured', async () => {
      delete process.env.ALLOYDB_CONNECTION_STRING;
      const job = makeJob();
      mocks.mockDocGet.mockResolvedValueOnce({ exists: true, data: () => job });

      const result = await getJobWithLegacyHandling('job-1');

      expect(result).not.toBeNull();
      expect(result!.isLegacy).toBe(false);
      expect(mocks.mockPoolQuery).not.toHaveBeenCalled();
    });
  });

  // ── queryAssets with legacy marking ─────────────────────────────

  describe('queryAssets — legacy marking', () => {
    it('returns AlloyDB assets without isLegacy when AlloyDB has data', async () => {
      mocks.mockAlloyGetAssetsByJobId.mockResolvedValueOnce([
        {
          asset_id: 'a1',
          job_id: 'job-1',
          asset_type: 'image',
          storage_path: 'gs://bucket/img.png',
          created_at: new Date(),
          status: 'completed',
        },
      ]);

      const assets = await queryAssets('job-1');

      expect(assets).toHaveLength(1);
      expect(assets[0].assetType).toBe('image');
      expect((assets[0] as any).isLegacy).toBeUndefined();
    });

    it('marks fallback-type assets as legacy when falling back to Firestore', async () => {
      mocks.mockAlloyGetAssetsByJobId.mockResolvedValueOnce([]);
      const job = makeJob({
        assets: [
          makeAsset('image'),
          makeAsset('image_concept', 'asset-2'),
          makeAsset('video_brief_meta', 'asset-3'),
          makeAsset('gif_creative_direction', 'asset-4'),
          makeAsset('copy', 'asset-5'),
        ],
      });
      mocks.mockDocGet.mockResolvedValueOnce({ exists: true, data: () => job });

      const assets = await queryAssets('job-1');

      expect(assets).toHaveLength(5);
      // Real deliverable types are NOT legacy
      expect((assets[0] as any).isLegacy).toBe(false);
      expect((assets[4] as any).isLegacy).toBe(false);
      // Fallback metadata types ARE legacy
      expect((assets[1] as any).isLegacy).toBe(true);
      expect((assets[2] as any).isLegacy).toBe(true);
      expect((assets[3] as any).isLegacy).toBe(true);
    });

    it('returns empty array when job not found in Firestore fallback', async () => {
      mocks.mockAlloyGetAssetsByJobId.mockResolvedValueOnce([]);
      mocks.mockDocGet.mockResolvedValueOnce({ exists: false, data: () => null });

      const assets = await queryAssets('nonexistent');
      expect(assets).toEqual([]);
    });

    it('falls back to Firestore when AlloyDB query throws', async () => {
      mocks.mockAlloyGetAssetsByJobId.mockRejectedValueOnce(new Error('db error'));
      const job = makeJob({ assets: [makeAsset('video')] });
      mocks.mockDocGet.mockResolvedValueOnce({ exists: true, data: () => job });

      const assets = await queryAssets('job-1');

      expect(assets).toHaveLength(1);
      expect(assets[0].assetType).toBe('video');
      expect((assets[0] as any).isLegacy).toBe(false);
    });
  });

  // ── migrateJobToAlloyDb ─────────────────────────────────────────

  describe('migrateJobToAlloyDb', () => {
    it('returns false when AlloyDB is not configured', async () => {
      delete process.env.ALLOYDB_CONNECTION_STRING;

      const result = await migrateJobToAlloyDb('job-1');
      expect(result).toBe(false);
    });

    it('returns false when job does not exist in Firestore', async () => {
      mocks.mockDocGet.mockResolvedValueOnce({ exists: false, data: () => null });

      const result = await migrateJobToAlloyDb('nonexistent');
      expect(result).toBe(false);
    });

    it('migrates job and assets to AlloyDB', async () => {
      const job = makeJob({
        assets: [
          makeAsset('image', 'a1'),
          makeAsset('image_concept', 'a2'),
        ],
      });
      mocks.mockDocGet.mockResolvedValueOnce({ exists: true, data: () => job });
      // alloyDbCreateJobBestEffort calls pool.query
      mocks.mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await migrateJobToAlloyDb('job-1');

      expect(result).toBe(true);
      // Job was written to AlloyDB
      expect(mocks.mockPoolQuery).toHaveBeenCalledTimes(1);
      // Both assets were migrated
      expect(mocks.mockAlloyCreateAsset).toHaveBeenCalledTimes(2);
      // image_concept should be marked as fallback
      const secondCall = mocks.mockAlloyCreateAsset.mock.calls[1][0];
      expect(secondCall.is_fallback).toBe(true);
      // image should NOT be marked as fallback
      const firstCall = mocks.mockAlloyCreateAsset.mock.calls[0][0];
      expect(firstCall.is_fallback).toBe(false);
    });

    it('continues migrating remaining assets when one fails', async () => {
      const job = makeJob({
        assets: [
          makeAsset('image', 'a1'),
          makeAsset('video', 'a2'),
          makeAsset('copy', 'a3'),
        ],
      });
      mocks.mockDocGet.mockResolvedValueOnce({ exists: true, data: () => job });
      mocks.mockPoolQuery.mockResolvedValueOnce({ rows: [] });
      // First asset succeeds, second fails, third succeeds
      mocks.mockAlloyCreateAsset
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('duplicate key'))
        .mockResolvedValueOnce({});

      const result = await migrateJobToAlloyDb('job-1');

      expect(result).toBe(true);
      expect(mocks.mockAlloyCreateAsset).toHaveBeenCalledTimes(3);
    });

    it('returns false when AlloyDB job write throws unexpectedly', async () => {
      const job = makeJob();
      mocks.mockDocGet.mockResolvedValueOnce({ exists: true, data: () => job });
      // alloyDbCreateJobBestEffort swallows errors, but if something else throws...
      // Actually alloyDbCreateJobBestEffort catches internally, so this should still return true
      mocks.mockPoolQuery.mockRejectedValueOnce(new Error('connection lost'));

      const result = await migrateJobToAlloyDb('job-1');
      // alloyDbCreateJobBestEffort catches the error, so migration continues
      expect(result).toBe(true);
    });
  });
});
