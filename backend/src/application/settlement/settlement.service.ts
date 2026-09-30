import { SettlementRepository } from '../../infrastructure/database/repositories/settlement.repository';
import { ObligationRepository } from '../../infrastructure/database/repositories/obligation.repository';
import { CantonClient } from '../../infrastructure/canton/canton-client';
import { AuditRepository } from '../../infrastructure/database/repositories/audit.repository';
import { SettlementRailAdapter } from '../../infrastructure/settlement/settlement-adapter';
import { EventPublisher } from '../../infrastructure/messaging/event-publisher';
import {
  InitiateSettlementDto,
  SettlementEntity,
  RetrySettlementDto,
  SettlementFailureReason
} from '../../domain/settlement/settlement.types';
import { SettlementDomainRules } from '../../domain/settlement/settlement.rules';
import { RequestContext } from '../../types/common.types';
import { NotFoundError, ConflictError } from '../../types/errors.types';
import { CantonCommands, TEMPLATES } from '../../infrastructure/canton/canton-commands';

export class SettlementService {
  constructor(
    private readonly settlementRepo: SettlementRepository,
    private readonly obligationRepo: ObligationRepository,
    private readonly cantonClient: CantonClient,
    private readonly auditRepo: AuditRepository,
    private readonly railAdapter: SettlementRailAdapter = new SettlementRailAdapter()
  ) {}

  public async initiateSettlement(dto: InitiateSettlementDto, context: RequestContext): Promise<SettlementEntity> {
    const existing = await this.settlementRepo.findBySettlementId(dto.settlementId);
    if (existing) {
      throw new ConflictError(`Settlement with ID '${dto.settlementId}' already exists.`);
    }

    const obligation = await this.obligationRepo.findByObligationId(dto.obligationId);
    if (!obligation) {
      throw new NotFoundError('Obligation', dto.obligationId);
    }

    SettlementDomainRules.validateInitiate(dto, obligation, context.partyId);

    // 1. Move Obligation to SettlementPending on Canton Ledger
    const pendingResult = await this.cantonClient.submit({
      commandId: `cmd-settle-pending-${dto.obligationId}`,
      actAs: [context.partyId],
      commands: [CantonCommands.enterSettlementPending(obligation.contractId!)]
    });

    const pendingObligationCid = pendingResult.createdContractIds[0]!;
    obligation.status = 'SettlementPending';
    obligation.version += 1;
    obligation.contractId = pendingObligationCid;
    await this.obligationRepo.save(obligation);

    const now = new Date();

    // 2. Create authoritative SettlementInstruction on Canton Ledger
    const createResult = await this.cantonClient.submit({
      commandId: `cmd-create-settle-${dto.settlementId}`,
      actAs: [context.partyId],
      commands: [
        CantonCommands.createSettlementInstruction({
          settlementId: dto.settlementId,
          obligationId: dto.obligationId,
          obligationCid: pendingObligationCid,
          creditor: obligation.creditor,
          debtor: obligation.debtor,
          amount: obligation.amount.toString(),
          currency: obligation.currency,
          status: 'SettlementCreated',
          requestMetadata: {
            sourceSystem: dto.sourceSystem,
            sourceReference: dto.sourceReference,
            settlementRail: dto.settlementRail,
            createdAt: now.toISOString(),
            createdBy: context.partyId
          },
          executionMetadata: null,
          failureMetadata: null
        })
      ]
    });

    const settlementContractId = createResult.createdContractIds[0];

    const settlement: SettlementEntity = {
      settlementId: dto.settlementId,
      contractId: settlementContractId,
      obligationId: dto.obligationId,
      obligationContractId: pendingObligationCid,
      creditor: obligation.creditor,
      debtor: obligation.debtor,
      amount: obligation.amount,
      currency: obligation.currency,
      status: 'SettlementCreated',
      requestMetadata: {
        sourceSystem: dto.sourceSystem,
        sourceReference: dto.sourceReference,
        settlementRail: dto.settlementRail,
        createdAt: now,
        createdBy: context.partyId
      },
      retryCount: 0
    };

    await this.settlementRepo.save(settlement);

    await this.auditRepo.record({
      traceId: context.traceId,
      actor: context.actor,
      action: 'SETTLEMENT_INITIATED',
      resourceType: 'SettlementInstruction',
      resourceId: dto.settlementId,
      contractId: settlementContractId,
      payloadAfter: settlement,
      ipAddress: context.ipAddress
    });

    await EventPublisher.publishEvent('SETTLEMENT_INITIATED', dto.settlementId, settlement, context.traceId);
    return settlement;
  }

