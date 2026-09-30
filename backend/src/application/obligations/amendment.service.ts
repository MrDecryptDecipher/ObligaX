import { ObligationRepository } from '../../infrastructure/database/repositories/obligation.repository';
import { CantonClient } from '../../infrastructure/canton/canton-client';
import { AuditRepository } from '../../infrastructure/database/repositories/audit.repository';
import { EventPublisher } from '../../infrastructure/messaging/event-publisher';
import { RequestContext } from '../../types/common.types';
import { NotFoundError } from '../../types/errors.types';
import { ObligationStateMachine } from '../../domain/obligation/obligation.state-machine';
import { SafeDecimal } from '../../utils/decimal';
import { TEMPLATES } from '../../infrastructure/canton/canton-commands';

export interface ProposeAmendmentDto {
  field: 'AmendmentAmount' | 'AmendmentDueDate' | 'AmendmentDescription' | 'AmendmentPriority';
  proposedAmount?: string;
  proposedDueDate?: string;
  proposedDescription?: string;
  reason: string;
}

export class AmendmentService {
  constructor(
    private readonly obligationRepo: ObligationRepository,
    private readonly cantonClient: CantonClient,
    private readonly auditRepo: AuditRepository
  ) {}

  public async proposeAmendment(
    obligationId: string,
    dto: ProposeAmendmentDto,
    context: RequestContext
  ): Promise<any> {
    const obligation = await this.obligationRepo.findByObligationId(obligationId);
    if (!obligation) {
      throw new NotFoundError('Obligation', obligationId);
    }

    ObligationStateMachine.assertTransition(obligation.status, 'AmendmentPending', obligationId);

    let choiceName = 'ProposeDescriptionAmendment';
    let arg: Record<string, unknown> = {
      newDescription: dto.proposedDescription || obligation.description,
      reason: dto.reason
    };

    if (dto.field === 'AmendmentAmount') {
      choiceName = 'ProposeAmountAmendment';
      arg = {
        newAmount: SafeDecimal.from(dto.proposedAmount!).toString(),
        reason: dto.reason
      };
    } else if (dto.field === 'AmendmentDueDate') {
      choiceName = 'ProposeDueDateAmendment';
      arg = {
        newDueDate: dto.proposedDueDate!,
        reason: dto.reason
      };
    }

    const cmdResult = await this.cantonClient.submit({
      commandId: `cmd-propose-amd-${obligationId}`,
      actAs: [context.partyId],
      commands: [
        {
          type: 'exercise',
          templateId: TEMPLATES.OBLIGATION,
          contractId: obligation.contractId!,
          choice: choiceName,
          argument: arg
        }
      ]
    });

    obligation.status = 'AmendmentPending';
    obligation.version += 1;
    obligation.contractId = cmdResult.createdContractIds[0];

    await this.obligationRepo.save(obligation);

    await this.auditRepo.record({
      traceId: context.traceId,
      actor: context.actor,
      action: 'AMENDMENT_PROPOSED',
      resourceType: 'Obligation',
      resourceId: obligationId,
      contractId: obligation.contractId,
      payloadAfter: { obligation, amendment: dto },
      ipAddress: context.ipAddress
    });

    await EventPublisher.publishEvent('AMENDMENT_PROPOSED', obligationId, { obligation, amendment: dto }, context.traceId);
    return { obligation, amendmentContractId: cmdResult.createdContractIds[1] };
  }
}
