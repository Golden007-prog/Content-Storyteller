import { Request, Response, NextFunction } from 'express';
import { ErrorResponse } from '@content-storyteller/shared';

export function errorHandler(
  err: Error & { statusCode?: number; code?: string },
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';

  // Log the full error in development for debugging
  if (!process.env.K_SERVICE) {
    console.error(`[${req.method} ${req.path}] ${statusCode} ${code}:`, err.message);
    if (statusCode === 500) {
      console.error(err.stack);
    }
  }

  const body: ErrorResponse = {
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
