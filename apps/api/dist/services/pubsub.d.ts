import { GenerationTaskMessage } from '@content-storyteller/shared';
/**
 * Publish a GenerationTaskMessage to the configured Pub/Sub topic.
 * Includes correlationId in message attributes for tracing.
 *
 * In local development (non-cloud), also forwards the message directly
 * to the local worker service to bypass Pub/Sub push subscription.
 */
export declare function publishGenerationTask(message: GenerationTaskMessage, correlationId: string): Promise<string>;
//# sourceMappingURL=pubsub.d.ts.map