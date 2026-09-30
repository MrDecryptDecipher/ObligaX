import { Request, Response, NextFunction } from 'express';
import { IdempotencyRepository } from '../../infrastructure/database/repositories/idempotency.repository';
import { HashingUtils } from '../../utils/hashing';
import { ConflictError } from '../../types/errors.types';

export const IDEMPOTENCY_KEY_HEADER = 'x-idempotency-key';
export const IDEMPOTENCY_REPLAYED_HEADER = 'x-idempotency-replayed';

export const idempotencyMiddleware = (idempotencyRepo: IdempotencyRepository) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Only apply idempotency to mutating HTTP methods
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }

    const key = req.headers[IDEMPOTENCY_KEY_HEADER] as string;
    if (!key) {
      return next();
    }

    const requestHash = HashingUtils.sha256(req.body);
    const endpoint = req.originalUrl || req.path;

    const lockResult = await idempotencyRepo.lock(key, requestHash, endpoint, req.method);

    if (lockResult === 'CONFLICT') {
      const existing = await idempotencyRepo.get(key);
      if (existing && existing.status === 'COMPLETED') {
        res.setHeader(IDEMPOTENCY_REPLAYED_HEADER, 'true');
        res.status(existing.statusCode || 200).json(existing.body);
        return;
      }
      return next(new ConflictError(`Idempotency key '${key}' reused with a different request payload or has conflicted.`));
    }

    if (lockResult === 'IN_FLIGHT') {
      return next(new ConflictError(`Transaction with idempotency key '${key}' is currently being processed.`));
    }

    // Intercept response to store upon completion
    const originalJson = res.json.bind(res);
    res.json = (body: any): Response => {
      idempotencyRepo.complete(key, res.statusCode, {}, body).catch(err => {
        console.error('Failed to complete idempotency record:', err);
      });
      return originalJson(body);
    };

    next();
  };
};
