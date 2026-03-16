/**
 * Shared Google Cloud Platform configuration for the API service.
 *
 * Single source of truth for all GCP settings. Every Google Cloud client
 * in this service MUST use values from this module — never read env vars
 * directly for GCP configuration.
 *
 * Resolution order for project ID:
 *   1. GCP_PROJECT_ID env var (canonical)
 *   2. GOOGLE_CLOUD_PROJECT env var (fallback for Cloud Run)
 *   3. GCLOUD_PROJECT env var (legacy fallback)
 *
 * Auth strategy:
 *   - Production (Cloud Run): ADC via service account (automatic)
 *   - Local development: ADC via `gcloud auth application-default login`
 *   - Optional: GEMINI_API_KEY for AI Studio fallback (local dev only)
 */

export interface GcpConfig {
  /** Google Cloud project ID — required, no default */
  projectId: string;
  /** Google Cloud region / Vertex AI location */
  location: string;
  /** Firestore database ID */
  firestoreDatabase: string;
  /** GCS bucket for user uploads */
  uploadsBucket: string;
  /** GCS bucket for generated assets */
  assetsBucket: string;
  /** Pub/Sub topic for generation tasks */
  pubsubTopic: string;
  /** Optional Gemini API key — local dev fallback only */
  geminiApiKey: string;
  /** Whether we're running in a cloud environment (Cloud Run, GKE, etc.) */
  isCloud: boolean;
  /** Auth mode description for diagnostics */
  authMode: 'adc-service-account' | 'adc-user' | 'api-key-fallback';
  /** AlloyDB connection string — optional, empty if AlloyDB not configured */
  alloydbConnectionString: string;
}

function resolveProjectId(): string {
  const projectId =
    process.env.GCP_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    '';
  return projectId;
}

function resolveIsCloud(): boolean {
  // Cloud Run sets K_SERVICE; GKE sets KUBERNETES_SERVICE_HOST
  return !!(process.env.K_SERVICE || process.env.KUBERNETES_SERVICE_HOST);
}

function resolveAuthMode(geminiApiKey: string, isCloud: boolean): GcpConfig['authMode'] {
  if (isCloud) return 'adc-service-account';
  if (geminiApiKey) return 'api-key-fallback';
  return 'adc-user';
}

let _config: GcpConfig | null = null;

/**
 * Returns the resolved GCP configuration.
 * Throws on first call if required values are missing.
 */
export function getGcpConfig(): GcpConfig {
  if (_config) return _config;

  const projectId = resolveProjectId();
  if (!projectId) {
    throw new Error(
      '[GCP Config] GCP_PROJECT_ID is required but not set. ' +
      'Set GCP_PROJECT_ID in your .env file or environment.',
    );
  }

  const location = process.env.GCP_REGION || 'us-central1';
  const firestoreDatabase = process.env.FIRESTORE_DATABASE || '(default)';
  const uploadsBucket = process.env.UPLOADS_BUCKET || '';
  const assetsBucket = process.env.ASSETS_BUCKET || '';
  const pubsubTopic = process.env.PUBSUB_TOPIC || '';
  const geminiApiKey = process.env.GEMINI_API_KEY || '';
  const isCloud = resolveIsCloud();
  const authMode = resolveAuthMode(geminiApiKey, isCloud);
  const alloydbConnectionString = process.env.ALLOYDB_CONNECTION_STRING || '';

  _config = {
    projectId,
    location,
    firestoreDatabase,
    uploadsBucket,
    assetsBucket,
    pubsubTopic,
    geminiApiKey,
    isCloud,
    authMode,
    alloydbConnectionString,
  };

  return _config;
}

/**
 * Log resolved GCP config at startup (safe — no secrets).
 */
export function logGcpConfig(logFn: (msg: string, meta?: Record<string, unknown>) => void): void {
  const cfg = getGcpConfig();
  logFn('GCP configuration resolved', {
    projectId: cfg.projectId,
    location: cfg.location,
    firestoreDatabase: cfg.firestoreDatabase,
    uploadsBucket: cfg.uploadsBucket || '(not set)',
    assetsBucket: cfg.assetsBucket || '(not set)',
    pubsubTopic: cfg.pubsubTopic || '(not set)',
    authMode: cfg.authMode,
    isCloud: cfg.isCloud,
    alloydbConnectionString: cfg.alloydbConnectionString ? '(set)' : '(not set)',
  });
}

/** Reset config (for testing only). */
export function _resetConfigForTesting(): void {
  _config = null;
}
