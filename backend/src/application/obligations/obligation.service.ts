import { ObligationRepository } from '../../infrastructure/database/repositories/obligation.repository';
import { CantonClient } from '../../infrastructure/canton/canton-client';
import { AuditRepository } from '../../infrastructure/database/repositories/audit.repository';
import { EventPublisher } from '../../infrastructure/messaging/event-publisher';
import { CreateObligationDto, ObligationEntity, ObligationStatus } from '../../domain/obligation/obligation.types';
import { ObligationDomainRules } from '../../domain/obligation/obligation.rules';
import { ObligationStateMachine } from '../../domain/obligation/obligation.state-machine';
import { SafeDecimal } from '../../utils/decimal';
import { DateUtils } from '../../utils/dates';
import { RequestContext } from '../../types/common.types';
import { NotFoundError, ConflictError } from '../../types/errors.types';
import { CantonCommands, TEMPLATES } from '../../infrastructure/canton/canton-commands';

export class ObligationService {
  constructor(
    private readonly obligationRepo: ObligationRepository,
    private readonly cantonClient: CantonClient,
    private readonly auditRepo: AuditRepository
  ) {}

  public async createObligation(dto: CreateObligationDto, context: RequestContext): Promise<ObligationEntity> {
    ObligationDomainRules.validateCreateProposal(dto);

    // Enforce business ID uniqueness at application boundary
    const existing = await this.obligationRepo.findByObligationId(dto.obligationId);
    if (existing) {
      throw new ConflictError(`Obligation with business identifier '${dto.obligationId}' already exists.`);
    }

    const createdDate = DateUtils.parse(dto.createdDate);
    const dueDate = DateUtils.parse(dto.dueDate);
    const amount = SafeDecimal.from(dto.amount);
    const now = new Date();

    // 1. Authoritative submission to Canton Ledger
    const cmdResult = await this.cantonClient.submit({
      commandId: `cmd-create-${dto.obligationId}`,
      actAs: [context.partyId || 'NetworkOperator'],
      commands: [
        {
          type: 'create',
          templateId: TEMPLATES.OBLIGATION,
          argument: {
            creditor: dto.creditor,
            debtor: dto.debtor,
            obligationId: dto.obligationId,
            description: dto.description,
            amount: amount.toString(),
            currency: dto.currency,
            status: 'Proposed',
            createdDate: DateUtils.toDateOnlyString(createdDate),
            dueDate: DateUtils.toDateOnlyString(dueDate),
            priority: dto.priority || 'Normal',
            version: 1,
            metadata: {
              sourceSystem: dto.sourceSystem,
              sourceReference: dto.sourceReference,
              businessUnit: dto.businessUnit,
              createdBy: context.partyId || 'NetworkOperator',
              createdAt: now.toISOString(),
              version: 1
            }
          }
        }
      ]
    });

    const contractId = cmdResult.createdContractIds[0];

    // 2. Persist Read Projection
    const entity: ObligationEntity = {
      contractId,
      obligationId: dto.obligationId,
      creditor: dto.creditor,
      debtor: dto.debtor,
      description: dto.description,
      amount,
      currency: dto.currency,
      status: 'Proposed',
      createdDate,
      dueDate,
      priority: dto.priority || 'Normal',
      version: 1,
      metadata: {
        sourceSystem: dto.sourceSystem,
        sourceReference: dto.sourceReference,
        businessUnit: dto.businessUnit,
        createdBy: context.partyId || 'NetworkOperator',
        createdAt: now,
        version: 1
      }
    };

    await this.obligationRepo.save(entity);

    // 3. Forensic Audit Record
    await this.auditRepo.record({
      traceId: context.traceId,
      actor: context.actor,
      action: 'OBLIGATION_PROPOSED',
      resourceType: 'Obligation',
      resourceId: dto.obligationId,
      contractId,
      payloadAfter: entity,
      ipAddress: context.ipAddress
    });

    // 4. Domain Event Dispatch
    await EventPublisher.publishEvent('OBLIGATION_PROPOSED', dto.obligationId, entity, context.traceId);

    return entity;
  }

