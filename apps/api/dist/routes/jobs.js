"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobsRouter = void 0;
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const archiver_1 = __importDefault(require("archiver"));
const firestore_1 = require("../services/firestore");
const pubsub_1 = require("../services/pubsub");
const storage_1 = require("../services/storage");
const output_intent_1 = require("../services/planner/output-intent");
const shared_1 = require("@content-storyteller/shared");
const logger_1 = require("../middleware/logger");
const router = (0, express_1.Router)();
exports.jobsRouter = router;
/**
 * POST /api/v1/jobs
 * Create a Job in Firestore (state `queued`), publish Pub/Sub message, return job ID.
 */
router.post('/', async (req, res, next) => {
    try {
        const { uploadedMediaPaths, idempotencyKey, promptText, platform, tone, outputPreference } = req.body;
        // Validate promptText is present and non-empty
        if (!promptText || promptText.trim().length === 0) {
            res.status(400).json({
                error: {
                    code: 'MISSING_PROMPT',
                    message: 'promptText is required and must not be empty',
                    correlationId: req.correlationId,
                },
            });
            return;
        }
        // Validate platform against Platform enum
        const validPlatforms = Object.values(shared_1.Platform);
        if (!platform || !validPlatforms.includes(platform)) {
            res.status(400).json({
                error: {
                    code: 'INVALID_PLATFORM',
                    message: `platform must be one of: ${validPlatforms.join(', ')}`,
                    correlationId: req.correlationId,
                },
            });
            return;
        }
        // Validate tone against Tone enum
        const validTones = Object.values(shared_1.Tone);
        if (!tone || !validTones.includes(tone)) {
            res.status(400).json({
                error: {
                    code: 'INVALID_TONE',
                    message: `tone must be one of: ${validTones.join(', ')}`,
                    correlationId: req.correlationId,
                },
            });
            return;
        }
        const resolvedIdempotencyKey = idempotencyKey || crypto_1.default.randomUUID();
        // Validate outputPreference against OutputPreference enum if provided
        const validOutputPreferences = Object.values(shared_1.OutputPreference);
        const validatedOutputPreference = outputPreference
            ? (validOutputPreferences.includes(outputPreference)
                ? outputPreference
                : (() => {
                    res.status(400).json({
                        error: {
                            code: 'INVALID_OUTPUT_PREFERENCE',
                            message: `outputPreference must be one of: ${validOutputPreferences.join(', ')}`,
                            correlationId: req.correlationId,
                        },
                    });
                    return null;
                })())
            : shared_1.OutputPreference.Auto;
        // If we already sent a 400 response for invalid outputPreference, stop
        if (res.headersSent)
            return;
        // Resolve output intent via Planner
        const outputIntent = (0, output_intent_1.resolveOutputIntent)({
            promptText: promptText,
            platform: platform,
            tone: tone,
            uploadedMediaPaths: uploadedMediaPaths || [],
            outputPreference: validatedOutputPreference,
        });
        // Derive requestedOutputs from the OutputIntent
        const requestedOutputs = [];
        if (outputIntent.wantsCopy)
            requestedOutputs.push('copy');
        if (outputIntent.wantsHashtags)
            requestedOutputs.push('hashtags');
        if (outputIntent.wantsImage)
            requestedOutputs.push('image');
        if (outputIntent.wantsVideo)
            requestedOutputs.push('video');
        if (outputIntent.wantsStoryboard)
            requestedOutputs.push('storyboard');
        if (outputIntent.wantsVoiceover)
            requestedOutputs.push('voiceover');
        if (outputIntent.wantsCarousel)
            requestedOutputs.push('carousel');
        if (outputIntent.wantsThread)
            requestedOutputs.push('thread');
        if (outputIntent.wantsLinkedInPost)
            requestedOutputs.push('linkedInPost');
        if (outputIntent.wantsGif)
            requestedOutputs.push('gif');
        // Initialize steps metadata
        const steps = {
            processInput: { status: 'queued' },
            generateCopy: { status: 'queued' },
            generateImages: { status: 'queued' },
            generateVideo: { status: 'queued' },
            generateGif: { status: 'queued' },
            composePackage: { status: 'queued' },
        };
        const job = await (0, firestore_1.createJob)({
            correlationId: req.correlationId,
            idempotencyKey: resolvedIdempotencyKey,
            uploadedMediaPaths: uploadedMediaPaths || [],
            promptText,
            platform: platform,
            tone: tone,
            outputPreference: validatedOutputPreference,
            outputIntent,
            requestedOutputs,
            steps,
        });
        await (0, pubsub_1.publishGenerationTask)({ jobId: job.id, idempotencyKey: resolvedIdempotencyKey }, req.correlationId);
        logger_1.logger.info('Output intent resolved', { outputPreference: validatedOutputPreference, outputIntent, requestedOutputs, correlationId: req.correlationId });
        logger_1.logger.info(`Job created: ${job.id}`, { correlationId: req.correlationId });
        const response = {
            jobId: job.id,
            state: job.state,
            createdAt: job.createdAt,
        };
        res.status(201).json(response);
    }
    catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes('ECONNREFUSED') ||
            errMsg.includes('Could not load the default credentials') ||
            errMsg.includes('ENOTFOUND') ||
            errMsg.includes('getaddrinfo')) {
            logger_1.logger.error('GCP service unavailable during job creation', {
                correlationId: req.correlationId,
                error: errMsg,
            });
            res.status(503).json({
                error: {
                    code: 'SERVICE_UNAVAILABLE',
                    message: 'A backend service (Firestore or Pub/Sub) is not reachable. Check your GCP credentials and network.',
                    correlationId: req.correlationId,
                },
            });
            return;
        }
        next(err);
    }
});
/**
 * GET /api/v1/jobs/:jobId
 * Poll job status and partial results.
 */
