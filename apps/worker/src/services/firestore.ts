import { Firestore } from '@google-cloud/firestore';
import { Job, JobState, AssetReference, FallbackNotice, StepsMap, StepMetadata, JobWarning } from '@content-storyteller/shared';
import { getGcpConfig } from '../config/gcp';

function getDb(): Firestore {
  const cfg = getGcpConfig();
  return new Firestore({ projectId: cfg.projectId, databaseId: cfg.firestoreDatabase });
}

function jobs() {
  return getDb().collection('jobs');
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
 * Update the state and optional fields on a Job document.
 */
export async function updateJobState(
  jobId: string,
  state: JobState,
  extra?: Partial<Pick<Job, 'errorMessage' | 'creativeBrief'>>,
): Promise<void> {
  await jobs().doc(jobId).update({
    state,
    ...extra,
    updatedAt: new Date(),
  });
}

/**
 * Append an asset reference to the Job's assets array.
 */
export async function recordAssetReference(
  jobId: string,
  asset: AssetReference,
): Promise<void> {
  const doc = await jobs().doc(jobId).get();
  if (!doc.exists) throw new Error(`Job ${jobId} not found`);
  const job = doc.data() as Job;
  const assets = [...job.assets, asset];
  await jobs().doc(jobId).update({ assets, updatedAt: new Date() });
}

/**
 * Append a fallback notice to the Job's fallbackNotices array.
 */
export async function recordFallbackNotice(
  jobId: string,
  notice: FallbackNotice,
): Promise<void> {
  const doc = await jobs().doc(jobId).get();
  if (!doc.exists) throw new Error(`Job ${jobId} not found`);
  const job = doc.data() as Job;
  const fallbackNotices = [...job.fallbackNotices, notice];
  await jobs().doc(jobId).update({ fallbackNotices, updatedAt: new Date() });
}

/**
 * Write the initial steps metadata map to the job document.
 */
export async function initializeStepsMetadata(
  jobId: string,
  steps: StepsMap,
): Promise<void> {
  await jobs().doc(jobId).update({ steps, updatedAt: new Date() });
}

/**
 * Update an individual step's metadata using Firestore dot notation.
 */
export async function updateStepMetadata(
  jobId: string,
  stepKey: keyof StepsMap,
  metadata: Partial<StepMetadata>,
): Promise<void> {
  const updateObj: Record<string, unknown> = {};
  if (metadata.status !== undefined) {
    updateObj[`steps.${stepKey}.status`] = metadata.status;
  }
  if (metadata.startedAt !== undefined) {
    updateObj[`steps.${stepKey}.startedAt`] = metadata.startedAt;
  }
  if (metadata.completedAt !== undefined) {
    updateObj[`steps.${stepKey}.completedAt`] = metadata.completedAt;
  }
  if (metadata.errorMessage !== undefined) {
    updateObj[`steps.${stepKey}.errorMessage`] = metadata.errorMessage;
  }
  updateObj['updatedAt'] = new Date();
  await jobs().doc(jobId).update(updateObj);
}

/**
 * Update the job document with warnings, completedOutputs, skippedOutputs, state, and errorMessage.
 */
export async function updateJobWithWarnings(
  jobId: string,
  updates: {
    state?: JobState;
    warnings?: JobWarning[];
    completedOutputs?: string[];
    skippedOutputs?: string[];
    errorMessage?: string;
  },
): Promise<void> {
  const updateObj: Record<string, unknown> = {};
  if (updates.state !== undefined) {
    updateObj['state'] = updates.state;
  }
  if (updates.warnings !== undefined) {
    updateObj['warnings'] = updates.warnings;
  }
  if (updates.completedOutputs !== undefined) {
    updateObj['completedOutputs'] = updates.completedOutputs;
  }
  if (updates.skippedOutputs !== undefined) {
    updateObj['skippedOutputs'] = updates.skippedOutputs;
  }
  if (updates.errorMessage !== undefined) {
    updateObj['errorMessage'] = updates.errorMessage;
  }
  updateObj['updatedAt'] = new Date();
  await jobs().doc(jobId).update(updateObj);
}
