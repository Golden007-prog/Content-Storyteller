import { Firestore } from '@google-cloud/firestore';
import { Job, JobState, AssetReference, Platform, Tone, TrendAnalysisResult, OutputPreference, StepsMap, JobWarning } from '@content-storyteller/shared';
import type { OutputIntent } from '@content-storyteller/shared';
import { getGcpConfig } from '../config/gcp';
import { createAsset as alloyCreateAsset, getAssetsByJobId as alloyGetAssetsByJobId, getPool } from './alloydb';
import type { CreateAssetInput } from './alloydb';

function getDb(): Firestore {
  const cfg = getGcpConfig();
  return new Firestore({ projectId: cfg.projectId, databaseId: cfg.firestoreDatabase });
}

function jobs() {
  return getDb().collection('jobs');
}

function trendQueries() {
  return getDb().collection('trendQueries');
}

/**
 * Check whether AlloyDB is configured (connection string is set).
 * When not configured, AlloyDB writes are silently skipped.
 */
export function isAlloyDbConfigured(): boolean {
  try {
    const cfg = getGcpConfig();
    return !!cfg.alloydbConnectionString;
  } catch {
    return false;
  }
}

/**
 * Best-effort write to AlloyDB jobs table.
 * Logs errors but never throws — Firestore is the primary store.
 */
async function alloyDbCreateJobBestEffort(job: Job): Promise<void> {
  if (!isAlloyDbConfigured()) return;
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO jobs (job_id, correlation_id, idempotency_key, state, platform, tone, output_preference, prompt_text, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        job.id,
        job.correlationId,
        job.idempotencyKey,
        job.state,
        job.platform ?? null,
        job.tone ?? null,
        job.outputPreference ?? 'auto',
        job.promptText ?? null,
        job.createdAt,
        job.updatedAt,
      ],
    );
  } catch (err) {
    console.error('[Firestore/DualWrite] AlloyDB createJob failed (best-effort):', (err as Error).message);
  }
}


/**
 * Best-effort update to AlloyDB jobs table.
 * Logs errors but never throws — Firestore is the primary store.
 */
async function alloyDbUpdateJobBestEffort(
  jobId: string,
  updates: Partial<Pick<Job, 'state' | 'errorMessage'>>,
): Promise<void> {
  if (!isAlloyDbConfigured()) return;
  try {
    const pool = getPool();
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (updates.state !== undefined) {
      setClauses.push('state = $' + paramIdx++);
      values.push(updates.state);
    }
    if (updates.errorMessage !== undefined) {
      setClauses.push('error_message = $' + paramIdx++);
      values.push(updates.errorMessage);
    }

    if (setClauses.length === 1) return; // only updated_at, nothing meaningful

    values.push(jobId);
    const sql = 'UPDATE jobs SET ' + setClauses.join(', ') + ' WHERE job_id = $' + paramIdx;
    await pool.query(sql, values);
  } catch (err) {
    console.error('[Firestore/DualWrite] AlloyDB updateJob failed (best-effort):', (err as Error).message);
  }
}


/**
 * Create a new Job document in Firestore with state `queued`.
 * Dual-writes to AlloyDB (best-effort) when configured.
 */
export async function createJob(params: {
  correlationId: string;
  idempotencyKey: string;
  uploadedMediaPaths: string[];
  promptText?: string;
  platform?: Platform;
  tone?: Tone;
  outputPreference?: OutputPreference;
  outputIntent?: OutputIntent;
  requestedOutputs?: string[];
  steps?: StepsMap;
  warnings?: JobWarning[];
  completedOutputs?: string[];
  skippedOutputs?: string[];
}): Promise<Job> {
  const docRef = jobs().doc();
  const now = new Date();
  const job: Job = {
    id: docRef.id,
    correlationId: params.correlationId,
    idempotencyKey: params.idempotencyKey,
    state: JobState.Queued,
    uploadedMediaPaths: params.uploadedMediaPaths,
    assets: [],
    fallbackNotices: [],
    createdAt: now,
    updatedAt: now,
    ...(params.promptText !== undefined && { promptText: params.promptText }),
    ...(params.platform !== undefined && { platform: params.platform }),
    ...(params.tone !== undefined && { tone: params.tone }),
    ...(params.outputPreference !== undefined && { outputPreference: params.outputPreference }),
    ...(params.outputIntent !== undefined && { outputIntent: params.outputIntent }),
    ...(params.requestedOutputs !== undefined && { requestedOutputs: params.requestedOutputs }),
    ...(params.steps !== undefined && { steps: params.steps }),
    ...(params.warnings !== undefined && { warnings: params.warnings }),
    ...(params.completedOutputs !== undefined && { completedOutputs: params.completedOutputs }),
    ...(params.skippedOutputs !== undefined && { skippedOutputs: params.skippedOutputs }),
  };
  await docRef.set(job);

  // Dual-write to AlloyDB (best-effort)
  await alloyDbCreateJobBestEffort(job);

  return job;
}

