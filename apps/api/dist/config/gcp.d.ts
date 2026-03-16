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
}
/**
 * Returns the resolved GCP configuration.
 * Throws on first call if required values are missing.
 */
export declare function getGcpConfig(): GcpConfig;
/**
 * Log resolved GCP config at startup (safe — no secrets).
 */
export declare function logGcpConfig(logFn: (msg: string, meta?: Record<string, unknown>) => void): void;
/** Reset config (for testing only). */
export declare function _resetConfigForTesting(): void;
//# sourceMappingURL=gcp.d.ts.map