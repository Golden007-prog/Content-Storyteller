"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.createLogger = createLogger;
function writeLog(entry) {
    process.stdout.write(JSON.stringify(entry) + '\n');
}
function createLogger(correlationId, jobId) {
    const baseContext = {};
    if (correlationId)
        baseContext.correlationId = correlationId;
    if (jobId)
        baseContext.jobId = jobId;
    return {
        info(message, context) {
            writeLog({
                severity: 'INFO',
                message,
                timestamp: new Date().toISOString(),
                ...baseContext,
                ...context,
            });
        },
        warn(message, context) {
            writeLog({
                severity: 'WARNING',
                message,
                timestamp: new Date().toISOString(),
                ...baseContext,
                ...context,
            });
        },
        error(message, context) {
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
exports.logger = createLogger();
//# sourceMappingURL=logger.js.map