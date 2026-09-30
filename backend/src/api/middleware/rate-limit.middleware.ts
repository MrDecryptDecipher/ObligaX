import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

export type OperationType = 'read' | 'write' | 'settlement' | 'netting' | 'administrative';

export const resolveOperationType = (req: Request): OperationType => {
  const path = req.path.toLowerCase();
  const method = req.method.toUpperCase();

  if (path.includes('/settlement')) return 'settlement';
  if (path.includes('/netting')) return 'netting';
  if (path.includes('/governance') || path.includes('/admin')) return 'administrative';
  if (method === 'GET') return 'read';
  return 'write';
};

const limits: Record<OperationType, number> = {
  read: 1000,
  write: 300,
  settlement: 100,
  netting: 50,
  administrative: 30
};

export const institutionalKeyGenerator = (req: Request): string => {
  const tenant = (req.headers['x-tenant-id'] as string) || 'DEFAULT_TENANT';
  const party = (req.headers['x-party-id'] as string) || 'ANONYMOUS_PARTY';
  const op = resolveOperationType(req);
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  return `${tenant}:${party}:${op}:${ip}`;
};

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: (req: Request) => {
    const op = resolveOperationType(req);
    return limits[op] || 300;
  },
  keyGenerator: institutionalKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: (req: Request) => ({
    success: false,
    error: {
      code: 'ERR_RATE_LIMIT_EXCEEDED',
      message: `Institutional rate limit exceeded for operation '${resolveOperationType(req)}'. Please retry after 1 minute.`,
      timestamp: new Date().toISOString()
    }
  })
});
