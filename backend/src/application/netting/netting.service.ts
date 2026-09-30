import { NettingRepository } from '../../infrastructure/database/repositories/netting.repository';
import { ObligationRepository } from '../../infrastructure/database/repositories/obligation.repository';
import { CantonClient } from '../../infrastructure/canton/canton-client';
import { AuditRepository } from '../../infrastructure/database/repositories/audit.repository';
import { EventPublisher } from '../../infrastructure/messaging/event-publisher';
import { OutboxService } from '../../infrastructure/messaging/outbox.service';
import { NettingRiskService } from '../../domain/netting/netting-risk.service';
import { CantonCommandBuilder } from '../../infrastructure/canton/canton-command-builder';
import { ProposeNettingDto, NettingProposalEntity, NettingSettlementEntity } from '../../domain/netting/netting.types';
import { NettingDomainRules } from '../../domain/netting/netting.rules';
import { NettingCalculator } from '../../domain/netting/netting-calculator';
import { RequestContext } from '../../types/common.types';
import { NotFoundError, ConflictError, UnprocessableError } from '../../types/errors.types';
import { CantonCommands, TEMPLATES } from '../../infrastructure/canton/canton-commands';
import { DateUtils } from '../../utils/dates';
import { ObligationEntity } from '../../domain/obligation/obligation.types';

export class NettingService {
  constructor(
    private readonly nettingRepo: NettingRepository,
    private readonly obligationRepo: ObligationRepository,
    private readonly cantonClient: CantonClient,
    private readonly auditRepo: AuditRepository
  ) {}

  public async proposeNetting(dto: ProposeNettingDto, context: RequestContext): Promise<NettingProposalEntity> {
    NettingDomainRules.validateProposalDto(dto);

    const existing = await this.nettingRepo.findProposalById(dto.nettingId);
    if (existing) {
      throw new ConflictError(`Netting proposal '${dto.nettingId}' already exists.`);
    }

    // 1. Gather all obligations and ensure they exist
    const obligations: ObligationEntity[] = [];
    for (const oblId of dto.obligationIds) {
      const obl = await this.obligationRepo.findByObligationId(oblId);
      if (!obl) {
        throw new NotFoundError('Obligation in netting set', oblId);
      }
      obligations.push(obl);
    }

    // Pre-netting risk evaluation
    NettingRiskService.evaluateNettingEligibility(dto.initiator, dto.counterparty, dto.currency, obligations);

    // 2. Perform institutional deterministic netting calculation
    const { lines, terms } = NettingCalculator.calculateBilateralNetting(
      dto.initiator,
      dto.counterparty,
      dto.currency,
      obligations
    );

    const now = new Date();
    const createdDate = DateUtils.parse(now);

    const commandId = CantonCommandBuilder.buildCommandId({
      tenant: context.tenantId || 'OBLIGAX',
      operation: 'NETTING_PROPOSE',
      businessId: dto.nettingId
    });

    // 3. Submit proposal to authoritative Canton Ledger
    const cmdResult = await this.cantonClient.submit({
      commandId,
      actAs: [context.partyId || 'NetworkOperator'],
      commands: [
        {
          type: 'create',
          templateId: TEMPLATES.NETTING_PROPOSAL,
          argument: {
            nettingId: dto.nettingId,
            initiator: dto.initiator,
            counterparty: dto.counterparty,
            lines: lines.map(l => ({
              obligationId: l.obligationId,
              obligationCid: l.obligationContractId,
              creditor: l.creditor,
              debtor: l.debtor,
              amount: l.amount.toString(),
              currency: l.currency
            })),
            terms: {
              grossReceivable: terms.grossReceivable.toString(),
              grossPayable: terms.grossPayable.toString(),
              netAmount: terms.netAmount.toString(),
              currency: terms.currency,
              direction: terms.direction
            },
            status: 'NettingProposed',
            createdDate: DateUtils.toDateOnlyString(createdDate),
            metadata: {
              sourceSystem: dto.sourceSystem,
              sourceReference: dto.sourceReference,
              businessUnit: dto.businessUnit,
              createdBy: context.partyId || 'NetworkOperator',
              createdAt: now.toISOString()
            }
          }
        }
      ]
    });

    const contractId = cmdResult.createdContractIds[0];

    const proposal: NettingProposalEntity = {
      contractId,
      nettingId: dto.nettingId,
      initiator: dto.initiator,
      counterparty: dto.counterparty,
      lines,
      terms,
      status: 'NettingProposed',
      createdDate,
      metadata: {
        sourceSystem: dto.sourceSystem,
        sourceReference: dto.sourceReference,
        businessUnit: dto.businessUnit,
        createdBy: context.partyId || 'NetworkOperator',
        createdAt: now
      }
    };

    await this.nettingRepo.saveProposal(proposal);

    await this.auditRepo.record({
      traceId: context.traceId,
      actor: context.actor,
      action: 'NETTING_PROPOSED',
      resourceType: 'NettingProposal',
      resourceId: dto.nettingId,
      contractId,
      payloadAfter: proposal,
      ipAddress: context.ipAddress
    });

    await EventPublisher.publishEvent('NETTING_PROPOSED', dto.nettingId, proposal, context.traceId);
    return proposal;
  }

