"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishGenerationTask = publishGenerationTask;
const pubsub_1 = require("@google-cloud/pubsub");
const gcp_1 = require("../config/gcp");
function getPubSub() {
    const cfg = (0, gcp_1.getGcpConfig)();
    return new pubsub_1.PubSub({ projectId: cfg.projectId });
}
/**
 * Forward a generation task directly to the local worker service.
 * Simulates a Pub/Sub push message format.
 */
async function forwardToLocalWorker(message, correlationId) {
    const workerUrl = process.env.LOCAL_WORKER_URL || 'http://localhost:8081';
    const payload = {
        message: {
            data: Buffer.from(JSON.stringify(message)).toString('base64'),
            attributes: {
                correlationId,
                publishedAt: new Date().toISOString(),
            },
        },
    };
    try {
        const res = await fetch(workerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            console.error(`[LocalWorker] Worker responded with ${res.status}`);
        }
    }
    catch (err) {
        console.error('[LocalWorker] Failed to reach local worker:', err instanceof Error ? err.message : err);
    }
}
/**
 * Publish a GenerationTaskMessage to the configured Pub/Sub topic.
 * Includes correlationId in message attributes for tracing.
 *
 * In local development (non-cloud), also forwards the message directly
 * to the local worker service to bypass Pub/Sub push subscription.
 */
async function publishGenerationTask(message, correlationId) {
    const cfg = (0, gcp_1.getGcpConfig)();
    // In local dev, forward directly to the worker (fire-and-forget)
    if (!cfg.isCloud) {
        forwardToLocalWorker(message, correlationId).catch(() => {
            // Swallow — best effort for local dev
        });
    }
    const topic = getPubSub().topic(cfg.pubsubTopic);
    const messageId = await topic.publishMessage({
        json: message,
        attributes: {
            correlationId,
            publishedAt: new Date().toISOString(),
        },
    });
    return messageId;
}
//# sourceMappingURL=pubsub.js.map