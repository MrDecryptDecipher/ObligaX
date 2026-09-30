import { Router } from 'express';
import { createObligationRouter } from './obligation.routes';
import { createNettingRouter } from './netting.routes';
import { createSettlementRouter } from './settlement.routes';
import { createGovernanceRouter } from './governance.routes';
import { createReconciliationRouter } from './reconciliation.routes';
import { createHealthRouter } from './health.routes';

import { ObligationController } from '../controllers/obligation.controller';
import { NettingController } from '../controllers/netting.controller';
import { SettlementController } from '../controllers/settlement.controller';
import { GovernanceController } from '../controllers/governance.controller';
import { ReconciliationController } from '../controllers/reconciliation.controller';
import { HealthController } from '../controllers/health.controller';

import { authenticate } from '../middleware/auth.middleware';

export interface AppControllers {
  obligation: ObligationController;
  netting: NettingController;
  settlement: SettlementController;
  governance: GovernanceController;
  reconciliation: ReconciliationController;
  health: HealthController;
}

export const createApiRouter = (controllers: AppControllers): Router => {
  const router = Router();

  // Public / liveness endpoints
  router.use('/health', createHealthRouter(controllers.health));

  // Authenticated enterprise endpoints
  router.use('/obligations', authenticate, createObligationRouter(controllers.obligation));
  router.use('/netting', authenticate, createNettingRouter(controllers.netting));
  router.use('/settlements', authenticate, createSettlementRouter(controllers.settlement));
  router.use('/governance', authenticate, createGovernanceRouter(controllers.governance));
  router.use('/reconciliation', authenticate, createReconciliationRouter(controllers.reconciliation));

  return router;
};
