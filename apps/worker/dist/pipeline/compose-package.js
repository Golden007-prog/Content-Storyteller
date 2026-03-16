"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComposePackage = void 0;
const shared_1 = require("@content-storyteller/shared");
const firestore_1 = require("../services/firestore");
const storage_1 = require("../services/storage");
const logger_1 = require("../middleware/logger");
const crypto_1 = require("crypto");
/**
 * ComposePackage stage: assemble the final Asset Bundle from all
 * generated assets, write the bundle manifest, and mark the Job completed.
 */
class ComposePackage {
    name = 'ComposePackage';
    jobState = shared_1.JobState.ComposingPackage;
    async execute(context) {
        const log = (0, logger_1.createLogger)(context.correlationId, context.jobId);
        log.info('ComposePackage stage started');
        try {
            await (0, firestore_1.updateJobState)(context.jobId, this.jobState);
            // Read the current Job to gather all assets and fallback notices
            const job = await (0, firestore_1.getJob)(context.jobId);
            if (!job) {
                throw new Error(`Job ${context.jobId} not found`);
            }
            const creativeBrief = (context.workingData.creativeBrief ||
                job.creativeBrief);
            const bundle = {
                jobId: context.jobId,
                completedAt: new Date(),
                assets: job.assets,
                creativeBrief,
                fallbackNotices: job.fallbackNotices,
            };
            // Write the bundle manifest to the assets bucket
            const bundleId = (0, crypto_1.randomUUID)();
            const bundlePath = `${context.jobId}/bundle/${bundleId}.json`;
            await (0, storage_1.writeAsset)(bundlePath, Buffer.from(JSON.stringify(bundle, null, 2), 'utf-8'), 'application/json');
            // Mark job as completed
            await (0, firestore_1.updateJobState)(context.jobId, shared_1.JobState.Completed);
            log.info('ComposePackage stage completed', {
                assetCount: job.assets.length,
                fallbackCount: job.fallbackNotices.length,
                bundlePath,
            });
            return { success: true, assets: [bundlePath] };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.error('ComposePackage stage failed', { error: message });
            return { success: false, assets: [], error: message };
        }
    }
}
exports.ComposePackage = ComposePackage;
//# sourceMappingURL=compose-package.js.map