export interface WorkerLogEntry {
  severity: string;
  message: string;
  timestamp: string;
  correlationId?: string;
  jobId?: string;
  [key: string]: unknown;
}

function writeLog(entry: WorkerLogEntry): void {
  process.stdout.write(JSON.stringify(entry) + '\n');
}

export function createLogger(correlationId?: string, jobId?: string) {
  const baseContext: Pick<WorkerLogEntry, 'correlationId' | 'jobId'> = {};
  if (correlationId) baseContext.correlationId = correlationId;
  if (jobId) baseContext.jobId = jobId;

  return {
    info(message: string, context?: Record<string, unknown>): void {
      writeLog({
        severity: 'INFO',
        message,
        timestamp: new Date().toISOString(),
        ...baseContext,
        ...context,
      });
    },
    warn(message: string, context?: Record<string, unknown>): void {
      writeLog({
        severity: 'WARNING',
        message,
        timestamp: new Date().toISOString(),
        ...baseContext,
        ...context,
      });
    },
    error(message: string, context?: Record<string, unknown>): void {
      writeLog({
        severity: 'ERROR',
        message,
        timestamp: new Date().toISOString(),
        ...baseContext,
        ...context,
      });
    },
  };
}

/** Default logger without job context — used for server-level logging */
export const logger = createLogger();