  public async acceptNetting(nettingId: string, context: RequestContext): Promise<NettingProposalEntity> {
    const proposal = await this.nettingRepo.findProposalById(nettingId);
    if (!proposal) {
      throw new NotFoundError('NettingProposal', nettingId);
    }

    NettingDomainRules.validateAccept(proposal, context.partyId);

    const acceptCmdId = CantonCommandBuilder.buildCommandId({
      tenant: context.tenantId || 'OBLIGAX',
      operation: 'NETTING_ACCEPT',
      businessId: nettingId
    });

    const cmdResult = await this.cantonClient.submit({
      commandId: acceptCmdId,
      actAs: [context.partyId],
      commands: [CantonCommands.acceptNettingProposal(proposal.contractId!)]
    });

    proposal.status = 'NettingAccepted';
    proposal.contractId = cmdResult.createdContractIds[0];

    await this.nettingRepo.saveProposal(proposal);

    await this.auditRepo.record({
      traceId: context.traceId,
      actor: context.actor,
      action: 'NETTING_ACCEPTED',
      resourceType: 'NettingProposal',
      resourceId: nettingId,
      contractId: proposal.contractId,
      payloadAfter: proposal,
      ipAddress: context.ipAddress
    });

    await EventPublisher.publishEvent('NETTING_ACCEPTED', nettingId, proposal, context.traceId);
    return proposal;
  }

  public async rejectNetting(nettingId: string, reason: string, context: RequestContext): Promise<NettingProposalEntity> {
    const proposal = await this.nettingRepo.findProposalById(nettingId);
    if (!proposal) {
      throw new NotFoundError('NettingProposal', nettingId);
    }

    const rejectCmdId = CantonCommandBuilder.buildCommandId({
      tenant: context.tenantId || 'OBLIGAX',
      operation: 'NETTING_REJECT',
      businessId: nettingId
    });

    const cmdResult = await this.cantonClient.submit({
      commandId: rejectCmdId,
      actAs: [context.partyId],
      commands: [CantonCommands.rejectNettingProposal(proposal.contractId!, reason)]
    });

    proposal.status = 'NettingRejected';
    proposal.contractId = cmdResult.createdContractIds[0];

    await this.nettingRepo.saveProposal(proposal);

    await this.auditRepo.record({
      traceId: context.traceId,
      actor: context.actor,
      action: 'NETTING_REJECTED',
      resourceType: 'NettingProposal',
      resourceId: nettingId,
      contractId: proposal.contractId,
      payloadAfter: { proposal, reason },
      ipAddress: context.ipAddress
    });

    await EventPublisher.publishEvent('NETTING_REJECTED', nettingId, proposal, context.traceId);
    return proposal;
  }

  public async executeNetting(nettingId: string, context: RequestContext): Promise<NettingSettlementEntity> {
    const proposal = await this.nettingRepo.findProposalById(nettingId);
    if (!proposal) {
      throw new NotFoundError('NettingProposal', nettingId);
    }

    NettingDomainRules.validateExecute(proposal, context.partyId);

    // Re-verify that all participating obligations are in Confirmed state prior to execution
    for (const line of proposal.lines) {
      const obl = await this.obligationRepo.findByObligationId(line.obligationId);
      if (!obl || obl.status !== 'Confirmed') {
        throw new UnprocessableError(
          `Obligation '${line.obligationId}' is not 'Confirmed'. Netting aborted atomically with zero modifications.`
        );
      }
    }

    const executeCmdId = CantonCommandBuilder.buildCommandId({
      tenant: context.tenantId || 'OBLIGAX',
      operation: 'NETTING_EXECUTE',
      businessId: nettingId
    });

    const cmdResult = await this.cantonClient.submit({
      commandId: executeCmdId,
      actAs: [context.partyId],
      commands: [CantonCommands.executeNetting(proposal.contractId!)]
    });

    const settlementContractId = cmdResult.createdContractIds[0];
    const executedDate = new Date();

    // Update participating obligations in Read Projection to Netted
    for (const line of proposal.lines) {
      await this.obligationRepo.updateStatus(line.obligationId, 'Netted');
    }

    proposal.status = 'NettingExecuted';
    await this.nettingRepo.saveProposal(proposal);

    const settlement: NettingSettlementEntity = {
      contractId: settlementContractId,
      nettingId: proposal.nettingId,
      initiator: proposal.initiator,
      counterparty: proposal.counterparty,
      lines: proposal.lines,
      terms: proposal.terms,
      executedDate,
      metadata: proposal.metadata
    };

    await this.nettingRepo.saveSettlement(settlement);

    await this.auditRepo.record({
      traceId: context.traceId,
      actor: context.actor,
      action: 'NETTING_EXECUTED',
      resourceType: 'NettingSettlement',
      resourceId: nettingId,
      contractId: settlementContractId,
      payloadAfter: settlement,
      ipAddress: context.ipAddress
    });

    await EventPublisher.publishEvent('NETTING_EXECUTED', nettingId, settlement, context.traceId);
    return settlement;
  }

  public async getNetting(nettingId: string, context: RequestContext): Promise<NettingProposalEntity> {
    const proposal = await this.nettingRepo.findProposalById(nettingId);
    if (!proposal) {
      throw new NotFoundError('NettingProposal', nettingId);
    }
    return proposal;
  }

  public async getSettlement(nettingId: string, context: RequestContext): Promise<NettingSettlementEntity> {
    const settlement = await this.nettingRepo.findSettlementById(nettingId);
    if (!settlement) {
      throw new NotFoundError('NettingSettlement', nettingId);
    }
    return settlement;
  }
}
