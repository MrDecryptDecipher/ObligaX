import { Router } from 'express';
import { ObligationController } from '../controllers/obligation.controller';
import { validateBody } from '../middleware/validation.middleware';
import {
  CreateObligationSchema,
  CancelObligationSchema,
  ProposeAmendmentSchema,
  RaiseDisputeSchema
} from '../../schemas/obligation.schema';

export const createObligationRouter = (controller: ObligationController): Router => {
  const router = Router();

  router.post('/', validateBody(CreateObligationSchema), controller.create);
  router.get('/', controller.query);
  router.get('/:id', controller.getById);
  router.post('/:id/accept', controller.accept);
  router.post('/:id/confirm', controller.confirm);
  router.post('/:id/cancel', validateBody(CancelObligationSchema), controller.cancel);
  router.post('/:id/amendments', validateBody(ProposeAmendmentSchema), controller.proposeAmendment);
  router.post('/:id/disputes', validateBody(RaiseDisputeSchema), controller.raiseDispute);

  return router;
};