  public async processSettlement(settlementId: string, context: RequestContext): Promise<SettlementEntity> {
    const settlement = await this.settlementRepo.findBySettlementId(settlementId);
    if (!settlement) {
      throw new NotFoundError('SettlementInstruction', settlementId);
    }

    SettlementDomainRules.validateStartProcessing(settlement);

    // 1. Move SettlementInstruction to SettlementProcessing on Canton Ledger
    const startResult = await this.cantonClient.submit({
      commandId: `cmd-settle-proc-${settlementId}`,
      actAs: [context.partyId],
      commands: [CantonCommands.startSettlementProcessing(settlement.contractId!)]
    });

    settlement.status = 'SettlementProcessing';
    settlement.contractId = startResult.createdContractIds[0];
    await this.settlementRepo.save(settlement);

    // 2. Dispatch payment instruction to external banking rail
    const railResult = await this.railAdapter.dispatchToRail(settlement);

    if (railResult.success) {
      // 3a. Rail Succeeded -> Complete Settlement & Finalize Obligation to Settled
      const completeResult = await this.cantonClient.submit({
        commandId: `cmd-settle-complete-${settlementId}`,
        actAs: [context.partyId],
        commands: [
          CantonCommands.completeSettlement(
            settlement.contractId!,
            railResult.externalTransactionId!,
            railResult.settlementReference!,
            railResult.processedAt.toISOString()
          )
        ]
      });

      settlement.status = 'SettlementCompleted';
      settlement.contractId = completeResult.createdContractIds[0];
      settlement.executionMetadata = {
        externalTransactionId: railResult.externalTransactionId!,
        settlementReference: railResult.settlementReference!,
        processedAt: railResult.processedAt,
        processedBy: context.partyId
      };
      await this.settlementRepo.save(settlement);

      // Underlying obligation is now Settled
      await this.obligationRepo.updateStatus(settlement.obligationId, 'Settled');

      await this.auditRepo.record({
        traceId: context.traceId,
        actor: context.actor,
        action: 'SETTLEMENT_COMPLETED',
        resourceType: 'SettlementInstruction',
        resourceId: settlementId,
        contractId: settlement.contractId,
        payloadAfter: settlement,
        ipAddress: context.ipAddress
      });

      await EventPublisher.publishEvent('SETTLEMENT_COMPLETED', settlementId, settlement, context.traceId);
    } else {
      // 3b. Rail Failed -> Fail Settlement & Safely Reopen Obligation to Confirmed
      const failResult = await this.cantonClient.submit({
        commandId: `cmd-settle-fail-${settlementId}`,
        actAs: [context.partyId],
        commands: [
          CantonCommands.failSettlement(
            settlement.contractId!,
            railResult.failureReason || 'TechnicalFailure',
            railResult.failureDetails || 'Rail execution rejected',
            railResult.processedAt.toISOString()
          )
        ]
      });

      settlement.status = 'SettlementFailed';
      settlement.contractId = failResult.createdContractIds[0];
      settlement.failureMetadata = {
        reason: (railResult.failureReason as SettlementFailureReason) || 'TechnicalFailure',
        details: railResult.failureDetails || 'Rail execution rejected',
        failedAt: railResult.processedAt,
        failedBy: context.partyId
      };
      await this.settlementRepo.save(settlement);

      // Reopen Obligation safely to Confirmed state so it can be retried or amended
      await this.obligationRepo.updateStatus(settlement.obligationId, 'Confirmed');

      await this.auditRepo.record({
        traceId: context.traceId,
        actor: context.actor,
        action: 'SETTLEMENT_FAILED',
        resourceType: 'SettlementInstruction',
        resourceId: settlementId,
        contractId: settlement.contractId,
        payloadAfter: settlement,
        ipAddress: context.ipAddress
      });

      await EventPublisher.publishEvent('SETTLEMENT_FAILED', settlementId, settlement, context.traceId);
    }

    return settlement;
  }