  public async acceptObligation(obligationId: string, context: RequestContext): Promise<ObligationEntity> {
    const obligation = await this.obligationRepo.findByObligationId(obligationId);
    if (!obligation) {
      throw new NotFoundError('Obligation', obligationId);
    }

    ObligationDomainRules.validateAccept(obligation, context.partyId);
    ObligationStateMachine.assertTransition(obligation.status, 'Accepted', obligationId);

    // Canton Ledger choice exercise
    const cmdResult = await this.cantonClient.submit({
      commandId: `cmd-accept-${obligationId}`,
      actAs: [context.partyId],
      commands: [CantonCommands.acceptObligation(obligation.contractId!)]
    });

    const newContractId = cmdResult.createdContractIds[0];
    obligation.status = 'Accepted';
    obligation.version += 1;
    obligation.contractId = newContractId;

    await this.obligationRepo.save(obligation);

    await this.auditRepo.record({
      traceId: context.traceId,
      actor: context.actor,
      action: 'OBLIGATION_ACCEPTED',
      resourceType: 'Obligation',
      resourceId: obligationId,
      contractId: newContractId,
      payloadAfter: obligation,
      ipAddress: context.ipAddress
    });

    await EventPublisher.publishEvent('OBLIGATION_ACCEPTED', obligationId, obligation, context.traceId);
    return obligation;
  }

  public async confirmObligation(obligationId: string, context: RequestContext): Promise<ObligationEntity> {
    const obligation = await this.obligationRepo.findByObligationId(obligationId);
    if (!obligation) {
      throw new NotFoundError('Obligation', obligationId);
    }

    ObligationDomainRules.validateConfirm(obligation, context.partyId);
    ObligationStateMachine.assertTransition(obligation.status, 'Confirmed', obligationId);

    const cmdResult = await this.cantonClient.submit({
      commandId: `cmd-confirm-${obligationId}`,
      actAs: [context.partyId],
      commands: [CantonCommands.confirmObligation(obligation.contractId!)]
    });

    const newContractId = cmdResult.createdContractIds[0];
    obligation.status = 'Confirmed';
    obligation.version += 1;
    obligation.contractId = newContractId;

    await this.obligationRepo.save(obligation);

    await this.auditRepo.record({
      traceId: context.traceId,
      actor: context.actor,
      action: 'OBLIGATION_CONFIRMED',
      resourceType: 'Obligation',
      resourceId: obligationId,
      contractId: newContractId,
      payloadAfter: obligation,
      ipAddress: context.ipAddress
    });

    await EventPublisher.publishEvent('OBLIGATION_CONFIRMED', obligationId, obligation, context.traceId);
    return obligation;
  }

  public async cancelObligation(
    obligationId: string,
    reason: string,
    context: RequestContext
  ): Promise<ObligationEntity> {
    const obligation = await this.obligationRepo.findByObligationId(obligationId);
    if (!obligation) {
      throw new NotFoundError('Obligation', obligationId);
    }

    ObligationStateMachine.assertTransition(obligation.status, 'Cancelled', obligationId);

    const cmdResult = await this.cantonClient.submit({
      commandId: `cmd-cancel-${obligationId}`,
      actAs: [context.partyId],
      commands: [
        {
          type: 'exercise',
          templateId: TEMPLATES.OBLIGATION,
          contractId: obligation.contractId!,
          choice: 'CancelObligation',
          argument: { cancellationReason: reason }
        }
      ]
    });

    const newContractId = cmdResult.createdContractIds[0];
    obligation.status = 'Cancelled';
    obligation.version += 1;
    obligation.contractId = newContractId;

    await this.obligationRepo.save(obligation);

    await this.auditRepo.record({
      traceId: context.traceId,
      actor: context.actor,
      action: 'OBLIGATION_CANCELLED',
      resourceType: 'Obligation',
      resourceId: obligationId,
      contractId: newContractId,
      payloadAfter: { ...obligation, cancellationReason: reason },
      ipAddress: context.ipAddress
    });

    await EventPublisher.publishEvent('OBLIGATION_CANCELLED', obligationId, obligation, context.traceId);
    return obligation;
  }

  public async getObligation(obligationId: string, context: RequestContext): Promise<ObligationEntity> {
    const obligation = await this.obligationRepo.findByObligationId(obligationId);
    if (!obligation) {
      throw new NotFoundError('Obligation', obligationId);
    }
    return obligation;
  }

  public async queryObligations(filters: Record<string, unknown>, context: RequestContext) {
    return this.obligationRepo.query(filters as any);
  }
}
