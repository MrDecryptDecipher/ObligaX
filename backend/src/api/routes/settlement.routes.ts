import { Router } from 'express';
import { SettlementController } from '../controllers/settlement.controller';
import { validateBody } from '../middleware/validation.middleware';
import { InitiateSettlementSchema, RetrySettlementSchema } from '../../schemas/settlement.schema';

export const createSettlementRouter = (controller: SettlementController): Router => {
  const router = Router();

  router.post('/', validateBody(InitiateSettlementSchema), controller.initiate);
  router.get('/:id', controller.getById);
  router.post('/:id/process', controller.process);
  router.post('/retry', validateBody(RetrySettlementSchema), controller.retry);

  return router;
};
