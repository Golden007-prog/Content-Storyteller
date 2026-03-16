/**
 * Shared Google Cloud Platform configuration for the Worker service.
 *
 * Single source of truth for all GCP settings. Every Google Cloud client
 * in this service MUST use values from this module.
 *
 * Resolution order for project ID:
 *   1. GCP_PROJECT_ID env var (canonical)
 *   2. GOOGLE_CLOUD_PROJECT env var (fallback for Cloud Run)
 *   3. GCLOUD_PROJECT env var (legacy fallback)
 */

export interface GcpConfig {
  projectId: string;
  location: string;
  firestoreDatabase: string;
  uploadsBucket: string;
  assetsBucket: string;
  tempBucket: string;
  pubsubSubscription: string;
  geminiApiKey: string;
  isCloud: boolean;
  authMode: 'adc-service-account' | 'adc-user' | 'api-key-fallback';
  /** AlloyDB connection string — optional, empty if AlloyDB not configured */
  alloydbConnectionString: string;
}

function resolveProjectId(): string {
  return (
    process.env.GCP_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    ''
  );
}

function resolveIsCloud(): boolean {
  return !!(process.env.K_SERVICE || process.env.KUBERNETES_SERVICE_HOST);
}

function resolveAuthMode(geminiApiKey: string, isCloud: boolean): GcpConfig['authMode'] {
  if (isCloud) return 'adc-service-account';
  if (geminiApiKey) return 'api-key-fallback';
  return 'adc-user';
}

let _config: GcpConfig | null = null;

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
  const tempBucket = process.env.TEMP_BUCKET || '';
  const pubsubSubscription = process.env.PUBSUB_SUBSCRIPTION || '';
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
    tempBucket,
    pubsubSubscription,
    geminiApiKey,
    isCloud,
    authMode,
    alloydbConnectionString,
  };

  return _config;
}

export function logGcpConfig(logFn: (msg: string, meta?: Record<string, unknown>) => void): void {
  const cfg = getGcpConfig();
  logFn('GCP configuration resolved', {
    projectId: cfg.projectId,
    location: cfg.location,
    firestoreDatabase: cfg.firestoreDatabase,
    uploadsBucket: cfg.uploadsBucket || '(not set)',
    assetsBucket: cfg.assetsBucket || '(not set)',
    tempBucket: cfg.tempBucket || '(not set)',
    pubsubSubscription: cfg.pubsubSubscription || '(not set)',
    authMode: cfg.authMode,
    isCloud: cfg.isCloud,
    alloydbConnectionString: cfg.alloydbConnectionString ? '(set)' : '(not set)',
  });
}

export function _resetConfigForTesting(): void {
  _config = null;
}
