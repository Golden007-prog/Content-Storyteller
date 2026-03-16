"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamRouter = void 0;
const express_1 = require("express");
const firestore_1 = require("../services/firestore");
const storage_1 = require("../services/storage");
const shared_1 = require("@content-storyteller/shared");
const logger_1 = require("../middleware/logger");
const router = (0, express_1.Router)();
exports.streamRouter = router;
const POLL_INTERVAL_MS = 2000;
const TERMINAL_STATES = new Set([shared_1.JobState.Completed, shared_1.JobState.Failed]);
/**
 * Safely read and parse a JSON asset from GCS.
 * Returns null if the asset cannot be read or parsed.
 */
async function readJsonAsset(storagePath) {
    try {
        const buffer = await (0, storage_1.readAsset)(storagePath);
        return JSON.parse(buffer.toString('utf-8'));
    }
    catch {
        return null;
    }
}
/**
 * Find the first asset reference matching the given type.
 */
function findAssetByType(job, assetType) {
    return job.assets.find((a) => a.assetType === assetType && a.status === 'completed');
}
/**
 * Emit partial_result events based on the state transition.
 * Reads the Job document and relevant assets from GCS to populate partial data.
 */
async function emitPartialResults(job, previousState, sendEvent) {
    const currentState = job.state;
    // After ProcessInput → GeneratingCopy: emit creativeBrief
    if (previousState === shared_1.JobState.ProcessingInput &&
        currentState === shared_1.JobState.GeneratingCopy) {
        if (job.creativeBrief) {
            sendEvent({
                event: 'partial_result',
                data: {
                    jobId: job.id,
                    state: currentState,
                    creativeBrief: job.creativeBrief,
                    timestamp: new Date().toISOString(),
                },
            });
        }
    }
    // After GeneratingCopy → GeneratingImages: emit partialCopy
    if (previousState === shared_1.JobState.GeneratingCopy &&
        currentState === shared_1.JobState.GeneratingImages) {
        const copyAsset = findAssetByType(job, shared_1.AssetType.Copy);
        if (copyAsset) {
            const copyData = await readJsonAsset(copyAsset.storagePath);
            if (copyData) {
                sendEvent({
                    event: 'partial_result',
                    data: {
                        jobId: job.id,
                        state: currentState,
                        partialCopy: copyData,
                        timestamp: new Date().toISOString(),
                    },
                });
            }
        }
    }
    // After GeneratingCopy → GeneratingVideo (when images are skipped but video is not): emit partialCopy
    if (previousState === shared_1.JobState.GeneratingCopy &&
        currentState === shared_1.JobState.GeneratingVideo) {
        const copyAsset = findAssetByType(job, shared_1.AssetType.Copy);
        if (copyAsset) {
            const copyData = await readJsonAsset(copyAsset.storagePath);
            if (copyData) {
                sendEvent({
                    event: 'partial_result',
                    data: {
                        jobId: job.id,
                        state: currentState,
                        partialCopy: copyData,
                        timestamp: new Date().toISOString(),
                    },
                });
            }
        }
    }
    // After GeneratingCopy → ComposingPackage (when images AND video are skipped): emit partialCopy
    if (previousState === shared_1.JobState.GeneratingCopy &&
        currentState === shared_1.JobState.ComposingPackage) {
        const copyAsset = findAssetByType(job, shared_1.AssetType.Copy);
        if (copyAsset) {
            const copyData = await readJsonAsset(copyAsset.storagePath);
            if (copyData) {
                sendEvent({
                    event: 'partial_result',
                    data: {
                        jobId: job.id,
                        state: currentState,
                        partialCopy: copyData,
                        timestamp: new Date().toISOString(),
                    },
                });
            }
        }
    }
    // After GeneratingImages → GeneratingVideo: emit partialImageConcepts
    if (previousState === shared_1.JobState.GeneratingImages &&
        currentState === shared_1.JobState.GeneratingVideo) {
        // Image concepts are stored as a JSON array asset
        const imageConceptAssets = job.assets.filter((a) => a.assetType === shared_1.AssetType.Image && a.status === 'completed' && a.storagePath.includes('image-concepts'));
        // Try reading image concepts from a single JSON asset
        // The worker stores them as a single JSON file under image-concepts/
        let imageConcepts = null;
        for (const asset of imageConceptAssets) {
            const data = await readJsonAsset(asset.storagePath);
            if (data && Array.isArray(data)) {
                imageConcepts = data;
                break;
            }
        }
        // If no image-concepts path found, try all image assets
        if (!imageConcepts) {
            const allImageAssets = job.assets.filter((a) => a.assetType === shared_1.AssetType.Image && a.status === 'completed');
            for (const asset of allImageAssets) {
                const data = await readJsonAsset(asset.storagePath);
                if (data) {
                    imageConcepts = Array.isArray(data) ? data : [data];
                    break;
                }
            }
        }
        if (imageConcepts && imageConcepts.length > 0) {
            sendEvent({
                event: 'partial_result',
                data: {
                    jobId: job.id,
                    state: currentState,
                    partialImageConcepts: imageConcepts,
                    timestamp: new Date().toISOString(),
                },
            });
        }
    }
    // After GeneratingImages → ComposingPackage (when video is skipped): emit partialImageConcepts
    if (previousState === shared_1.JobState.GeneratingImages &&
        currentState === shared_1.JobState.ComposingPackage) {
        const imageConceptAssets = job.assets.filter((a) => a.assetType === shared_1.AssetType.Image && a.status === 'completed' && a.storagePath.includes('image-concepts'));
        let imageConcepts = null;
        for (const asset of imageConceptAssets) {
            const data = await readJsonAsset(asset.storagePath);
            if (data && Array.isArray(data)) {
                imageConcepts = data;
                break;
            }
        }
        if (!imageConcepts) {
            const allImageAssets = job.assets.filter((a) => a.assetType === shared_1.AssetType.Image && a.status === 'completed');
            for (const asset of allImageAssets) {
                const data = await readJsonAsset(asset.storagePath);
                if (data) {
                    imageConcepts = Array.isArray(data) ? data : [data];
                    break;
                }
            }
        }
        if (imageConcepts && imageConcepts.length > 0) {
            sendEvent({
                event: 'partial_result',
                data: {
                    jobId: job.id,
                    state: currentState,
                    partialImageConcepts: imageConcepts,
                    timestamp: new Date().toISOString(),
                },
            });
        }
    }
    // After GeneratingVideo → ComposingPackage: emit partialStoryboard + partialVideoBrief
    if (previousState === shared_1.JobState.GeneratingVideo &&
        currentState === shared_1.JobState.ComposingPackage) {
        const storyboardAsset = findAssetByType(job, shared_1.AssetType.Storyboard);
        let storyboardData = null;
        if (storyboardAsset) {
            storyboardData = await readJsonAsset(storyboardAsset.storagePath);
        }
        // VideoBrief is stored under video-brief/ path
        const videoBriefAsset = job.assets.find((a) => a.status === 'completed' && a.storagePath.includes('video-brief'));
        let videoBriefData = null;
        if (videoBriefAsset) {
            videoBriefData = await readJsonAsset(videoBriefAsset.storagePath);
        }
        if (storyboardData || videoBriefData) {
            sendEvent({
                event: 'partial_result',
                data: {
                    jobId: job.id,
                    state: currentState,
                    ...(storyboardData && { partialStoryboard: storyboardData }),
                    ...(videoBriefData && { partialVideoBrief: videoBriefData }),
                    timestamp: new Date().toISOString(),
                },
            });
        }
    }
    // After GeneratingCopy → GeneratingGif (when images AND video are skipped but GIF is not): emit partialCopy
    if (previousState === shared_1.JobState.GeneratingCopy &&
        currentState === shared_1.JobState.GeneratingGif) {
        const copyAsset = findAssetByType(job, shared_1.AssetType.Copy);
        if (copyAsset) {
            const copyData = await readJsonAsset(copyAsset.storagePath);
            if (copyData) {
                sendEvent({
                    event: 'partial_result',
                    data: {
                        jobId: job.id,
                        state: currentState,
                        partialCopy: copyData,
                        timestamp: new Date().toISOString(),
                    },
                });
            }
        }
    }
    // After GeneratingImages → GeneratingGif (when video is skipped but GIF is not): emit partialImageConcepts
    if (previousState === shared_1.JobState.GeneratingImages &&
        currentState === shared_1.JobState.GeneratingGif) {
        const imageConceptAssets = job.assets.filter((a) => a.assetType === shared_1.AssetType.Image && a.status === 'completed' && a.storagePath.includes('image-concepts'));
        let imageConcepts = null;
        for (const asset of imageConceptAssets) {
            const data = await readJsonAsset(asset.storagePath);
            if (data && Array.isArray(data)) {
                imageConcepts = data;
                break;
            }
        }
        if (!imageConcepts) {
            const allImageAssets = job.assets.filter((a) => a.assetType === shared_1.AssetType.Image && a.status === 'completed');
            for (const asset of allImageAssets) {
                const data = await readJsonAsset(asset.storagePath);
                if (data) {
                    imageConcepts = Array.isArray(data) ? data : [data];
                    break;
                }
            }
        }
        if (imageConcepts && imageConcepts.length > 0) {
            sendEvent({
                event: 'partial_result',
                data: {
                    jobId: job.id,
                    state: currentState,
                    partialImageConcepts: imageConcepts,
                    timestamp: new Date().toISOString(),
                },
            });
        }
    }
    // After GeneratingVideo → GeneratingGif: emit partialStoryboard + partialVideoBrief
    if (previousState === shared_1.JobState.GeneratingVideo &&
        currentState === shared_1.JobState.GeneratingGif) {
        const storyboardAsset = findAssetByType(job, shared_1.AssetType.Storyboard);
        let storyboardData = null;
        if (storyboardAsset) {
            storyboardData = await readJsonAsset(storyboardAsset.storagePath);
        }
        const videoBriefAsset = job.assets.find((a) => a.status === 'completed' && a.storagePath.includes('video-brief'));
        let videoBriefData = null;
        if (videoBriefAsset) {
            videoBriefData = await readJsonAsset(videoBriefAsset.storagePath);
        }
        if (storyboardData || videoBriefData) {
            sendEvent({
                event: 'partial_result',
                data: {
                    jobId: job.id,
                    state: currentState,
                    ...(storyboardData && { partialStoryboard: storyboardData }),
                    ...(videoBriefData && { partialVideoBrief: videoBriefData }),
                    timestamp: new Date().toISOString(),
                },
            });
        }
    }
    // After GeneratingGif → ComposingPackage: emit GIF asset metadata
    if (previousState === shared_1.JobState.GeneratingGif &&
        currentState === shared_1.JobState.ComposingPackage) {
        const gifAssets = job.assets.filter((a) => a.assetType === shared_1.AssetType.Gif && a.status === 'completed');
        for (const gifAsset of gifAssets) {
            const gifMetadata = await readJsonAsset(gifAsset.storagePath);
            if (gifMetadata) {
                sendEvent({
                    event: 'partial_result',
                    data: {
                        jobId: job.id,
                        state: currentState,
                        partialGifAsset: gifMetadata,
                        timestamp: new Date().toISOString(),
                    },
                });
                break;
            }
        }
    }
}
/**
 * GET /api/v1/jobs/:jobId/stream
 * SSE endpoint emitting job state changes and partial results.
 */
