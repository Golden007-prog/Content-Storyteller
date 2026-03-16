"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPipeline = runPipeline;
const shared_1 = require("@content-storyteller/shared");
const firestore_1 = require("../services/firestore");
const logger_1 = require("../middleware/logger");
const process_input_1 = require("./process-input");
const generate_copy_1 = require("./generate-copy");
const generate_images_1 = require("./generate-images");
const generate_video_1 = require("./generate-video");
const generate_gif_1 = require("./generate-gif");
const compose_package_1 = require("./compose-package");
/** Maximum pipeline execution time: 10 minutes */
const PIPELINE_TIMEOUT_MS = 10 * 60 * 1000;
/**
 * Ordered list of pipeline stages with their intent mapping and criticality.
 */
const STAGE_CONFIGS = [
    { stage: new process_input_1.ProcessInput(), stepsKey: 'processInput', intentKey: null, critical: true },
    { stage: new generate_copy_1.GenerateCopy(), stepsKey: 'generateCopy', intentKey: 'wantsCopy', critical: true },
    { stage: new generate_images_1.GenerateImages(), stepsKey: 'generateImages', intentKey: 'wantsImage', critical: false },
    { stage: new generate_video_1.GenerateVideo(), stepsKey: 'generateVideo', intentKey: 'wantsVideo', critical: false },
    { stage: new generate_gif_1.GenerateGif(), stepsKey: 'generateGif', intentKey: 'wantsGif', critical: false },
    { stage: new compose_package_1.ComposePackage(), stepsKey: 'composePackage', intentKey: null, critical: true },
];
/**
 * Default full-package OutputIntent for backward compatibility
 * when a job has no outputIntent set.
 */
function defaultOutputIntent() {
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
function createInitialSteps() {
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
async function runPipeline(context) {
    const log = (0, logger_1.createLogger)(context.correlationId, context.jobId);
    const startTime = Date.now();
    log.info('Pipeline started', { stageCount: STAGE_CONFIGS.length });
    // Read the Job document to get outputIntent
    const job = await (0, firestore_1.getJob)(context.jobId);
    const outputIntent = job?.outputIntent ?? defaultOutputIntent();
    log.info('Pipeline outputIntent resolved', { outputIntent });
    // Initialize steps metadata — all 5 steps set to 'queued'
    const initialSteps = createInitialSteps();
    await (0, firestore_1.initializeStepsMetadata)(context.jobId, initialSteps);
    // Track outputs and warnings
    const completedOutputs = [];
    const skippedOutputs = [];
    const warnings = [];
    for (const config of STAGE_CONFIGS) {
        const { stage, stepsKey, intentKey, critical } = config;
        // Check global timeout before starting each stage
        const elapsed = Date.now() - startTime;
        if (elapsed >= PIPELINE_TIMEOUT_MS) {
            const timeoutMsg = `Pipeline timed out after ${Math.round(elapsed / 1000)}s (limit: ${PIPELINE_TIMEOUT_MS / 1000}s)`;
            log.error(timeoutMsg);
            await (0, firestore_1.updateStepMetadata)(context.jobId, stepsKey, {
                status: 'failed',
                errorMessage: timeoutMsg,
                completedAt: new Date(),
            });
            await (0, firestore_1.updateJobWithWarnings)(context.jobId, {
                state: shared_1.JobState.Failed,
                errorMessage: timeoutMsg,
                completedOutputs,
                skippedOutputs,
                warnings,
            });
            throw new Error(timeoutMsg);
        }
        // Check if this stage should be skipped based on OutputIntent
        if (intentKey !== null && !outputIntent[intentKey]) {
            await (0, firestore_1.updateStepMetadata)(context.jobId, stepsKey, { status: 'skipped' });
            skippedOutputs.push(stage.name);
            log.info(`Skipping stage: ${stage.name} (intent ${intentKey} is false)`);
            continue;
        }
        // Stage should execute
        log.info(`Executing stage: ${stage.name}`, { jobState: stage.jobState });
        // Update job state and mark step as running
        await (0, firestore_1.updateJobState)(context.jobId, stage.jobState);
        await (0, firestore_1.updateStepMetadata)(context.jobId, stepsKey, {
            status: 'running',
            startedAt: new Date(),
        });
        try {
            // Execute the stage with a timeout race
            const remainingMs = PIPELINE_TIMEOUT_MS - (Date.now() - startTime);
            const result = await Promise.race([
                stage.execute(context),
                new Promise((_, reject) => setTimeout(() => reject(new Error(`Stage ${stage.name} timed out`)), remainingMs)),
            ]);
            if (!result.success) {
                const errorMsg = result.error || `Stage ${stage.name} failed`;
                log.error(`Stage failed: ${stage.name}`, { error: errorMsg });
                await (0, firestore_1.updateStepMetadata)(context.jobId, stepsKey, {
                    status: 'failed',
                    errorMessage: errorMsg,
                    completedAt: new Date(),
                });
                if (critical) {
                    await (0, firestore_1.updateJobWithWarnings)(context.jobId, {
                        state: shared_1.JobState.Failed,
                        errorMessage: errorMsg,
                        completedOutputs,
                        skippedOutputs,
                        warnings,
                    });
                    throw new Error(errorMsg);
                }
                else {
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
            await (0, firestore_1.updateStepMetadata)(context.jobId, stepsKey, {
                status: 'completed',
                completedAt: new Date(),
            });
            completedOutputs.push(stage.name);
            log.info(`Stage completed: ${stage.name}`, {
                assetCount: result.assets.length,
            });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.error(`Pipeline error at stage ${stage.name}`, { error: message });
            await (0, firestore_1.updateStepMetadata)(context.jobId, stepsKey, {
                status: 'failed',
                errorMessage: message,
                completedAt: new Date(),
            });
            if (critical) {
                // Attempt to mark job as failed (may already be marked)
                try {
                    await (0, firestore_1.updateJobWithWarnings)(context.jobId, {
                        state: shared_1.JobState.Failed,
                        errorMessage: message,
                        completedOutputs,
                        skippedOutputs,
                        warnings,
                    });
                }
                catch {
                    // Best-effort — job may already be in failed state
                }
                throw err;
            }
            else {
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
    await (0, firestore_1.updateJobWithWarnings)(context.jobId, {
        state: shared_1.JobState.Completed,
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
//# sourceMappingURL=pipeline-runner.js.map