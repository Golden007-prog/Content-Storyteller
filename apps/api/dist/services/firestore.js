"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createJob = createJob;
exports.getJob = getJob;
exports.updateJob = updateJob;
exports.queryAssets = queryAssets;
exports.createTrendQuery = createTrendQuery;
exports.getTrendQuery = getTrendQuery;
const firestore_1 = require("@google-cloud/firestore");
const shared_1 = require("@content-storyteller/shared");
const gcp_1 = require("../config/gcp");
function getDb() {
    const cfg = (0, gcp_1.getGcpConfig)();
    return new firestore_1.Firestore({ projectId: cfg.projectId, databaseId: cfg.firestoreDatabase });
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
async function createJob(params) {
    const docRef = jobs().doc();
    const now = new Date();
    const job = {
        id: docRef.id,
        correlationId: params.correlationId,
        idempotencyKey: params.idempotencyKey,
        state: shared_1.JobState.Queued,
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
async function getJob(jobId) {
    const doc = await jobs().doc(jobId).get();
    if (!doc.exists)
        return null;
    return doc.data();
}
/**
 * Update fields on an existing Job document.
 */
async function updateJob(jobId, updates) {
    await jobs().doc(jobId).update({
        ...updates,
        updatedAt: new Date(),
    });
}
/**
 * Query asset references for a given job from the Job document.
 */
async function queryAssets(jobId) {
    const job = await getJob(jobId);
    if (!job)
        return [];
    return job.assets;
}
/**
 * Create a new TrendQuery document in Firestore.
 */
async function createTrendQuery(result) {
    const docRef = trendQueries().doc();
    // Strip undefined values — Firestore rejects them
    const data = JSON.parse(JSON.stringify({ ...result, createdAt: new Date().toISOString() }));
    await docRef.set(data);
    return docRef.id;
}
/**
 * Read a TrendQuery document by ID. Returns null if not found.
 */
async function getTrendQuery(queryId) {
    const doc = await trendQueries().doc(queryId).get();
    if (!doc.exists)
        return null;
    const data = doc.data();
    const { createdAt, ...rest } = data;
    return rest;
}
//# sourceMappingURL=firestore.js.map