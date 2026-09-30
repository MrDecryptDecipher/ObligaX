import { Router } from 'express';
import { ReconciliationController } from '../controllers/reconciliation.controller';

export const createReconciliationRouter = (controller: ReconciliationController): Router => {
  const router = Router();
  router.post('/run', controller.runReconciliation);
  return router;
};
