"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadLimiter = uploadLimiter;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB
function uploadLimiter(req, res, next) {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > MAX_UPLOAD_BYTES) {
        res.status(413).json({
            error: {
                code: 'PAYLOAD_TOO_LARGE',
                message: `Request body exceeds maximum size of 50MB`,
                correlationId: req.correlationId || 'unknown',
            },
        });
        return;
    }
    next();
}
//# sourceMappingURL=upload-limiter.js.map