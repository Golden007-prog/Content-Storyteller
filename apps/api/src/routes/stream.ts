import { Router, Request, Response, NextFunction } from 'express';
import { getJob } from '../services/firestore';
import { readAsset, generateSignedUrl } from '../services/storage';
import type { AssetReference, AssetReferenceWithUrl } from '@content-storyteller/shared';
import {
  JobState,
  AssetType,
  StreamEventShape,
  Job,
  CopyPackage,
  Storyboard,
  VideoBrief,
  ImageConcept,
} from '@content-storyteller/shared';
import type { GifAssetMetadata } from '@content-storyteller/shared';
import { logger } from '../middleware/logger';

const router = Router();

const POLL_INTERVAL_MS = 2000;
const TERMINAL_STATES = new Set<string>([JobState.Completed, JobState.Failed]);

/**
 * Sign all asset references for SSE delivery.
 * Generates signed URLs (cloud) or proxy URLs (local dev) for each asset.
 * On failure for an individual asset, sets signedUrl to empty string.
 */
async function signAssetsForSSE(assets: AssetReference[]): Promise<AssetReferenceWithUrl[]> {
  return Promise.all(
    assets.map(async (asset): Promise<AssetReferenceWithUrl> => {
      try {
        const signedUrl = await generateSignedUrl(asset.storagePath);
        return { ...asset, signedUrl };
      } catch (err) {
        logger.warn(`Failed to sign asset ${asset.assetId} for SSE delivery`, {
          storagePath: asset.storagePath,
          error: err,
        });
        return { ...asset, signedUrl: '' };
      }
    }),
  );
}

/**
 * Safely read and parse a JSON asset from GCS.
 * Returns null if the asset cannot be read or parsed.
 */
async function readJsonAsset<T>(storagePath: string): Promise<T | null> {
  try {
    const buffer = await readAsset(storagePath);
    return JSON.parse(buffer.toString('utf-8')) as T;
  } catch {
    return null;
  }
}

/**
 * Find the first asset reference matching the given type.
 */
function findAssetByType(job: Job, assetType: AssetType) {
  return job.assets.find((a) => a.assetType === assetType && a.status === 'completed');
}

/**
 * Emit partial_result events based on the state transition.
 * Reads the Job document and relevant assets from GCS to populate partial data.
 */
