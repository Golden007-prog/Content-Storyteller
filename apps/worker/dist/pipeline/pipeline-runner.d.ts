import { PipelineContext } from '@content-storyteller/shared';
/**
 * Run the generation pipeline: execute each stage sequentially with
 * conditional execution based on OutputIntent, step metadata tracking,
 * partial completion for non-critical failures, 10-minute timeout
 * enforcement, and error handling.
 */
export declare function runPipeline(context: PipelineContext): Promise<void>;
//# sourceMappingURL=pipeline-runner.d.ts.map