import { PubSub } from '@google-cloud/pubsub';
import { GenerationTaskMessage } from '@content-storyteller/shared';
import { getGcpConfig } from '../config/gcp';
import { logger } from '../middleware/logger';

/** Track whether we've already logged a local worker failure */
let localWorkerFailureLogged = false;

function getPubSub(): PubSub {
  const cfg = getGcpConfig();
  return new PubSub({ projectId: cfg.projectId });
}

/**
 * Forward a generation task directly to the local worker service.
 * Simulates a Pub/Sub push message format.
 */
async function forwardToLocalWorker(
  message: GenerationTaskMessage,
  correlationId: string,
): Promise<void> {
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
      if (!localWorkerFailureLogged) {
        logger.info('[LocalWorker] Worker responded with non-OK status, falling back to Pub/Sub', { status: res.status, correlationId });
        localWorkerFailureLogged = true;
      }
    } else {
      // Reset on success so we log again if it breaks later
      localWorkerFailureLogged = false;
    }
  } catch (err) {
    if (!localWorkerFailureLogged) {
      logger.info('[LocalWorker] Local worker unreachable, falling back to Pub/Sub', {
        error: err instanceof Error ? err.message : String(err),
        correlationId,
      });
      localWorkerFailureLogged = true;
    }
  }
}

/**
 * Publish a GenerationTaskMessage to the configured Pub/Sub topic.
 * Includes correlationId in message attributes for tracing.
 *
 * In local development (non-cloud), also forwards the message directly
 * to the local worker service to bypass Pub/Sub push subscription.
 */
export async function publishGenerationTask(
  message: GenerationTaskMessage,
  correlationId: string,
): Promise<string> {
  const cfg = getGcpConfig();

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
