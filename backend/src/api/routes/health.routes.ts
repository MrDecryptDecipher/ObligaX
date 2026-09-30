import { Router } from 'express';
import { HealthController } from '../controllers/health.controller';

export const createHealthRouter = (controller: HealthController): Router => {
  const router = Router();
  router.get('/', controller.check);
  return router;
};
