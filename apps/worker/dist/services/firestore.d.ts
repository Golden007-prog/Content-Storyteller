import { Job, JobState, AssetReference, FallbackNotice, StepsMap, StepMetadata, JobWarning } from '@content-storyteller/shared';
/**
 * Read a Job document by ID. Returns null if not found.
 */
export declare function getJob(jobId: string): Promise<Job | null>;
/**
 * Update the state and optional fields on a Job document.
 */
export declare function updateJobState(jobId: string, state: JobState, extra?: Partial<Pick<Job, 'errorMessage' | 'creativeBrief'>>): Promise<void>;
/**
 * Append an asset reference to the Job's assets array.
 */
export declare function recordAssetReference(jobId: string, asset: AssetReference): Promise<void>;
/**
 * Append a fallback notice to the Job's fallbackNotices array.
 */
export declare function recordFallbackNotice(jobId: string, notice: FallbackNotice): Promise<void>;
/**
 * Write the initial steps metadata map to the job document.
 */
export declare function initializeStepsMetadata(jobId: string, steps: StepsMap): Promise<void>;
/**
 * Update an individual step's metadata using Firestore dot notation.
 */
export declare function updateStepMetadata(jobId: string, stepKey: keyof StepsMap, metadata: Partial<StepMetadata>): Promise<void>;
/**
 * Update the job document with warnings, completedOutputs, skippedOutputs, state, and errorMessage.
 */
export declare function updateJobWithWarnings(jobId: string, updates: {
    state?: JobState;
    warnings?: JobWarning[];
    completedOutputs?: string[];
    skippedOutputs?: string[];
    errorMessage?: string;
}): Promise<void>;
//# sourceMappingURL=firestore.d.ts.map