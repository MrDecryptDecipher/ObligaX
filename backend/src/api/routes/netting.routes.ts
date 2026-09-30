import { Router } from 'express';
import { NettingController } from '../controllers/netting.controller';
import { validateBody } from '../middleware/validation.middleware';
import { ProposeNettingSchema, RejectNettingSchema } from '../../schemas/netting.schema';

export const createNettingRouter = (controller: NettingController): Router => {
  const router = Router();

  router.get('/proposals', controller.queryProposals);
  router.post('/proposals', validateBody(ProposeNettingSchema), controller.propose);
  router.get('/proposals/:id', controller.getById);
  router.post('/proposals/:id/accept', controller.accept);
  router.post('/proposals/:id/reject', validateBody(RejectNettingSchema), controller.reject);
  router.post('/proposals/:id/execute', controller.execute);
  router.get('/settlements/:id', controller.getSettlement);

  return router;
};
