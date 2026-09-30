import { Request, Response, NextFunction } from 'express';
import { AppError, ApiErrorResponse } from '../../types/errors.types';
import { AuditLogger } from '../../infrastructure/observability/audit-logger';

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  const traceId = (req as any).traceId || 'unknown-trace';
  const timestamp = new Date().toISOString();
  const path = req.originalUrl || req.path;

  let statusCode = 500;
  let errorCode = 'ERR_INTERNAL_SERVER_ERROR';
  let message = 'An unexpected internal error occurred.';
  let details: unknown = undefined;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorCode = err.errorCode;
    message = err.message;
    details = err.details;
  } else if (err instanceof Error) {
    message = err.message;
  }

  AuditLogger.error(`API Error [${errorCode}] at ${path}: ${message}`, err, {
    traceId,
    statusCode,
    path
  });

  const responsePayload: ApiErrorResponse = {
    success: false,
    error: {
      code: errorCode,
      message,
      details,
      timestamp,
      traceId,
      path
    }
  };

  res.status(statusCode).json(responsePayload);
};