async function emitPartialResults(
  job: Job,
  previousState: string | null,
  sendEvent: (eventData: StreamEventShape) => void,
): Promise<void> {
  const currentState = job.state;

  // After ProcessInput → GeneratingCopy: emit creativeBrief
  if (
    previousState === JobState.ProcessingInput &&
    currentState === JobState.GeneratingCopy
  ) {
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
  if (
    previousState === JobState.GeneratingCopy &&
    currentState === JobState.GeneratingImages
  ) {
    const copyAsset = findAssetByType(job, AssetType.Copy);
    if (copyAsset) {
      const copyData = await readJsonAsset<CopyPackage>(copyAsset.storagePath);
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
  if (
    previousState === JobState.GeneratingCopy &&
    currentState === JobState.GeneratingVideo
  ) {
    const copyAsset = findAssetByType(job, AssetType.Copy);
    if (copyAsset) {
      const copyData = await readJsonAsset<CopyPackage>(copyAsset.storagePath);
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
  if (
    previousState === JobState.GeneratingCopy &&
    currentState === JobState.ComposingPackage
  ) {
    const copyAsset = findAssetByType(job, AssetType.Copy);
    if (copyAsset) {
      const copyData = await readJsonAsset<CopyPackage>(copyAsset.storagePath);
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
  if (
    previousState === JobState.GeneratingImages &&
    currentState === JobState.GeneratingVideo
  ) {
    // Image concepts are stored with AssetType.ImageConcept
    const imageConceptAssets = job.assets.filter(
      (a) => a.assetType === AssetType.ImageConcept && a.status === 'completed',
    );
    let imageConcepts: ImageConcept[] | null = null;
    for (const asset of imageConceptAssets) {
      const data = await readJsonAsset<ImageConcept[]>(asset.storagePath);
      if (data && Array.isArray(data)) {
        imageConcepts = data;
        break;
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
  if (
    previousState === JobState.GeneratingImages &&
    currentState === JobState.ComposingPackage
  ) {
    const imageConceptAssets = job.assets.filter(
      (a) => a.assetType === AssetType.ImageConcept && a.status === 'completed',
    );
    let imageConcepts: ImageConcept[] | null = null;
    for (const asset of imageConceptAssets) {
      const data = await readJsonAsset<ImageConcept[]>(asset.storagePath);
      if (data && Array.isArray(data)) {
        imageConcepts = data;
        break;
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
  if (
    previousState === JobState.GeneratingVideo &&
    currentState === JobState.ComposingPackage
  ) {
    const storyboardAsset = findAssetByType(job, AssetType.Storyboard);
    let storyboardData: Storyboard | null = null;
    if (storyboardAsset) {
      storyboardData = await readJsonAsset<Storyboard>(storyboardAsset.storagePath);
    }

    // VideoBrief is stored with AssetType.VideoBriefMeta
    const videoBriefAsset = job.assets.find(
      (a) => a.assetType === AssetType.VideoBriefMeta && a.status === 'completed',
    );
    let videoBriefData: VideoBrief | null = null;
    if (videoBriefAsset) {
      videoBriefData = await readJsonAsset<VideoBrief>(videoBriefAsset.storagePath);
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
  if (
    previousState === JobState.GeneratingCopy &&
    currentState === JobState.GeneratingGif
  ) {
    const copyAsset = findAssetByType(job, AssetType.Copy);
    if (copyAsset) {
      const copyData = await readJsonAsset<CopyPackage>(copyAsset.storagePath);
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
  if (
    previousState === JobState.GeneratingImages &&
    currentState === JobState.GeneratingGif
  ) {
    const imageConceptAssets = job.assets.filter(
      (a) => a.assetType === AssetType.ImageConcept && a.status === 'completed',
    );
    let imageConcepts: ImageConcept[] | null = null;
    for (const asset of imageConceptAssets) {
      const data = await readJsonAsset<ImageConcept[]>(asset.storagePath);
      if (data && Array.isArray(data)) {
        imageConcepts = data;
        break;
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
  if (
    previousState === JobState.GeneratingVideo &&
    currentState === JobState.GeneratingGif
  ) {
    const storyboardAsset = findAssetByType(job, AssetType.Storyboard);
    let storyboardData: Storyboard | null = null;
    if (storyboardAsset) {
      storyboardData = await readJsonAsset<Storyboard>(storyboardAsset.storagePath);
    }

    const videoBriefAsset = job.assets.find(
      (a) => a.assetType === AssetType.VideoBriefMeta && a.status === 'completed',
    );
    let videoBriefData: VideoBrief | null = null;
    if (videoBriefAsset) {
      videoBriefData = await readJsonAsset<VideoBrief>(videoBriefAsset.storagePath);
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
  if (
    previousState === JobState.GeneratingGif &&
    currentState === JobState.ComposingPackage
  ) {
    const gifAsset = job.assets.find(
      (a) => a.assetType === AssetType.Gif && a.status === 'completed',
    );

    if (gifAsset) {
      try {
        const signedUrl = await generateSignedUrl(gifAsset.storagePath);
        const gifMetadata: GifAssetMetadata = {
          url: signedUrl,
          mimeType: 'image/gif',
          width: 480,
          height: 480,
          durationMs: 3000,
          loop: true,
          fileSizeBytes: 0,
        };
        sendEvent({
          event: 'partial_result',
          data: {
            jobId: job.id,
            state: currentState,
            partialGifAsset: gifMetadata,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (err) {
        logger.warn(`Failed to generate signed URL for GIF asset ${gifAsset.assetId}`, {
          storagePath: gifAsset.storagePath,
          error: err,
        });
      }
    }
  }
}

/**
 * GET /api/v1/jobs/:jobId/stream
 * SSE endpoint emitting job state changes and partial results.
 */
router.get('/:jobId/stream', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId } = req.params;

    const job = await getJob(jobId);
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

    let lastState: string | null = null;

    const sendEvent = (eventData: StreamEventShape) => {
      res.write(`event: ${eventData.event}\n`);
      res.write(`data: ${JSON.stringify(eventData.data)}\n\n`);
    };

    const poll = async () => {
      try {
        const currentJob = await getJob(jobId);
        if (!currentJob) {
          sendEvent({
            event: 'error',
            data: {
              jobId,
              state: JobState.Failed,
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
          const signedAssets = await signAssetsForSSE(currentJob.assets);
          sendEvent({
            event: 'state_change',
            data: {
              jobId: currentJob.id,
              state: currentJob.state,
              assets: signedAssets,
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
          const terminalSignedAssets = await signAssetsForSSE(currentJob.assets);
          sendEvent({
            event: currentJob.state === JobState.Completed ? 'complete' : 'failed',
            data: {
              jobId: currentJob.id,
              state: currentJob.state,
              assets: terminalSignedAssets,
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
      } catch (err) {
        logger.error(`SSE poll error for job ${jobId}`, {
          correlationId: req.correlationId,
        });
        res.end();
      }
    };

    let pollTimer: ReturnType<typeof setTimeout>;

    // Clean up on client disconnect
    req.on('close', () => {
      clearTimeout(pollTimer);
      logger.info(`SSE connection closed for job ${jobId}`, {
        correlationId: req.correlationId,
      });
    });

    // Start polling
    await poll();
  } catch (err) {
    next(err);
  }
});

export { router as streamRouter };
