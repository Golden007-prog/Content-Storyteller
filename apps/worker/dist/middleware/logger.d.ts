export interface WorkerLogEntry {
    severity: string;
    message: string;
    timestamp: string;
    correlationId?: string;
    jobId?: string;
    [key: string]: unknown;
}
export declare function createLogger(correlationId?: string, jobId?: string): {
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
};
/** Default logger without job context — used for server-level logging */
export declare const logger: {
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
};
//# sourceMappingURL=logger.d.ts.map