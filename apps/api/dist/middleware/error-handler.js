"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
function errorHandler(err, req, res, _next) {
    const statusCode = err.statusCode || 500;
    const code = err.code || 'INTERNAL_ERROR';
    // Log the full error in development for debugging
    if (!process.env.K_SERVICE) {
        console.error(`[${req.method} ${req.path}] ${statusCode} ${code}:`, err.message);
        if (statusCode === 500) {
            console.error(err.stack);
        }
    }
    const body = {
        error: {
            code,
            message: statusCode === 500
                ? `Internal server error: ${err.message}`
                : (err.message || 'An unexpected error occurred'),
            correlationId: req.correlationId || 'unknown',
        },
    };
    res.status(statusCode).json(body);
}
//# sourceMappingURL=error-handler.js.map