  public async retrySettlement(dto: RetrySettlementDto, context: RequestContext): Promise<SettlementEntity> {
    const settlement = await this.settlementRepo.findBySettlementId(dto.failedSettlementId);
    if (!settlement) {
      throw new NotFoundError('SettlementInstruction', dto.failedSettlementId);
    }

    const obligation = await this.obligationRepo.findByObligationId(settlement.obligationId);
    if (!obligation) {
      throw new NotFoundError('Obligation', settlement.obligationId);
    }

    SettlementDomainRules.validateRetry(settlement, obligation);

    const now = new Date();

    // Exercise RetrySettlement choice on failed settlement
    const retryResult = await this.cantonClient.submit({
      commandId: `cmd-settle-retry-${dto.newSettlementId}`,
      actAs: [context.partyId],
      commands: [
        CantonCommands.retrySettlement(settlement.contractId!, {
          newSettlementId: dto.newSettlementId,
          settlementReference: dto.settlementReference,
          settlementRail: dto.settlementRail,
          sourceSystem: dto.sourceSystem,
          sourceReference: dto.sourceReference,
          createdAt: now.toISOString()
        })
      ]
    });

    const newSettlementContractId = retryResult.createdContractIds[0]!;
    const newPendingObligationCid = retryResult.createdContractIds[1];

    // Update reopened obligation back to SettlementPending
    obligation.status = 'SettlementPending';
    obligation.version += 1;
    if (newPendingObligationCid) {
      obligation.contractId = newPendingObligationCid;
    }
    await this.obligationRepo.save(obligation);

    const retriedSettlement: SettlementEntity = {
      settlementId: dto.newSettlementId,
      contractId: newSettlementContractId,
      obligationId: settlement.obligationId,
      obligationContractId: obligation.contractId!,
      creditor: settlement.creditor,
      debtor: settlement.debtor,
      amount: settlement.amount,
      currency: settlement.currency,
      status: 'SettlementCreated',
      requestMetadata: {
        sourceSystem: dto.sourceSystem,
        sourceReference: dto.sourceReference,
        settlementRail: dto.settlementRail,
        createdAt: now,
        createdBy: context.partyId
      },
      retryCount: settlement.retryCount + 1
    };

    await this.settlementRepo.save(retriedSettlement);

    await this.auditRepo.record({
      traceId: context.traceId,
      actor: context.actor,
      action: 'SETTLEMENT_RETRIED',
      resourceType: 'SettlementInstruction',
      resourceId: dto.newSettlementId,
      contractId: newSettlementContractId,
      payloadAfter: retriedSettlement,
      ipAddress: context.ipAddress
    });

    await EventPublisher.publishEvent('SETTLEMENT_RETRIED', dto.newSettlementId, retriedSettlement, context.traceId);
    return retriedSettlement;
  }

  public async getSettlement(settlementId: string, context: RequestContext): Promise<SettlementEntity> {
    const settlement = await this.settlementRepo.findBySettlementId(settlementId);
    if (!settlement) {
      throw new NotFoundError('SettlementInstruction', settlementId);
    }
    return settlement;
  }
}
