"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = require("./middleware/cors");
const correlation_id_1 = require("./middleware/correlation-id");
const logger_1 = require("./middleware/logger");
const upload_limiter_1 = require("./middleware/upload-limiter");
const error_handler_1 = require("./middleware/error-handler");
const upload_1 = require("./routes/upload");
const jobs_1 = require("./routes/jobs");
const stream_1 = require("./routes/stream");
const live_1 = require("./routes/live");
const trends_1 = require("./routes/trends");
const gcp_1 = require("./config/gcp");
const shared_1 = require("@content-storyteller/shared");
const app = (0, express_1.default)();
exports.app = app;
const PORT = parseInt(process.env.PORT || '8080', 10);
// Middleware stack
app.use(cors_1.corsMiddleware);
app.use(correlation_id_1.correlationId);
app.use(logger_1.requestLogger);
app.use(upload_limiter_1.uploadLimiter);
app.use(express_1.default.json({ limit: '50mb' }));
// Health check — includes project info for verification
app.get('/api/v1/health', (_req, res) => {
    try {
        const cfg = (0, gcp_1.getGcpConfig)();
        let models = {};
        try {
            const resolved = (0, shared_1.getResolvedModels)();
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
// Debug endpoint — development only, never expose secrets
app.get('/api/v1/debug/gcp-config', (_req, res) => {
    try {
        const cfg = (0, gcp_1.getGcpConfig)();
        if (cfg.isCloud) {
            res.status(404).json({ error: 'Not available in production' });
            return;
        }
        let models = {};
        try {
            models = (0, shared_1.getResolvedModels)();
        }
        catch {
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
    }
    catch (err) {
        res.status(500).json({ error: 'GCP config not available', detail: String(err) });
    }
});
// Route handlers
app.use('/api/v1/upload', upload_1.uploadRouter);
app.use('/api/v1/jobs', jobs_1.jobsRouter);
app.use('/api/v1/jobs', stream_1.streamRouter);
app.use('/api/v1/live', live_1.liveRouter);
app.use('/api/v1/trends', trends_1.trendsRouter);
// Error handler (must be last)
app.use(error_handler_1.errorHandler);
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
    (0, shared_1.initModelRouter)()
        .then(() => {
        app.listen(PORT, () => {
            logger_1.logger.info(`API service listening on port ${PORT}`);
        });
    })
        .catch((err) => {
        logger_1.logger.error('FATAL: Model router initialization failed', { error: String(err) });
        process.exit(1);
    });
}
//# sourceMappingURL=index.js.map