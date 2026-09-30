import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { correlationMiddleware } from './api/middleware/correlation.middleware';
import { idempotencyMiddleware } from './api/middleware/idempotency.middleware';
import { apiRateLimiter } from './api/middleware/rate-limit.middleware';
import { errorHandler } from './api/middleware/error.middleware';
import { createApiRouter, AppControllers } from './api/routes';
import { NotFoundError } from './types/errors.types';
import { IdempotencyRepository } from './infrastructure/database/repositories/idempotency.repository';

export interface AppDependencies {
  controllers: AppControllers;
  idempotencyRepo: IdempotencyRepository;
}

export const createApp = (deps: AppDependencies): Express => {
  const app = express();

  // Security headers and CORS
  app.use(helmet());
  app.use(cors());

  // Body parsing with strict institutional payload size limit
  app.use(express.json({ limit: '2mb' }));

  // Tracing & Request ID correlation
  app.use(correlationMiddleware);

  // Rate Limiting
  app.use(apiRateLimiter);

  // Exact-once idempotency middleware
  app.use(idempotencyMiddleware(deps.idempotencyRepo));

  // Mount API v1 router
  app.use('/api/v1', createApiRouter(deps.controllers));

  // Catch-all 404 handler
  app.use((req: Request, res: Response, next: NextFunction) => {
    next(new NotFoundError('Endpoint', req.originalUrl));
  });

  // Global structured error handling
  app.use(errorHandler);

  return app;
};
