import { Request, Response, NextFunction } from 'express';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB

export function uploadLimiter(req: Request, res: Response, next: NextFunction): void {
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
