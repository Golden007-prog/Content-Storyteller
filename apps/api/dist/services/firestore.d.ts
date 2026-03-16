import { Job, AssetReference, Platform, Tone, TrendAnalysisResult, OutputPreference, StepsMap, JobWarning } from '@content-storyteller/shared';
import type { OutputIntent } from '@content-storyteller/shared';
/**
 * Create a new Job document in Firestore with state `queued`.
 */
export declare function createJob(params: {
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
}): Promise<Job>;
/**
 * Read a Job document by ID. Returns null if not found.
 */
export declare function getJob(jobId: string): Promise<Job | null>;
/**
 * Update fields on an existing Job document.
 */
export declare function updateJob(jobId: string, updates: Partial<Pick<Job, 'state' | 'assets' | 'errorMessage' | 'creativeBrief' | 'fallbackNotices'>>): Promise<void>;
/**
 * Query asset references for a given job from the Job document.
 */
export declare function queryAssets(jobId: string): Promise<AssetReference[]>;
/**
 * Create a new TrendQuery document in Firestore.
 */
export declare function createTrendQuery(result: TrendAnalysisResult): Promise<string>;
/**
 * Read a TrendQuery document by ID. Returns null if not found.
 */
export declare function getTrendQuery(queryId: string): Promise<TrendAnalysisResult | null>;
//# sourceMappingURL=firestore.d.ts.map