/**
 * Read a Job document by ID. Returns null if not found.
 */
export async function getJob(jobId: string): Promise<Job | null> {
  const doc = await jobs().doc(jobId).get();
  if (!doc.exists) return null;
  return doc.data() as Job;
}

/**
 * Read a Job from Firestore with legacy detection.
 *
 * When AlloyDB is configured, checks whether the job also exists in AlloyDB.
 * If the job exists in Firestore but NOT in AlloyDB, it is a legacy record
 * created before the dual-write migration. The returned object includes an
 * `isLegacy` flag so callers can handle it appropriately (e.g. show a
 * migration banner, trigger backfill).
 *
 * Firestore is always the primary read source for real-time data.
 * The AlloyDB check is best-effort — failures fall back to non-legacy.
 */
export async function getJobWithLegacyHandling(
  jobId: string,
): Promise<(Job & { isLegacy: boolean }) | null> {
  const job = await getJob(jobId);
  if (!job) return null;

  let isLegacy = false;

  if (isAlloyDbConfigured()) {
    try {
      const pool = getPool();
      const result = await pool.query(
        'SELECT job_id FROM jobs WHERE job_id = $1 LIMIT 1',
        [jobId],
      );
      // Job exists in Firestore but not in AlloyDB → legacy record
      if (result.rows.length === 0) {
        isLegacy = true;
      }
    } catch (err) {
      // AlloyDB check failed — assume non-legacy to avoid false positives
      console.error(
        '[Firestore/DualWrite] AlloyDB legacy check failed (best-effort):',
        (err as Error).message,
      );
    }
  }

  return { ...job, isLegacy };
}

/**
 * Update fields on an existing Job document.
 * Dual-writes state/errorMessage to AlloyDB (best-effort) when configured.
 */
export async function updateJob(
  jobId: string,
  updates: Partial<Pick<Job, 'state' | 'assets' | 'errorMessage' | 'creativeBrief' | 'fallbackNotices'>>,
): Promise<void> {
  await jobs().doc(jobId).update({
    ...updates,
    updatedAt: new Date(),
  });

  // Dual-write relational fields to AlloyDB (best-effort)
  await alloyDbUpdateJobBestEffort(jobId, {
    state: updates.state,
    errorMessage: updates.errorMessage,
  });
}

/** Fallback asset types that represent metadata-only records (no real media file). */
const FALLBACK_ASSET_TYPES: ReadonlySet<string> = new Set([
  'image_concept',
  'video_brief_meta',
  'gif_creative_direction',
]);

/**
 * Query asset references for a given job.
 * Tries AlloyDB first for relational queries when configured,
 * falls back to Firestore for real-time UI state / legacy data.
 *
 * When falling back to Firestore (legacy path), assets whose type is a
 * metadata-only fallback type are marked as legacy via the `isLegacy` flag.
 * This lets callers distinguish real deliverable assets from pre-migration
 * metadata records.
 */