router.get('/:jobId/stream', async (req, res, next) => {
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
        // Set SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Correlation-ID': req.correlationId,
        });
        let lastState = null;
        const sendEvent = (eventData) => {
            res.write(`event: ${eventData.event}\n`);
            res.write(`data: ${JSON.stringify(eventData.data)}\n\n`);
        };
        const poll = async () => {
            try {
                const currentJob = await (0, firestore_1.getJob)(jobId);
                if (!currentJob) {
                    sendEvent({
                        event: 'error',
                        data: {
                            jobId,
                            state: shared_1.JobState.Failed,
                            errorMessage: 'Job not found',
                            timestamp: new Date().toISOString(),
                        },
                    });
                    res.end();
                    return;
                }
                if (currentJob.state !== lastState) {
                    const previousState = lastState;
                    lastState = currentJob.state;
                    // Always emit state_change for every stage transition
                    sendEvent({
                        event: 'state_change',
                        data: {
                            jobId: currentJob.id,
                            state: currentJob.state,
                            assets: currentJob.assets,
                            errorMessage: currentJob.errorMessage,
                            timestamp: new Date().toISOString(),
                            outputIntent: currentJob.outputIntent,
                            steps: currentJob.steps,
                            requestedOutputs: currentJob.requestedOutputs,
                            skippedOutputs: currentJob.skippedOutputs,
                            warnings: currentJob.warnings,
                        },
                    });
                    // Emit partial_result events based on the transition
                    await emitPartialResults(currentJob, previousState, sendEvent);
                }
                if (TERMINAL_STATES.has(currentJob.state)) {
                    sendEvent({
                        event: currentJob.state === shared_1.JobState.Completed ? 'complete' : 'failed',
                        data: {
                            jobId: currentJob.id,
                            state: currentJob.state,
                            assets: currentJob.assets,
                            errorMessage: currentJob.errorMessage,
                            timestamp: new Date().toISOString(),
                            outputIntent: currentJob.outputIntent,
                            steps: currentJob.steps,
                            requestedOutputs: currentJob.requestedOutputs,
                            skippedOutputs: currentJob.skippedOutputs,
                            warnings: currentJob.warnings,
                        },
                    });
                    res.end();
                    return;
                }
                // Schedule next poll
                pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
            }
            catch (err) {
                logger_1.logger.error(`SSE poll error for job ${jobId}`, {
                    correlationId: req.correlationId,
                });
                res.end();
            }
        };
        let pollTimer;
        // Clean up on client disconnect
        req.on('close', () => {
            clearTimeout(pollTimer);
            logger_1.logger.info(`SSE connection closed for job ${jobId}`, {
                correlationId: req.correlationId,
            });
        });
        // Start polling
        await poll();
    }
    catch (err) {
        next(err);
    }
});
//# sourceMappingURL=stream.js.map