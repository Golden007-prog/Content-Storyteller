import {
  PipelineContext,
  PipelineStage,
  JobState,
  OutputIntent,
  StepsMap,
  JobWarning,
} from '@content-storyteller/shared';
import {
  getJob,
  updateJobState,
  initializeStepsMetadata,
  updateStepMetadata,
  updateJobWithWarnings,
} from '../services/firestore';
import { createLogger } from '../middleware/logger';
import { ProcessInput } from './process-input';
import { GenerateCopy } from './generate-copy';
import { GenerateImages } from './generate-images';
import { GenerateVideo } from './generate-video';
import { GenerateGif } from './generate-gif';
import { ComposePackage } from './compose-package';

/** Maximum pipeline execution time: 14 minutes (leaves 1 min headroom for Cloud Run's 900s timeout) */
const PIPELINE_TIMEOUT_MS = 14 * 60 * 1000;

/**
 * Configuration for a single pipeline stage, mapping it to its
 * OutputIntent key and criticality level.
 */
interface StageConfig {
  stage: PipelineStage;
  stepsKey: keyof StepsMap;
  intentKey: keyof OutputIntent | null; // null = always run
  critical: boolean; // true = failure → job fails; false = failure → warning + continue
}

/**
 * Ordered list of pipeline stages with their intent mapping and criticality.
 */
const STAGE_CONFIGS: StageConfig[] = [
  { stage: new ProcessInput(), stepsKey: 'processInput', intentKey: null, critical: true },
  { stage: new GenerateCopy(), stepsKey: 'generateCopy', intentKey: 'wantsCopy', critical: true },
  { stage: new GenerateImages(), stepsKey: 'generateImages', intentKey: 'wantsImage', critical: false },
  { stage: new GenerateVideo(), stepsKey: 'generateVideo', intentKey: 'wantsVideo', critical: false },
  { stage: new GenerateGif(), stepsKey: 'generateGif', intentKey: 'wantsGif', critical: false },
  { stage: new ComposePackage(), stepsKey: 'composePackage', intentKey: null, critical: true },
];

/**
 * Default full-package OutputIntent for backward compatibility
 * when a job has no outputIntent set.
 */
function defaultOutputIntent(): OutputIntent {
  return {
    wantsCopy: true,
    wantsHashtags: true,
    wantsImage: true,
    wantsVideo: true,
    wantsStoryboard: true,
    wantsVoiceover: true,
    wantsCarousel: true,
    wantsThread: true,
    wantsLinkedInPost: true,
    wantsGif: true,
  };
}

/**
 * Create the initial StepsMap with all stages set to 'queued'.
 */
function createInitialSteps(): StepsMap {
  return {
    processInput: { status: 'queued' },
    generateCopy: { status: 'queued' },
    generateImages: { status: 'queued' },
    generateVideo: { status: 'queued' },
    generateGif: { status: 'queued' },
    composePackage: { status: 'queued' },
  };
}

/**
 * Run the generation pipeline: execute each stage sequentially with
 * conditional execution based on OutputIntent, step metadata tracking,
 * partial completion for non-critical failures, 10-minute timeout
 * enforcement, and error handling.
 */
