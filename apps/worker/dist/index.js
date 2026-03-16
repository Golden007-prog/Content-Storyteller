"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const shared_1 = require("@content-storyteller/shared");
const firestore_1 = require("./services/firestore");
const logger_1 = require("./middleware/logger");
const pipeline_runner_1 = require("./pipeline/pipeline-runner");
const gcp_1 = require("./config/gcp");
const shared_2 = require("@content-storyteller/shared");
const app = (0, express_1.default)();
exports.app = app;
const PORT = parseInt(process.env.PORT || '8080', 10);
// Validate GCP config early — fail fast if misconfigured
function validateGcpConfigOnStartup() {
    try {
        (0, gcp_1.getGcpConfig)();
    }
    catch (err) {
        logger_1.logger.error('FATAL: GCP configuration error', { error: String(err) });
        process.exit(1);
    }
}
app.use(express_1.default.json());
/** Health check */
app.get('/health', (_req, res) => {
    try {
        const cfg = (0, gcp_1.getGcpConfig)();
        let models = {};
        try {
            const resolved = (0, shared_2.getResolvedModels)();
            models = Object.fromEntries(Object.entries(resolved).map(([slot, info]) => [
                slot,
                { model: info.model, status: info.status, fallbackUsed: info.fallbackUsed },
            ]));
        }
        catch {
            // Router not initialized yet — omit models
        }
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            projectId: cfg.projectId,
            location: cfg.location,
            authMode: cfg.authMode,
            models,
        });
    }
    catch {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    }
});
/**
 * Pub/Sub push endpoint.
 * Receives POST requests with base64-encoded messages from Pub/Sub.
 */
app.post('/', async (req, res) => {
    const pubsubMessage = req.body?.message;
    if (!pubsubMessage || !pubsubMessage.data) {
        logger_1.logger.warn('Received request with no Pub/Sub message data');
        // Acknowledge to prevent redelivery of malformed messages
        res.status(204).send();
        return;
    }
    // Extract correlationId from message attributes
    const correlationId = pubsubMessage.attributes?.correlationId;
    // Decode the base64 message payload
    let taskMessage;
    try {
        const decoded = Buffer.from(pubsubMessage.data, 'base64').toString('utf-8');
        taskMessage = JSON.parse(decoded);
    }
    catch (err) {
        logger_1.logger.error('Failed to parse Pub/Sub message', { error: String(err) });
        // Acknowledge to prevent redelivery of unparseable messages
        res.status(204).send();
        return;
    }
    const { jobId, idempotencyKey } = taskMessage;
    if (!jobId) {
        logger_1.logger.error('Pub/Sub message missing jobId');
        res.status(204).send();
        return;
    }
    const jobLogger = (0, logger_1.createLogger)(correlationId, jobId);
    jobLogger.info('Received generation task message', { idempotencyKey });
    try {
        // Look up the Job in Firestore
        const job = await (0, firestore_1.getJob)(jobId);
        if (!job) {
            jobLogger.warn('Job not found in Firestore — acknowledging and discarding', { jobId });
            // Acknowledge — no point retrying a missing job
            res.status(204).send();
            return;
        }
        // Idempotency check: compare the idempotencyKey from the message
        // with the one stored on the Job document. If the job has already
        // moved past `queued`, it was already processed for this key.
        if (job.idempotencyKey === idempotencyKey && job.state !== shared_1.JobState.Queued) {
            jobLogger.info('Duplicate idempotencyKey — skipping processing', {
                currentState: job.state,
            });
            res.status(204).send();
            return;
        }
        // Run the generation pipeline (pipeline runner handles all state transitions internally)
        await (0, pipeline_runner_1.runPipeline)({
            jobId,
            correlationId: correlationId || job.correlationId,
            uploadedMediaPaths: job.uploadedMediaPaths,
            workingData: {},
        });
        jobLogger.info('Pipeline completed successfully');
        res.status(204).send();
    }
    catch (err) {
        jobLogger.error('Pipeline failed', { error: String(err) });
        // Mark the job as failed
        try {
            await (0, firestore_1.updateJobState)(jobId, shared_1.JobState.Failed, {
                errorMessage: err instanceof Error ? err.message : String(err),
            });
        }
        catch (updateErr) {
            jobLogger.error('Failed to update job state to failed', {
                error: String(updateErr),
            });
        }
        // Acknowledge so Pub/Sub doesn't redeliver on permanent failures
        res.status(204).send();
    }
});
if (require.main === module) {
    // Validate GCP config at startup — fail fast if misconfigured
    try {
        (0, gcp_1.getGcpConfig)();
        (0, gcp_1.logGcpConfig)(logger_1.logger.info.bind(logger_1.logger));
    }
    catch (err) {
        logger_1.logger.error('FATAL: GCP configuration error', { error: String(err) });
        process.exit(1);
    }
    // Initialize model router before serving requests
    (0, shared_2.initModelRouter)()
        .then(() => {
        app.listen(PORT, () => {
            logger_1.logger.info(`Worker service listening on port ${PORT}`);
        });
    })
        .catch((err) => {
        logger_1.logger.error('FATAL: Model router initialization failed', { error: String(err) });
        process.exit(1);
    });
}
//# sourceMappingURL=index.js.map