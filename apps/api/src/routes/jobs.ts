import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import archiver from 'archiver';
import { createJob, getJob, queryAssets } from '../services/firestore';
import { publishGenerationTask } from '../services/pubsub';
import { generateSignedUrl, generateSignedUrlSafe } from '../services/storage';
import { resolveOutputIntent } from '../services/planner/output-intent';
import {
  CreateJobRequest,
  CreateJobResponse,
  PollJobStatusResponse,
  RetrieveAssetsResponse,
  AssetReferenceWithUrl,
  JobState,
  Platform,
  Tone,
  OutputPreference,
  StepsMap,
} from '@content-storyteller/shared';
import { logger } from '../middleware/logger';

const router = Router();

/**
 * POST /api/v1/jobs
 * Create a Job in Firestore (state `queued`), publish Pub/Sub message, return job ID.
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { uploadedMediaPaths, idempotencyKey, promptText, platform, tone, outputPreference } = req.body as {
      uploadedMediaPaths?: string[];
      idempotencyKey?: string;
      promptText?: string;
      platform?: string;
      tone?: string;
      outputPreference?: string;
    };

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
    const validPlatforms = Object.values(Platform) as string[];
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
    const validTones = Object.values(Tone) as string[];
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

    const resolvedIdempotencyKey = idempotencyKey || crypto.randomUUID();

    // Validate outputPreference against OutputPreference enum if provided
    const validOutputPreferences = Object.values(OutputPreference) as string[];
    const validatedOutputPreference: OutputPreference = outputPreference
      ? (validOutputPreferences.includes(outputPreference)
        ? (outputPreference as OutputPreference)
        : (() => {
            res.status(400).json({
              error: {
                code: 'INVALID_OUTPUT_PREFERENCE',
                message: `outputPreference must be one of: ${validOutputPreferences.join(', ')}`,
                correlationId: req.correlationId,
              },
            });
            return null as never;
          })())
      : OutputPreference.Auto;

    // If we already sent a 400 response for invalid outputPreference, stop
    if (res.headersSent) return;

    // Resolve output intent via Planner
    const outputIntent = resolveOutputIntent({
      promptText: promptText!,
      platform: platform as Platform,
      tone: tone as Tone,
      uploadedMediaPaths: uploadedMediaPaths || [],
      outputPreference: validatedOutputPreference,
    });

    // Derive requestedOutputs from the OutputIntent
    const requestedOutputs: string[] = [];
    if (outputIntent.wantsCopy) requestedOutputs.push('copy');
    if (outputIntent.wantsHashtags) requestedOutputs.push('hashtags');
    if (outputIntent.wantsImage) requestedOutputs.push('image');
    if (outputIntent.wantsVideo) requestedOutputs.push('video');
    if (outputIntent.wantsStoryboard) requestedOutputs.push('storyboard');
    if (outputIntent.wantsVoiceover) requestedOutputs.push('voiceover');
    if (outputIntent.wantsCarousel) requestedOutputs.push('carousel');
    if (outputIntent.wantsThread) requestedOutputs.push('thread');
    if (outputIntent.wantsLinkedInPost) requestedOutputs.push('linkedInPost');
    if (outputIntent.wantsGif) requestedOutputs.push('gif');

    // Initialize steps metadata
    const steps: StepsMap = {
      processInput: { status: 'queued' },
      generateCopy: { status: 'queued' },
      generateImages: { status: 'queued' },
      generateVideo: { status: 'queued' },
      generateGif: { status: 'queued' },
      composePackage: { status: 'queued' },
    };

    const job = await createJob({
      correlationId: req.correlationId,
      idempotencyKey: resolvedIdempotencyKey,
      uploadedMediaPaths: uploadedMediaPaths || [],
      promptText,
      platform: platform as Platform,
      tone: tone as Tone,
      outputPreference: validatedOutputPreference,
      outputIntent,
      requestedOutputs,
      steps,
    });

    await publishGenerationTask(
      { jobId: job.id, idempotencyKey: resolvedIdempotencyKey },
      req.correlationId,
    );

    logger.info('Output intent resolved', { outputPreference: validatedOutputPreference, outputIntent, requestedOutputs, correlationId: req.correlationId });

    logger.info(`Job created: ${job.id}`, { correlationId: req.correlationId });

    const response: CreateJobResponse = {
      jobId: job.id,
      state: job.state,
      createdAt: job.createdAt,
    };

    res.status(201).json(response);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (
      errMsg.includes('ECONNREFUSED') ||
      errMsg.includes('Could not load the default credentials') ||
      errMsg.includes('ENOTFOUND') ||
      errMsg.includes('getaddrinfo')
    ) {
      logger.error('GCP service unavailable during job creation', {
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
router.get('/:jobId', async (req: Request, res: Response, next: NextFunction) => {
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

    const response: PollJobStatusResponse = {
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
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/jobs/:jobId/assets
 * Retrieve completed asset bundle.
 */
