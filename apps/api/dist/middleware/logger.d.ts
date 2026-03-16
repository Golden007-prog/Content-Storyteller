import { Request, Response, NextFunction } from 'express';
export interface LogEntry {
    severity: string;
    message: string;
    timestamp: string;
    correlationId?: string;
    method?: string;
    path?: string;
    statusCode?: number;
    durationMs?: number;
}
export declare function requestLogger(req: Request, res: Response, next: NextFunction): void;
export declare const logger: {
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
};
//# sourceMappingURL=logger.d.ts.map