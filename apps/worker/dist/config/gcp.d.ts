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
}
export declare function getGcpConfig(): GcpConfig;
export declare function logGcpConfig(logFn: (msg: string, meta?: Record<string, unknown>) => void): void;
export declare function _resetConfigForTesting(): void;
//# sourceMappingURL=gcp.d.ts.map