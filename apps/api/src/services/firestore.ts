import { Firestore } from '@google-cloud/firestore';
import { Job, JobState, AssetReference, Platform, Tone, TrendAnalysisResult, OutputPreference, StepsMap, JobWarning } from '@content-storyteller/shared';
import type { OutputIntent } from '@content-storyteller/shared';
import { getGcpConfig } from '../config/gcp';

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
 * Create a new Job document in Firestore with state `queued`.
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
 * Update fields on an existing Job document.
 */
export async function updateJob(
  jobId: string,
  updates: Partial<Pick<Job, 'state' | 'assets' | 'errorMessage' | 'creativeBrief' | 'fallbackNotices'>>,
): Promise<void> {
  await jobs().doc(jobId).update({
    ...updates,
    updatedAt: new Date(),
  });
}

/**
 * Query asset references for a given job from the Job document.
 */
export async function queryAssets(jobId: string): Promise<AssetReference[]> {
  const job = await getJob(jobId);
  if (!job) return [];
  return job.assets;
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