export async function runPipeline(context: PipelineContext): Promise<void> {
  const log = createLogger(context.correlationId, context.jobId);
  const startTime = Date.now();

  log.info('Pipeline started', { stageCount: STAGE_CONFIGS.length });

  // Store pipeline start time in workingData so stages can calculate remaining time
  context.workingData._pipelineStartTime = startTime;
  context.workingData._pipelineTimeoutMs = PIPELINE_TIMEOUT_MS;

  // Read the Job document to get outputIntent
  const job = await getJob(context.jobId);
  const outputIntent: OutputIntent = job?.outputIntent ?? defaultOutputIntent();
  log.info('Pipeline outputIntent resolved', { outputIntent });

  // Initialize steps metadata — all 5 steps set to 'queued'
  const initialSteps = createInitialSteps();
  await initializeStepsMetadata(context.jobId, initialSteps);

  // Track outputs and warnings
  const completedOutputs: string[] = [];
  const skippedOutputs: string[] = [];
  const warnings: JobWarning[] = [];

  for (const config of STAGE_CONFIGS) {
    const { stage, stepsKey, intentKey, critical } = config;

    // Check global timeout before starting each stage
    const elapsed = Date.now() - startTime;
    if (elapsed >= PIPELINE_TIMEOUT_MS) {
      const timeoutMsg = `Pipeline timed out after ${Math.round(elapsed / 1000)}s (limit: ${PIPELINE_TIMEOUT_MS / 1000}s)`;
      log.error(timeoutMsg);
      await updateStepMetadata(context.jobId, stepsKey, {
        status: 'failed',
        errorMessage: timeoutMsg,
        completedAt: new Date(),
      });
      await updateJobWithWarnings(context.jobId, {
        state: JobState.Failed,
        errorMessage: timeoutMsg,
        completedOutputs,
        skippedOutputs,
        warnings,
      });
      throw new Error(timeoutMsg);
    }

    // Check if this stage should be skipped based on OutputIntent
    if (intentKey !== null && !outputIntent[intentKey]) {
      await updateStepMetadata(context.jobId, stepsKey, { status: 'skipped' });
      skippedOutputs.push(stage.name);
      log.info(`Skipping stage: ${stage.name} (intent ${intentKey} is false)`);
      continue;
    }

    // Stage should execute
    log.info(`Executing stage: ${stage.name}`, { jobState: stage.jobState });

    // Update job state and mark step as running
    await updateJobState(context.jobId, stage.jobState);
    await updateStepMetadata(context.jobId, stepsKey, {
      status: 'running',
      startedAt: new Date(),
    });

    try {
      // Execute the stage with a timeout race
      const remainingMs = PIPELINE_TIMEOUT_MS - (Date.now() - startTime);
      const result = await Promise.race([
        stage.execute(context),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Stage ${stage.name} timed out`)),
            remainingMs,
          ),
        ),
      ]);

      if (!result.success) {
        const errorMsg = result.error || `Stage ${stage.name} failed`;
        log.error(`Stage failed: ${stage.name}`, { error: errorMsg });

        await updateStepMetadata(context.jobId, stepsKey, {
          status: 'failed',
          errorMessage: errorMsg,
          completedAt: new Date(),
        });

        if (critical) {
          await updateJobWithWarnings(context.jobId, {
            state: JobState.Failed,
            errorMessage: errorMsg,
            completedOutputs,
            skippedOutputs,
            warnings,
          });
          throw new Error(errorMsg);
        } else {
          // Non-critical failure: add warning and continue
          warnings.push({
            stage: stage.name,
            message: errorMsg,
            timestamp: new Date(),
            severity: 'warning',
          });
          log.warn(`Non-critical stage failed, continuing: ${stage.name}`, { error: errorMsg });
          continue;
        }
      }

      // Stage succeeded
      await updateStepMetadata(context.jobId, stepsKey, {
        status: 'completed',
        completedAt: new Date(),
      });
      completedOutputs.push(stage.name);

      log.info(`Stage completed: ${stage.name}`, {
        assetCount: result.assets.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Pipeline error at stage ${stage.name}`, { error: message });

      await updateStepMetadata(context.jobId, stepsKey, {
        status: 'failed',
        errorMessage: message,
        completedAt: new Date(),
      });

      if (critical) {
        // Attempt to mark job as failed (may already be marked)
        try {
          await updateJobWithWarnings(context.jobId, {
            state: JobState.Failed,
            errorMessage: message,
            completedOutputs,
            skippedOutputs,
            warnings,
          });
        } catch {
          // Best-effort — job may already be in failed state
        }
        throw err;
      } else {
        // Non-critical failure: add warning and continue
        warnings.push({
          stage: stage.name,
          message,
          timestamp: new Date(),
          severity: 'warning',
        });
        log.warn(`Non-critical stage failed, continuing: ${stage.name}`, { error: message });
        continue;
      }
    }
  }

  // All stages processed — write final completed state
  await updateJobWithWarnings(context.jobId, {
    state: JobState.Completed,
    completedOutputs,
    skippedOutputs,
    warnings,
  });

  log.info('Pipeline completed successfully', {
    totalDurationMs: Date.now() - startTime,
    completedOutputs,
    skippedOutputs,
    warningCount: warnings.length,
  });
}