export async function queryAssets(
  jobId: string,
): Promise<(AssetReference & { isLegacy?: boolean })[]> {
  if (isAlloyDbConfigured()) {
    try {
      const alloyAssets = await alloyGetAssetsByJobId(jobId);
      if (alloyAssets.length > 0) {
        // Map AlloyDB rows to AssetReference shape — these are current records
        return alloyAssets.map((a) => ({
          assetId: a.asset_id,
          jobId: a.job_id,
          assetType: a.asset_type as AssetReference['assetType'],
          storagePath: a.storage_path,
          generationTimestamp: a.created_at,
          status: a.status as AssetReference['status'],
        }));
      }
      // No AlloyDB records — fall through to Firestore (legacy data)
    } catch (err) {
      console.error('[Firestore/DualWrite] AlloyDB queryAssets failed, falling back to Firestore:', (err as Error).message);
    }
  }

  // Firestore fallback (real-time / legacy)
  const job = await getJob(jobId);
  if (!job) return [];

  // Mark metadata-only fallback assets as legacy when they come from
  // Firestore without AlloyDB counterparts — these are pre-migration records
  // that contain only descriptive JSON, not real binary media files.
  return job.assets.map((asset) => ({
    ...asset,
    isLegacy: FALLBACK_ASSET_TYPES.has(asset.assetType),
  }));
}

/**
 * Record an asset with dual-write: appends to Firestore job.assets array
 * for real-time SSE updates AND creates an AlloyDB asset record for
 * relational queries.
 *
 * Firestore write is primary; AlloyDB write is best-effort.
 */
export async function recordAssetWithDualWrite(
  jobId: string,
  asset: AssetReference,
): Promise<void> {
  // 1. Firestore: append to job.assets array (real-time)
  const doc = await jobs().doc(jobId).get();
  if (!doc.exists) throw new Error(`Job ${jobId} not found`);
  const job = doc.data() as Job;
  const assets = [...job.assets, asset];
  await jobs().doc(jobId).update({ assets, updatedAt: new Date() });

  // 2. AlloyDB: create asset record (best-effort)
  if (isAlloyDbConfigured()) {
    try {
      const input: CreateAssetInput = {
        job_id: asset.jobId,
        asset_type: asset.assetType,
        storage_path: asset.storagePath,
        status: asset.status ?? 'completed',
        is_fallback: false,
      };
      await alloyCreateAsset(input);
    } catch (err) {
      console.error('[Firestore/DualWrite] AlloyDB createAsset failed (best-effort):', (err as Error).message);
    }
  }
}

/**
 * Migrate a Firestore-only job into AlloyDB for backfill purposes.
 *
 * Reads the job and its assets from Firestore, then writes them to AlloyDB.
 * Uses ON CONFLICT DO NOTHING so it's safe to call multiple times (idempotent).
 *
 * Returns `true` if the job was migrated (or already existed), `false` if the
 * job was not found in Firestore.
 */
export async function migrateJobToAlloyDb(jobId: string): Promise<boolean> {
  if (!isAlloyDbConfigured()) return false;

  const job = await getJob(jobId);
  if (!job) return false;

  try {
    // 1. Upsert the job record into AlloyDB
    await alloyDbCreateJobBestEffort(job);

    // 2. Migrate each asset reference into AlloyDB
    for (const asset of job.assets) {
      try {
        const input: CreateAssetInput = {
          job_id: asset.jobId,
          asset_type: asset.assetType,
          storage_path: asset.storagePath,
          status: asset.status ?? 'completed',
          is_fallback: FALLBACK_ASSET_TYPES.has(asset.assetType),
        };
        await alloyCreateAsset(input);
      } catch (err) {
        // Individual asset migration failure — log and continue with remaining assets
        console.error(
          `[Firestore/Migration] AlloyDB asset migration failed for asset ${asset.assetId} (best-effort):`,
          (err as Error).message,
        );
      }
    }

    return true;
  } catch (err) {
    console.error(
      `[Firestore/Migration] AlloyDB job migration failed for ${jobId}:`,
      (err as Error).message,
    );
    return false;
  }
}

/**
 * Create a new TrendQuery document in Firestore.
 */
export async function createTrendQuery(result: TrendAnalysisResult): Promise<string> {
  const docRef = trendQueries().doc();
  // Strip undefined values — Firestore rejects them
  const data = JSON.parse(JSON.stringify({ ...result, createdAt: new Date().toISOString() }));
  await docRef.set(data);
  return docRef.id;
}

/**
 * Read a TrendQuery document by ID. Returns null if not found.
 */
export async function getTrendQuery(queryId: string): Promise<TrendAnalysisResult | null> {
  const doc = await trendQueries().doc(queryId).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  const { createdAt, ...rest } = data;
  return rest as TrendAnalysisResult;
}