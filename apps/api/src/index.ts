import express from 'express';
import { corsMiddleware } from './middleware/cors';
import { correlationId } from './middleware/correlation-id';
import { requestLogger, logger } from './middleware/logger';
import { uploadLimiter } from './middleware/upload-limiter';
import { errorHandler } from './middleware/error-handler';
import { uploadRouter } from './routes/upload';
import { jobsRouter } from './routes/jobs';
import { streamRouter } from './routes/stream';
import { liveRouter } from './routes/live';
import { trendsRouter } from './routes/trends';
import { getGcpConfig, logGcpConfig } from './config/gcp';
import { initModelRouter, getResolvedModels } from '@content-storyteller/shared';
import { streamAsset } from './services/storage';

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);

// Middleware stack
app.use(corsMiddleware);
app.use(correlationId);
app.use(requestLogger);
app.use(uploadLimiter);
app.use(express.json({ limit: '50mb' }));

// Health check — includes project info for verification
app.get('/api/v1/health', (_req, res) => {
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

// Debug endpoint — development only, never expose secrets
app.get('/api/v1/debug/gcp-config', (_req, res) => {
  try {
    const cfg = getGcpConfig();
    if (cfg.isCloud) {
      res.status(404).json({ error: 'Not available in production' });
      return;
    }
    let models = {};
    try {
      models = getResolvedModels();
    } catch {
      // Router not initialized yet
    }
    res.json({
      projectId: cfg.projectId,
      location: cfg.location,
      firestoreDatabase: cfg.firestoreDatabase,
      uploadsBucket: cfg.uploadsBucket || '(not set)',
      assetsBucket: cfg.assetsBucket || '(not set)',
      pubsubTopic: cfg.pubsubTopic || '(not set)',
      authMode: cfg.authMode,
      isCloud: cfg.isCloud,
      hasGeminiApiKey: !!cfg.geminiApiKey,
      models,
    });
  } catch (err) {
    res.status(500).json({ error: 'GCP config not available', detail: String(err) });
  }
});

// Route handlers
app.use('/api/v1/upload', uploadRouter);
app.use('/api/v1/jobs', jobsRouter);
app.use('/api/v1/jobs', streamRouter);
app.use('/api/v1/live', liveRouter);
app.use('/api/v1/trends', trendsRouter);

// Asset proxy — streams GCS files through the API for local dev (signed URLs fail with ADC user creds)
app.get('/api/v1/assets/:path(*)', async (req, res) => {
  try {
    const assetPath = decodeURIComponent(req.params.path);
    const { stream, contentType } = await streamAsset(assetPath);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    (stream as NodeJS.ReadableStream).pipe(res);
  } catch (err: any) {
    if (err?.code === 404) {
      res.status(404).json({ error: 'Asset not found' });
    } else {
      res.status(500).json({ error: 'Failed to stream asset', detail: String(err) });
    }
  }
});

// Error handler (must be last)
app.use(errorHandler);

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
        logger.info(`API service listening on port ${PORT}`);
      });
    })
    .catch((err) => {
      logger.error('FATAL: Model router initialization failed', { error: String(err) });
      process.exit(1);
    });
}
