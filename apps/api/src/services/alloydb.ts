/**
 * AlloyDB service for structured relational data.
 *
 * Part of the three-tier storage architecture:
 *   - AlloyDB: durable structured business data and relationships
 *   - Firestore: real-time app state and lightweight documents
 *   - Cloud Storage: actual file payloads
 *
 * Uses the `pg` library for connection pooling against AlloyDB
 * (PostgreSQL-compatible). Connection string is read from the
 * ALLOYDB_CONNECTION_STRING env var.
 */

import { Pool, QueryResult } from 'pg';

// ---------------------------------------------------------------------------
// TypeScript interfaces matching alloydb-schema.sql
// ---------------------------------------------------------------------------

export interface Asset {
  asset_id: string;
  project_id: string | null;
  job_id: string;
  asset_type: string;
  mime_type: string | null;
  storage_path: string;
  signed_url: string | null;
  public_url: string | null;
  preview_url: string | null;
  status: string;
  source_model: string | null;
  generation_prompt: string | null;
  derived_from_asset_id: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  checksum: string | null;
  is_fallback: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AssetVersion {
  version_id: string;
  asset_id: string;
  version_number: number;
  storage_path: string;
  file_size_bytes: number | null;
  checksum: string | null;
  created_at: Date;
}

export interface GenerationEvent {
  event_id: string;
  job_id: string | null;
  stage: string;
  event_type: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

// Input types for create operations (omit auto-generated fields)

export interface CreateAssetInput {
  project_id?: string | null;
  job_id: string;
  asset_type: string;
  mime_type?: string | null;
  storage_path: string;
  signed_url?: string | null;
  public_url?: string | null;
  preview_url?: string | null;
  status?: string;
  source_model?: string | null;
  generation_prompt?: string | null;
  derived_from_asset_id?: string | null;
  width?: number | null;
  height?: number | null;
  duration_seconds?: number | null;
  file_size_bytes?: number | null;
  checksum?: string | null;
  is_fallback?: boolean;
}

export interface CreateGenerationEventInput {
  job_id?: string | null;
  stage: string;
  event_type: string;
  metadata?: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Connection pool (lazy singleton)
// ---------------------------------------------------------------------------

let _pool: Pool | null = null;

function getConnectionString(): string {
  // Try gcp config import if available (task 11.3 will add it),
  // otherwise fall back to env var directly.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getGcpConfig } = require('../config/gcp');
    const cfg = getGcpConfig();
    if ((cfg as Record<string, unknown>).alloydbConnectionString) {
      return (cfg as Record<string, unknown>).alloydbConnectionString as string;
    }
  } catch {
    // gcp config may not have alloydbConnectionString yet — that's fine
  }
  return process.env.ALLOYDB_CONNECTION_STRING || '';
}

/**
 * Returns a lazily-created pg Pool connected to AlloyDB.
 * Re-uses the same pool across calls.
 */
export function getPool(): Pool {
  if (_pool) return _pool;

  const connectionString = getConnectionString();
  if (!connectionString) {
    throw new Error(
      '[AlloyDB] Connection string not configured. ' +
      'Set ALLOYDB_CONNECTION_STRING in your environment.',
    );
  }

  _pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  // Surface connection errors instead of crashing silently
  _pool.on('error', (err) => {
    console.error('[AlloyDB] Unexpected pool error:', err.message);
  });

  return _pool;
}

/**
 * Gracefully shut down the pool (call on process exit).
 */
export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

/** Reset pool — for testing only. */
export function _resetPoolForTesting(): void {
  _pool = null;
}

// ---------------------------------------------------------------------------
// CRUD operations — Assets
// ---------------------------------------------------------------------------

/**
 * Create a new asset record. Returns the inserted row.
 */
export async function createAsset(input: CreateAssetInput): Promise<Asset> {
  const pool = getPool();
  const result: QueryResult<Asset> = await pool.query(
    `INSERT INTO assets (
      project_id, job_id, asset_type, mime_type, storage_path,
      signed_url, public_url, preview_url, status, source_model,
      generation_prompt, derived_from_asset_id, width, height,
      duration_seconds, file_size_bytes, checksum, is_fallback
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13, $14,
      $15, $16, $17, $18
    ) RETURNING *`,
    [
      input.project_id ?? null,
      input.job_id,
      input.asset_type,
      input.mime_type ?? null,
      input.storage_path,
      input.signed_url ?? null,
      input.public_url ?? null,
      input.preview_url ?? null,
      input.status ?? 'pending',
      input.source_model ?? null,
      input.generation_prompt ?? null,
      input.derived_from_asset_id ?? null,
      input.width ?? null,
      input.height ?? null,
      input.duration_seconds ?? null,
      input.file_size_bytes ?? null,
      input.checksum ?? null,
      input.is_fallback ?? false,
    ],
  );
  return result.rows[0];
}

/**
 * Retrieve all assets for a given job, ordered by creation time.
 */
export async function getAssetsByJobId(jobId: string): Promise<Asset[]> {
  const pool = getPool();
  const result: QueryResult<Asset> = await pool.query(
    'SELECT * FROM assets WHERE job_id = $1 ORDER BY created_at ASC',
    [jobId],
  );
  return result.rows;
}

/**
 * Update the status (and updated_at) of an asset.
 */
export async function updateAssetStatus(
  assetId: string,
  status: string,
): Promise<Asset | null> {
  const pool = getPool();
  const result: QueryResult<Asset> = await pool.query(
    `UPDATE assets SET status = $1, updated_at = NOW()
     WHERE asset_id = $2 RETURNING *`,
    [status, assetId],
  );
  return result.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// CRUD operations — Generation Events
// ---------------------------------------------------------------------------

/**
 * Create a generation event (audit trail entry).
 */
export async function createGenerationEvent(
  input: CreateGenerationEventInput,
): Promise<GenerationEvent> {
  const pool = getPool();
  const result: QueryResult<GenerationEvent> = await pool.query(
    `INSERT INTO generation_events (job_id, stage, event_type, metadata)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      input.job_id ?? null,
      input.stage,
      input.event_type,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  );
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Retrieve assets for a job filtered by asset_type.
 */
export async function getAssetsByType(
  jobId: string,
  assetType: string,
): Promise<Asset[]> {
  const pool = getPool();
  const result: QueryResult<Asset> = await pool.query(
    `SELECT * FROM assets
     WHERE job_id = $1 AND asset_type = $2
     ORDER BY created_at ASC`,
    [jobId, assetType],
  );
  return result.rows;
}

/**
 * Retrieve an asset together with its version history.
 */
export async function getAssetWithVersions(
  assetId: string,
): Promise<{ asset: Asset; versions: AssetVersion[] } | null> {
  const pool = getPool();

  const assetResult: QueryResult<Asset> = await pool.query(
    'SELECT * FROM assets WHERE asset_id = $1',
    [assetId],
  );
  if (assetResult.rows.length === 0) return null;

  const versionsResult: QueryResult<AssetVersion> = await pool.query(
    `SELECT * FROM asset_versions
     WHERE asset_id = $1
     ORDER BY version_number ASC`,
    [assetId],
  );

  return {
    asset: assetResult.rows[0],
    versions: versionsResult.rows,
  };
}
