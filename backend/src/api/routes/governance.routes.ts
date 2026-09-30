import { Router } from 'express';
import { GovernanceController } from '../controllers/governance.controller';
import { validateBody } from '../middleware/validation.middleware';
import { RegisterParticipantSchema } from '../../schemas/participant.schema';
import { CreatePolicySchema } from '../../schemas/governance.schema';

export const createGovernanceRouter = (controller: GovernanceController): Router => {
  const router = Router();

  router.post('/participants', validateBody(RegisterParticipantSchema), controller.registerParticipant);
  router.get('/participants/:id', controller.getParticipant);
  router.post('/participants/:id/activate', controller.activateParticipant);

  router.post('/policy', validateBody(CreatePolicySchema), controller.setPolicy);
  router.get('/policy', controller.getPolicy);

  return router;
};