router.get('/:jobId', async (req, res, next) => {
    try {
        const { jobId } = req.params;
        const job = await (0, firestore_1.getJob)(jobId);
        if (!job) {
            res.status(404).json({
                error: {
                    code: 'JOB_NOT_FOUND',
                    message: `Job ${jobId} not found`,
                    correlationId: req.correlationId,
                },
            });
            return;
        }
        const response = {
            jobId: job.id,
            state: job.state,
            assets: job.assets,
            errorMessage: job.errorMessage,
            updatedAt: job.updatedAt,
            creativeBrief: job.creativeBrief,
            platform: job.platform,
            tone: job.tone,
            requestedOutputs: job.requestedOutputs,
            skippedOutputs: job.skippedOutputs,
            outputIntent: job.outputIntent,
        };
        res.json(response);
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/v1/jobs/:jobId/assets
 * Retrieve completed asset bundle.
 */
router.get('/:jobId/assets', async (req, res, next) => {
    try {
        const { jobId } = req.params;
        const job = await (0, firestore_1.getJob)(jobId);
        if (!job) {
            res.status(404).json({
                error: {
                    code: 'JOB_NOT_FOUND',
                    message: `Job ${jobId} not found`,
                    correlationId: req.correlationId,
                },
            });
            return;
        }
        if (job.state !== shared_1.JobState.Completed) {
            res.status(409).json({
                error: {
                    code: 'JOB_NOT_COMPLETED',
                    message: `Job ${jobId} is not yet completed (current state: ${job.state})`,
                    correlationId: req.correlationId,
                },
            });
            return;
        }
        const assets = await (0, firestore_1.queryAssets)(jobId);
        // Generate signed URLs for each asset reference
        const assetsWithUrls = await Promise.all(assets.map(async (asset) => {
            try {
                const signedUrl = await (0, storage_1.generateSignedUrl)(asset.storagePath);
                return { ...asset, signedUrl };
            }
            catch (err) {
                logger_1.logger.error(`Failed to generate signed URL for asset ${asset.assetId}`, {
                    correlationId: req.correlationId,
                    error: err,
                });
                return { ...asset, signedUrl: '' };
            }
        }));
        const response = {
            bundle: {
                jobId: job.id,
                completedAt: job.updatedAt,
                assets: assetsWithUrls,
                creativeBrief: job.creativeBrief,
                fallbackNotices: job.fallbackNotices,
            },
        };
        res.json(response);
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/v1/jobs/:jobId/bundle
 * Return an Asset Manifest JSON or ZIP archive of all completed assets.
 * Use ?format=zip to get a ZIP archive.
 */
router.get('/:jobId/bundle', async (req, res, next) => {
    try {
        const { jobId } = req.params;
        const format = req.query.format;
        const job = await (0, firestore_1.getJob)(jobId);
        if (!job) {
            res.status(404).json({
                error: {
                    code: 'JOB_NOT_FOUND',
                    message: `Job ${jobId} not found`,
                    correlationId: req.correlationId,
                },
            });
            return;
        }
        const assets = await (0, firestore_1.queryAssets)(jobId);
        const completedAssets = assets.filter((a) => a.status === 'completed');
        const assetsWithUrls = await Promise.all(completedAssets.map(async (asset) => {
            try {
                const signedUrl = await (0, storage_1.generateSignedUrl)(asset.storagePath);
                return { ...asset, signedUrl };
            }
            catch (err) {
                logger_1.logger.error(`Failed to generate signed URL for asset ${asset.assetId}`, {
                    correlationId: req.correlationId,
                    error: err,
                });
                return { ...asset, signedUrl: '' };
            }
        }));
        // ZIP streaming mode
        if (format === 'zip') {
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="content-package-${jobId}.zip"`);
            const archive = (0, archiver_1.default)('zip', { zlib: { level: 5 } });
            archive.on('error', (err) => {
                logger_1.logger.error('Archive error', { correlationId: req.correlationId, error: err });
                if (!res.headersSent) {
                    res.status(500).json({ error: { message: 'ZIP generation failed' } });
                }
            });
            archive.pipe(res);
            for (const asset of assetsWithUrls) {
                if (!asset.signedUrl)
                    continue;
                try {
                    const fetchRes = await fetch(asset.signedUrl);
                    if (!fetchRes.ok || !fetchRes.body)
                        continue;
                    const filename = asset.storagePath.split('/').pop() || `${asset.assetId}.bin`;
                    // Convert web ReadableStream to Node buffer then append
                    const arrayBuffer = await fetchRes.arrayBuffer();
                    archive.append(Buffer.from(arrayBuffer), { name: filename });
                }
                catch (err) {
                    logger_1.logger.error(`Failed to fetch asset for ZIP: ${asset.assetId}`, {
                        correlationId: req.correlationId,
                        error: err,
                    });
                }
            }
            await archive.finalize();
            return;
        }
        // Default: JSON manifest
        const manifest = {
            assets: assetsWithUrls,
            generatedAt: new Date().toISOString(),
            platform: job.platform ?? null,
            tone: job.tone ?? null,
        };
        res.json(manifest);
    }
    catch (err) {
        next(err);
    }
});
//# sourceMappingURL=jobs.js.map