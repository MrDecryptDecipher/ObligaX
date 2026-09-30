import { ObligationRepository } from '../../infrastructure/database/repositories/obligation.repository';
import { CantonClient } from '../../infrastructure/canton/canton-client';
import { AuditRepository } from '../../infrastructure/database/repositories/audit.repository';
import { EventPublisher } from '../../infrastructure/messaging/event-publisher';
import { RequestContext } from '../../types/common.types';
import { NotFoundError } from '../../types/errors.types';
import { ObligationStateMachine } from '../../domain/obligation/obligation.state-machine';
import { TEMPLATES } from '../../infrastructure/canton/canton-commands';
import { DisputeReason } from '../../domain/obligation/obligation.types';

export interface RaiseDisputeDto {
  reason: DisputeReason;
  details: string;
}

export class DisputeService {
  constructor(
    private readonly obligationRepo: ObligationRepository,
    private readonly cantonClient: CantonClient,
    private readonly auditRepo: AuditRepository
  ) {}

  public async raiseDispute(
    obligationId: string,
    dto: RaiseDisputeDto,
    context: RequestContext
  ): Promise<any> {
    const obligation = await this.obligationRepo.findByObligationId(obligationId);
    if (!obligation) {
      throw new NotFoundError('Obligation', obligationId);
    }

    ObligationStateMachine.assertTransition(obligation.status, 'Disputed', obligationId);

    const cmdResult = await this.cantonClient.submit({
      commandId: `cmd-dispute-${obligationId}`,
      actAs: [context.partyId],
      commands: [
        {
          type: 'exercise',
          templateId: TEMPLATES.OBLIGATION,
          contractId: obligation.contractId!,
          choice: 'RaiseDispute',
          argument: {
            reason: dto.reason,
            details: dto.details,
            raisedAt: new Date().toISOString()
          }
        }
      ]
    });

    obligation.status = 'Disputed';
    obligation.version += 1;
    obligation.contractId = cmdResult.createdContractIds[0];

    await this.obligationRepo.save(obligation);

    await this.auditRepo.record({
      traceId: context.traceId,
      actor: context.actor,
      action: 'DISPUTE_RAISED',
      resourceType: 'Obligation',
      resourceId: obligationId,
      contractId: obligation.contractId,
      payloadAfter: { obligation, dispute: dto },
      ipAddress: context.ipAddress
    });

    await EventPublisher.publishEvent('DISPUTE_RAISED', obligationId, { obligation, dispute: dto }, context.traceId);
    return { obligation, disputeContractId: cmdResult.createdContractIds[1] };
  }
}
