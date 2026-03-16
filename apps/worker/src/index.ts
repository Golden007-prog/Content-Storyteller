import express, { Request, Response } from 'express';
import { GenerationTaskMessage, JobState } from '@content-storyteller/shared';
import { getJob, updateJobState } from './services/firestore';
import { createLogger, logger } from './middleware/logger';
import { runPipeline } from './pipeline/pipeline-runner';
import { getGcpConfig, logGcpConfig } from './config/gcp';
import { initModelRouter, getResolvedModels } from '@content-storyteller/shared';

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);

// Validate GCP config early — fail fast if misconfigured
function validateGcpConfigOnStartup(): void {
  try {
    getGcpConfig();
  } catch (err) {
    logger.error('FATAL: GCP configuration error', { error: String(err) });
    process.exit(1);
  }
}

app.use(express.json());

/** Health check */
app.get('/health', (_req: Request, res: Response) => {
  try {
    const cfg = getGcpConfig();
    let models: Record<string, { model: string; status: string; fallbackUsed: string | null }> = {};
    try {
      const resolved = getResolvedModels();
      models = Object.fromEntries(
        Object.entries(resolved).map(([slot, info]) => [
          slot,
          { model: info.model, status: info.status, fallbackUsed: info.fallbackUsed },
        ]),
      );
    } catch {
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
  } catch {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  }
});

/**
 * Pub/Sub push endpoint.
 * Receives POST requests with base64-encoded messages from Pub/Sub.
 */
app.post('/', async (req: Request, res: Response) => {
  const pubsubMessage = req.body?.message;
  if (!pubsubMessage || !pubsubMessage.data) {
    logger.warn('Received request with no Pub/Sub message data');
    // Acknowledge to prevent redelivery of malformed messages
    res.status(204).send();
    return;
  }

  // Extract correlationId from message attributes
  const correlationId: string | undefined = pubsubMessage.attributes?.correlationId;

  // Decode the base64 message payload
  let taskMessage: GenerationTaskMessage;
  try {
    const decoded = Buffer.from(pubsubMessage.data, 'base64').toString('utf-8');
    taskMessage = JSON.parse(decoded) as GenerationTaskMessage;
  } catch (err) {
    logger.error('Failed to parse Pub/Sub message', { error: String(err) });
    // Acknowledge to prevent redelivery of unparseable messages
    res.status(204).send();
    return;
  }

  const { jobId, idempotencyKey } = taskMessage;

  if (!jobId) {
    logger.error('Pub/Sub message missing jobId');
    res.status(204).send();
    return;
  }

  const jobLogger = createLogger(correlationId, jobId);
  jobLogger.info('Received generation task message', { idempotencyKey });

  try {
    // Look up the Job in Firestore
    const job = await getJob(jobId);
    if (!job) {
      jobLogger.warn('Job not found in Firestore — acknowledging and discarding', { jobId });
      // Acknowledge — no point retrying a missing job
      res.status(204).send();
      return;
    }

    // Idempotency check: compare the idempotencyKey from the message
    // with the one stored on the Job document. If the job has already
    // moved past `queued`, it was already processed for this key.
    if (job.idempotencyKey === idempotencyKey && job.state !== JobState.Queued) {
      jobLogger.info('Duplicate idempotencyKey — skipping processing', {
        currentState: job.state,
      });
      res.status(204).send();
      return;
    }

    // Run the generation pipeline (pipeline runner handles all state transitions internally)
    await runPipeline({
      jobId,
      correlationId: correlationId || job.correlationId,
      uploadedMediaPaths: job.uploadedMediaPaths,
      workingData: {},
    });

    jobLogger.info('Pipeline completed successfully');
    res.status(204).send();
  } catch (err) {
    jobLogger.error('Pipeline failed', { error: String(err) });

    // Mark the job as failed
    try {
      await updateJobState(jobId, JobState.Failed, {
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    } catch (updateErr) {
      jobLogger.error('Failed to update job state to failed', {
        error: String(updateErr),
      });
    }

    // Acknowledge so Pub/Sub doesn't redeliver on permanent failures
    res.status(204).send();
  }
});

export { app };

if (require.main === module) {
  // Validate GCP config at startup — fail fast if misconfigured
  try {
    getGcpConfig();
    logGcpConfig(logger.info.bind(logger));
  } catch (err) {
    logger.error('FATAL: GCP configuration error', { error: String(err) });
    process.exit(1);
  }

  // Initialize model router before serving requests
  initModelRouter()
    .then(() => {
      app.listen(PORT, () => {
        logger.info(`Worker service listening on port ${PORT}`);
      });
    })
    .catch((err) => {
      logger.error('FATAL: Model router initialization failed', { error: String(err) });
      process.exit(1);
    });
}