router.get('/:jobId/assets', async (req: Request, res: Response, next: NextFunction) => {
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

    if (job.state !== JobState.Completed) {
      res.status(409).json({
        error: {
          code: 'JOB_NOT_COMPLETED',
          message: `Job ${jobId} is not yet completed (current state: ${job.state})`,
          correlationId: req.correlationId,
        },
      });
      return;
    }

    const assets = await queryAssets(jobId);

    // Define fallback and renderable asset types
    const fallbackTypes: string[] = ['image_concept', 'video_brief_meta', 'gif_creative_direction'];
    const renderableTypes: string[] = ['image', 'video', 'gif'];

    // Generate signed URLs and enrich each asset reference
    const assetsWithUrls: AssetReferenceWithUrl[] = await Promise.all(
      assets.map(async (asset) => {
        const isFallback = fallbackTypes.includes(asset.assetType);
        const isRenderable = renderableTypes.includes(asset.assetType);
        const result = await generateSignedUrlSafe(asset.storagePath);
        if (result.error) {
          logger.error(`Failed to generate signed URL for asset ${asset.assetId}`, {
            correlationId: req.correlationId,
            error: result.error,
          });
          return {
            ...asset,
            signedUrl: '',
            isFallback,
            previewUrl: '',
            downloadUrl: '',
            urlError: result.error,
          };
        }
        return {
          ...asset,
          signedUrl: result.url,
          isFallback,
          previewUrl: isRenderable ? result.url : '',
          downloadUrl: !isFallback ? result.url : '',
        };
      }),
    );

    const response: RetrieveAssetsResponse = {
      bundle: {
        jobId: job.id,
        completedAt: job.updatedAt,
        assets: assetsWithUrls,
        creativeBrief: job.creativeBrief!,
        fallbackNotices: job.fallbackNotices,
      },
    };

    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/jobs/:jobId/bundle
 * Return an Asset Manifest JSON or ZIP archive of all completed assets.
 * Use ?format=zip to get a ZIP archive.
 */
router.get('/:jobId/bundle', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId } = req.params;
    const format = req.query.format as string | undefined;
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

    const assets = await queryAssets(jobId);
    const completedAssets = assets.filter((a) => a.status === 'completed');

    const assetsWithUrls: AssetReferenceWithUrl[] = await Promise.all(
      completedAssets.map(async (asset) => {
        try {
          const signedUrl = await generateSignedUrl(asset.storagePath);
          return { ...asset, signedUrl };
        } catch (err) {
          logger.error(`Failed to generate signed URL for asset ${asset.assetId}`, {
            correlationId: req.correlationId,
            error: err,
          });
          return { ...asset, signedUrl: '' };
        }
      }),
    );

    // ZIP streaming mode
    if (format === 'zip') {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="content-package-${jobId}.zip"`,
      );

      const archive = archiver('zip', { zlib: { level: 5 } });
      archive.on('error', (err) => {
        logger.error('Archive error', { correlationId: req.correlationId, error: err });
        if (!res.headersSent) {
          res.status(500).json({ error: { message: 'ZIP generation failed' } });
        }
      });
      archive.pipe(res);

      // Classify assets into deliverables vs fallback metadata
      const fallbackTypes: string[] = ['image_concept', 'video_brief_meta', 'gif_creative_direction'];

      // Text asset type to descriptive filename mapping
      const textFilenameMap: Record<string, string> = {
        copy: 'copy-package.txt',
        caption: 'caption.txt',
        hashtags: 'hashtags.txt',
        call_to_action: 'call-to-action.txt',
        voiceover_script: 'voiceover-script.txt',
        on_screen_text: 'on-screen-text.txt',
        storyboard: 'storyboard.txt',
      };

      // Fallback metadata type to descriptive filename mapping
      const metadataFilenameMap: Record<string, string> = {
        image_concept: 'image-concept.json',
        video_brief_meta: 'video-brief.json',
        gif_creative_direction: 'gif-direction.json',
      };

      // Track image counter for descriptive naming
      let imageCounter = 0;
      const manifestEntries: Array<{
        filename: string;
        assetType: string;
        assetId: string;
        isFallback: boolean;
        storagePath: string;
      }> = [];

      for (const asset of assetsWithUrls) {
        if (!asset.signedUrl) continue;

        const isFallback = fallbackTypes.includes(asset.assetType);

        try {
          const fetchRes = await fetch(asset.signedUrl);
          if (!fetchRes.ok || !fetchRes.body) continue;
          const arrayBuffer = await fetchRes.arrayBuffer();
          const contentBuffer = Buffer.from(arrayBuffer);

          let filename: string;

          if (isFallback) {
            // Place fallback metadata in metadata/ subdirectory
            filename = `metadata/${metadataFilenameMap[asset.assetType] || `${asset.assetId}.json`}`;
          } else if (asset.assetType === 'image') {
            // Descriptive image filenames: image-1.png, image-2.png, etc.
            imageCounter++;
            const ext = asset.storagePath.endsWith('.jpg') ? '.jpg' : '.png';
            filename = `image-${imageCounter}${ext}`;
          } else if (asset.assetType === 'video') {
            filename = 'video.mp4';
          } else if (asset.assetType === 'gif') {
            const ext = asset.storagePath.endsWith('.mp4') ? '.mp4' : '.gif';
            filename = ext === '.gif' ? 'animation.gif' : 'loop.mp4';
          } else if (textFilenameMap[asset.assetType]) {
            // Text deliverables with descriptive filenames
            filename = textFilenameMap[asset.assetType];
          } else {
            // Fallback for unknown types
            filename = asset.storagePath.split('/').pop() || `${asset.assetId}.bin`;
          }

          archive.append(contentBuffer, { name: filename });
          manifestEntries.push({
            filename,
            assetType: asset.assetType,
            assetId: asset.assetId,
            isFallback,
            storagePath: asset.storagePath,
          });

          // For storyboard, also include a .json version alongside the .txt
          if (asset.assetType === 'storyboard') {
            // Try to parse the content as JSON; if it's already JSON, include as storyboard.json
            try {
              const textContent = contentBuffer.toString('utf-8');
              JSON.parse(textContent);
              // Content is valid JSON — include as storyboard.json
              archive.append(contentBuffer, { name: 'storyboard.json' });
              manifestEntries.push({
                filename: 'storyboard.json',
                assetType: 'storyboard',
                assetId: asset.assetId,
                isFallback: false,
                storagePath: asset.storagePath,
              });
            } catch {
              // Not valid JSON — skip the .json version
            }
          }
        } catch (err) {
          logger.error(`Failed to fetch asset for ZIP: ${asset.assetId}`, {
            correlationId: req.correlationId,
            error: err,
          });
        }
      }

      // Generate and include manifest.json at ZIP root
      const manifestJson = {
        jobId,
        generatedAt: new Date().toISOString(),
        platform: job.platform ?? null,
        tone: job.tone ?? null,
        assets: manifestEntries,
      };
      archive.append(JSON.stringify(manifestJson, null, 2), { name: 'manifest.json' });

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
  } catch (err) {
    next(err);
  }
});

export { router as jobsRouter };
