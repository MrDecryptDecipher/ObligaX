import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app';
import { getCantonConfig } from './infrastructure/canton/canton-config';
import { CantonClient } from './infrastructure/canton/canton-client';
import { DatabaseService } from './infrastructure/database/database';
import { ObligationRepository } from './infrastructure/database/repositories/obligation.repository';
import { NettingRepository } from './infrastructure/database/repositories/netting.repository';
import { SettlementRepository } from './infrastructure/database/repositories/settlement.repository';
import { IdempotencyRepository } from './infrastructure/database/repositories/idempotency.repository';
import { AuditRepository } from './infrastructure/database/repositories/audit.repository';
import { SettlementRailAdapter } from './infrastructure/settlement/settlement-adapter';
import { ProjectionWorker } from './infrastructure/projection/projection-worker';
import { OutboxService } from './infrastructure/messaging/outbox.service';

import { ObligationService } from './application/obligations/obligation.service';
import { AmendmentService } from './application/obligations/amendment.service';
import { DisputeService } from './application/obligations/dispute.service';
import { NettingService } from './application/netting/netting.service';
import { SettlementService } from './application/settlement/settlement.service';
import { ParticipantService } from './application/governance/participant.service';
import { PolicyService } from './application/governance/policy.service';
import { ReconciliationService } from './application/reconciliation/reconciliation.service';

import { ObligationController } from './api/controllers/obligation.controller';
import { NettingController } from './api/controllers/netting.controller';
import { SettlementController } from './api/controllers/settlement.controller';
import { GovernanceController } from './api/controllers/governance.controller';
import { ReconciliationController } from './api/controllers/reconciliation.controller';
import { HealthController } from './api/controllers/health.controller';
import { AuditLogger } from './infrastructure/observability/audit-logger';

export const buildAppContainer = () => {
  const cantonConfig = getCantonConfig();
  const cantonClient = new CantonClient(cantonConfig);

  const obligationRepo = new ObligationRepository();
  const nettingRepo = new NettingRepository();
  const settlementRepo = new SettlementRepository();
  const idempotencyRepo = new IdempotencyRepository();
  const auditRepo = new AuditRepository();
  const railAdapter = new SettlementRailAdapter();

  const obligationService = new ObligationService(obligationRepo, cantonClient, auditRepo);
  const amendmentService = new AmendmentService(obligationRepo, cantonClient, auditRepo);
  const disputeService = new DisputeService(obligationRepo, cantonClient, auditRepo);
  const nettingService = new NettingService(nettingRepo, obligationRepo, cantonClient, auditRepo);
  const settlementService = new SettlementService(settlementRepo, obligationRepo, cantonClient, auditRepo, railAdapter);
  const participantService = new ParticipantService(cantonClient, auditRepo);
  const policyService = new PolicyService(cantonClient, auditRepo);
  const reconciliationService = new ReconciliationService(obligationRepo, cantonClient, settlementRepo, railAdapter);

  const projectionWorker = new ProjectionWorker(
    cantonClient.eventStream,
    obligationRepo,
    settlementRepo,
    nettingRepo
  );

  const obligationController = new ObligationController(obligationService, amendmentService, disputeService);
  const nettingController = new NettingController(nettingService);
  const settlementController = new SettlementController(settlementService);
  const governanceController = new GovernanceController(participantService, policyService, auditRepo);
  const reconciliationController = new ReconciliationController(reconciliationService);
  const healthController = new HealthController(cantonClient);

  const app = createApp({
    controllers: {
      obligation: obligationController,
      netting: nettingController,
      settlement: settlementController,
      governance: governanceController,
      reconciliation: reconciliationController,
      health: healthController
    },
    idempotencyRepo
  });

  return {
    app,
    cantonClient,
    obligationRepo,
    nettingRepo,
    settlementRepo,
    idempotencyRepo,
    auditRepo,
    reconciliationService,
    projectionWorker,
    obligationService,
    nettingService,
    settlementService
  };
};

const startServer = async () => {
  const port = process.env.PORT || 3000;
  await DatabaseService.connect();

  const container = buildAppContainer();
  const { app, projectionWorker } = container;

  // Start background event projection and outbox relay
  await projectionWorker.start();
  await OutboxService.startWorker();

  const server = app.listen(port, () => {
    AuditLogger.info(
      `ObligaX institutional service listening on port ${port} in ${process.env.NODE_ENV || 'development'} mode.`
    );
  });

  const shutdown = async (signal: string) => {
    AuditLogger.info(`Received ${signal}. Gracefully stopping ObligaX server...`);
    projectionWorker.stop();
    OutboxService.stopWorker();

    server.close(async () => {
      await DatabaseService.disconnect();
      AuditLogger.info('ObligaX server gracefully terminated.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

if (require.main === module) {
  startServer().catch(err => {
    AuditLogger.error('Failed to start ObligaX server', err);
    process.exit(1);
  });
}
