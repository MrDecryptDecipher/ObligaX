import path from 'path';
import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { correlationMiddleware } from './api/middleware/correlation.middleware';
import { idempotencyMiddleware } from './api/middleware/idempotency.middleware';
import { apiRateLimiter } from './api/middleware/rate-limit.middleware';
import { antiReplayMiddleware } from './api/middleware/anti-replay.middleware';
import { errorHandler } from './api/middleware/error.middleware';
import { createApiRouter, AppControllers } from './api/routes';
import { NotFoundError } from './types/errors.types';
import { IdempotencyRepository } from './infrastructure/database/repositories/idempotency.repository';
import { MetricsCollector } from './infrastructure/observability/metrics';

export interface AppDependencies {
  controllers: AppControllers;
  idempotencyRepo: IdempotencyRepository;
}

export const createApp = (deps: AppDependencies): Express => {
  const app = express();

  // Strict enterprise security headers and CORS
  app.use(helmet());
  app.use(cors());

  // Prometheus scrape endpoint (exempt from rate limits and anti-replay)
  app.get('/metrics', async (req: Request, res: Response) => {
    try {
      const metrics = await MetricsCollector.getMetricsString();
      res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.status(200).send(metrics);
    } catch (err) {
      res.status(500).send('# Error collecting metrics');
    }
  });

  // Body parsing with strict institutional payload size limit
  app.use(express.json({ limit: '2mb' }));

  // Tracing & Request ID correlation
  app.use(correlationMiddleware);

  // Rate Limiting per institutional identity
  app.use(apiRateLimiter);

  // Anti-replay controls on high-value endpoints
  app.use(antiReplayMiddleware);

  // Exact-once durable idempotency middleware
  app.use(idempotencyMiddleware(deps.idempotencyRepo));

  // Mount API v1 router
  app.use('/api/v1', createApiRouter(deps.controllers));

  // Serve static institutional console frontend
  const frontendPath = path.resolve(__dirname, '../../frontend');
  app.use(express.static(frontendPath));

  // Catch-all 404 handler for API routes or unhandled paths
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      return next(new NotFoundError('Endpoint', req.originalUrl));
    }
    // Fallback to index.html for SPA-style routing if applicable
    res.sendFile(path.join(frontendPath, 'index.html'), err => {
      if (err) next(new NotFoundError('Page', req.originalUrl));
    });
  });

  // Global structured error handling
  app.use(errorHandler);

  return app;
};
