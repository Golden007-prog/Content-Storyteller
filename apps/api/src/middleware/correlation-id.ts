import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const CORRELATION_HEADER = 'x-correlation-id';

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

export function correlationId(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers[CORRELATION_HEADER] as string) || crypto.randomUUID();
  req.correlationId = id;
  res.setHeader('X-Correlation-ID', id);
  next();
}
