import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../types/errors.types';

export class AntiReplayStore {
  private static seenNonces: Map<string, number> = new Map();
  private static readonly MAX_WINDOW_MS = 300000; // 5 minutes
  private static readonly CLOCK_SKEW_MS = 60000;  // 1 minute

  public static validateAndRecord(nonce: string, timestampMs: number): void {
    const now = Date.now();

    // Check expiration
    if (now - timestampMs > this.MAX_WINDOW_MS) {
      throw new AppError(400, 'ERR_REPLAY_EXPIRED', 'Request timestamp is older than allowable window (5 minutes).');
    }

    // Check future-issued timestamp
    if (timestampMs - now > this.CLOCK_SKEW_MS) {
      throw new AppError(400, 'ERR_REPLAY_FUTURE', 'Request timestamp is in the future beyond acceptable clock skew.');
    }

    // Check duplicate nonce
    if (this.seenNonces.has(nonce)) {
      throw new AppError(409, 'ERR_REPLAY_DETECTED', `Duplicate nonce '${nonce}' detected! Request rejected as potential replay attack.`);
    }

    this.seenNonces.set(nonce, timestampMs);

    // Periodic sweep
    if (this.seenNonces.size > 10000) {
      for (const [key, ts] of this.seenNonces.entries()) {
        if (now - ts > this.MAX_WINDOW_MS) {
          this.seenNonces.delete(key);
        }
      }
    }
  }

  public static clear(): void {
    this.seenNonces.clear();
  }
}

export const antiReplayMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Enforce on state-mutating high-value endpoints (settlement, netting, callbacks, admin)
  const isHighValue =
    req.method !== 'GET' &&
    (req.path.includes('/settlement') ||
      req.path.includes('/netting') ||
      req.path.includes('/callbacks') ||
      req.path.includes('/governance'));

  if (!isHighValue) {
    return next();
  }

  const nonce = req.headers['x-nonce'] as string;
  const timestampHeader = req.headers['x-timestamp'] as string;

  // If client provides nonce/timestamp, validate strictly
  if (nonce || timestampHeader) {
    if (!nonce || !timestampHeader) {
      return next(new AppError(400, 'ERR_REPLAY_MISSING_HEADERS', 'Both X-Nonce and X-Timestamp headers are required when replay defense is engaged.'));
    }

    const ts = parseInt(timestampHeader, 10);
    if (isNaN(ts)) {
      return next(new AppError(400, 'ERR_REPLAY_INVALID_TIMESTAMP', 'X-Timestamp header must be a valid epoch millisecond integer.'));
    }

    try {
      AntiReplayStore.validateAndRecord(nonce, ts);
    } catch (err) {
      return next(err);
    }
  }

  next();
};
