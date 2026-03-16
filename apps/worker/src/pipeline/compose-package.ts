import {
  PipelineStage,
  PipelineContext,
  StageResult,
  JobState,
  CreativeBrief,
  AssetBundle,
} from '@content-storyteller/shared';
import { getJob, updateJobState } from '../services/firestore';
import { writeAsset } from '../services/storage';
import { createLogger } from '../middleware/logger';
import { randomUUID } from 'crypto';

/**
 * ComposePackage stage: assemble the final Asset Bundle from all
 * generated assets, write the bundle manifest, and mark the Job completed.
 */
export class ComposePackage implements PipelineStage {
  readonly name = 'ComposePackage';
  readonly jobState = JobState.ComposingPackage;

  async execute(context: PipelineContext): Promise<StageResult> {
    const log = createLogger(context.correlationId, context.jobId);
    log.info('ComposePackage stage started');

    try {
      await updateJobState(context.jobId, this.jobState);

      // Read the current Job to gather all assets and fallback notices
      const job = await getJob(context.jobId);
      if (!job) {
        throw new Error(`Job ${context.jobId} not found`);
      }

      const creativeBrief = (context.workingData.creativeBrief ||
        job.creativeBrief) as CreativeBrief;

      const bundle: AssetBundle = {
        jobId: context.jobId,
        completedAt: new Date(),
        assets: job.assets,
        creativeBrief,
        fallbackNotices: job.fallbackNotices,
      };

      // Write the bundle manifest to the assets bucket
      const bundleId = randomUUID();
      const bundlePath = `${context.jobId}/bundle/${bundleId}.json`;
      await writeAsset(
        bundlePath,
        Buffer.from(JSON.stringify(bundle, null, 2), 'utf-8'),
        'application/json',
      );

      // Mark job as completed
      await updateJobState(context.jobId, JobState.Completed);

      log.info('ComposePackage stage completed', {
        assetCount: job.assets.length,
        fallbackCount: job.fallbackNotices.length,
        bundlePath,
      });

      return { success: true, assets: [bundlePath] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('ComposePackage stage failed', { error: message });
      return { success: false, assets: [], error: message };
    }
  }
}
