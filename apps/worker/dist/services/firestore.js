"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJob = getJob;
exports.updateJobState = updateJobState;
exports.recordAssetReference = recordAssetReference;
exports.recordFallbackNotice = recordFallbackNotice;
exports.initializeStepsMetadata = initializeStepsMetadata;
exports.updateStepMetadata = updateStepMetadata;
exports.updateJobWithWarnings = updateJobWithWarnings;
const firestore_1 = require("@google-cloud/firestore");
const gcp_1 = require("../config/gcp");
function getDb() {
    const cfg = (0, gcp_1.getGcpConfig)();
    return new firestore_1.Firestore({ projectId: cfg.projectId, databaseId: cfg.firestoreDatabase });
}
function jobs() {
    return getDb().collection('jobs');
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
 * Update the state and optional fields on a Job document.
 */
async function updateJobState(jobId, state, extra) {
    await jobs().doc(jobId).update({
        state,
        ...extra,
        updatedAt: new Date(),
    });
}
/**
 * Append an asset reference to the Job's assets array.
 */
async function recordAssetReference(jobId, asset) {
    const doc = await jobs().doc(jobId).get();
    if (!doc.exists)
        throw new Error(`Job ${jobId} not found`);
    const job = doc.data();
    const assets = [...job.assets, asset];
    await jobs().doc(jobId).update({ assets, updatedAt: new Date() });
}
/**
 * Append a fallback notice to the Job's fallbackNotices array.
 */
async function recordFallbackNotice(jobId, notice) {
    const doc = await jobs().doc(jobId).get();
    if (!doc.exists)
        throw new Error(`Job ${jobId} not found`);
    const job = doc.data();
    const fallbackNotices = [...job.fallbackNotices, notice];
    await jobs().doc(jobId).update({ fallbackNotices, updatedAt: new Date() });
}
/**
 * Write the initial steps metadata map to the job document.
 */
async function initializeStepsMetadata(jobId, steps) {
    await jobs().doc(jobId).update({ steps, updatedAt: new Date() });
}
/**
 * Update an individual step's metadata using Firestore dot notation.
 */
async function updateStepMetadata(jobId, stepKey, metadata) {
    const updateObj = {};
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
async function updateJobWithWarnings(jobId, updates) {
    const updateObj = {};
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
//# sourceMappingURL=firestore.js.map