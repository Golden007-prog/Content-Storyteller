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

function writeLog(entry: LogEntry): void {
  process.stdout.write(JSON.stringify(entry) + '\n');
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const entry: LogEntry = {
      severity: res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARNING' : 'INFO',
      message: `${req.method} ${req.path} ${res.statusCode}`,
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
    };
    writeLog(entry);
  });

  next();
}

export const logger = {
  info(message: string, context?: Record<string, unknown>): void {
    writeLog({
      severity: 'INFO',
      message,
      timestamp: new Date().toISOString(),
      ...context,
    } as LogEntry);
  },
  warn(message: string, context?: Record<string, unknown>): void {
    writeLog({
      severity: 'WARNING',
      message,
      timestamp: new Date().toISOString(),
      ...context,
    } as LogEntry);
  },
  error(message: string, context?: Record<string, unknown>): void {
    writeLog({
      severity: 'ERROR',
      message,
      timestamp: new Date().toISOString(),
      ...context,
    } as LogEntry);
  },
};
