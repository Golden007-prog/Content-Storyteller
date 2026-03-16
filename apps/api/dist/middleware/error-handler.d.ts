import { Request, Response, NextFunction } from 'express';
export declare function errorHandler(err: Error & {
    statusCode?: number;
    code?: string;
}, req: Request, res: Response, _next: NextFunction): void;
//# sourceMappingURL=error-handler.d.ts.map