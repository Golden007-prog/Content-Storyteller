/**
 * Minimal AlloyDB service for the Worker.
 *
 * Handles dual-write of asset records to AlloyDB alongside Firestore.
 * AlloyDB writes are best-effort — failures are logged but never
 * block the primary Firestore write path.
 *
 * Uses the `pg` library for connection pooling against AlloyDB
 * (PostgreSQL-compatible). Connection string is read from the
 * worker's GCP config (ALLOYDB_CONNECTION_STRING env var).
 */

import { Pool, QueryResult } from 'pg';
import { getGcpConfig } from '../config/gcp';

// ---------------------------------------------------------------------------
// Types matching the AlloyDB assets table schema
// ---------------------------------------------------------------------------

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

export interface AssetRow {
  asset_id: string;
  project_id: string | null;
  job_id: string;
  asset_type: string;
  storage_path: string;
  status: string;
  is_fallback: boolean;
  created_at: Date;
  updated_at: Date;
}

// ---------------------------------------------------------------------------
// Connection pool (lazy singleton)
// ---------------------------------------------------------------------------

let _pool: Pool | null = null;

/**
 * Returns true if AlloyDB is configured (connection string is set).
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
 * Returns a lazily-created pg Pool connected to AlloyDB.
 * Throws if connection string is not configured.
 */
export function getPool(): Pool {
  if (_pool) return _pool;

  const cfg = getGcpConfig();
  const connectionString = cfg.alloydbConnectionString;
  if (!connectionString) {
    throw new Error(
      '[Worker AlloyDB] Connection string not configured. ' +
      'Set ALLOYDB_CONNECTION_STRING in your environment.',
    );
  }

  _pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  _pool.on('error', (err) => {
    console.error('[Worker AlloyDB] Unexpected pool error:', err.message);
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
// Asset CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new asset record in AlloyDB. Returns the inserted row.
 */
export async function createAssetRecord(input: CreateAssetInput): Promise<AssetRow> {
  const pool = getPool();
  const result: QueryResult<AssetRow> = await pool.query(
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
