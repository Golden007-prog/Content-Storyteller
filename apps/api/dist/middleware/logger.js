"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.requestLogger = requestLogger;
function writeLog(entry) {
    process.stdout.write(JSON.stringify(entry) + '\n');
}
function requestLogger(req, res, next) {
    const start = Date.now();
    res.on('finish', () => {
        const entry = {
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
exports.logger = {
    info(message, context) {
        writeLog({
            severity: 'INFO',
            message,
            timestamp: new Date().toISOString(),
            ...context,
        });
    },
    warn(message, context) {
        writeLog({
            severity: 'WARNING',
            message,
            timestamp: new Date().toISOString(),
            ...context,
        });
    },
    error(message, context) {
        writeLog({
            severity: 'ERROR',
            message,
            timestamp: new Date().toISOString(),
            ...context,
        });
    },
};
//# sourceMappingURL=logger.js.map