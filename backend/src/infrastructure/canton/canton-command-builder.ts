import {
  CantonCreateCommand,
  CantonExerciseCommand,
  CantonSubmitRequest
} from '../../types/canton.types';

export const TEMPLATES = {
  OBLIGATION: 'Obligation.Contract:Obligation',
  OBLIGATION_FACTORY: 'Obligation.Contract:ObligationFactory',
  AMENDMENT: 'Obligation.Contract:Amendment',
  DISPUTE: 'Obligation.Contract:Dispute',
  NETTING_PROPOSAL: 'Obligation.Netting:NettingProposal',
  NETTING_FACTORY: 'Obligation.Netting:NettingFactory',
  NETTING_SETTLEMENT: 'Obligation.Netting:NettingSettlement',
  SETTLEMENT_INSTRUCTION: 'Settlement.Settlement:SettlementInstruction',
  PARTICIPANT_REGISTRATION: 'Governance.Participant:ParticipantRegistration',
  PARTICIPANT_REGISTRY: 'Governance.Participant:ParticipantRegistry',
  OBLIGAX_POLICY: 'Governance.Policy:ObligaXPolicy'
};

export interface CommandIdParams {
  tenant: string;
  operation: string;
  businessId: string;
  attempt?: number;
}

export class CantonCommandBuilder {
  /**
   * Deterministic traceable command ID format:
   * {tenant}/{business_operation}/{business_id}/ATTEMPT-{attempt}
   */
  public static buildCommandId(params: CommandIdParams): string {
    const attemptStr = String(params.attempt || 1).padStart(2, '0');
    const cleanTenant = (params.tenant || 'OBLIGAX').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const cleanOp = params.operation.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const cleanId = params.businessId.replace(/[^a-zA-Z0-9_-]/g, '');
    return `${cleanTenant}/${cleanOp}/${cleanId}/ATTEMPT-${attemptStr}`;
  }

  public static createObligation(args: Record<string, unknown>): CantonCreateCommand {
    return {
      type: 'create',
      templateId: TEMPLATES.OBLIGATION,
      argument: args
    };
  }

  public static acceptObligation(contractId: string): CantonExerciseCommand {
    return {
      type: 'exercise',
      templateId: TEMPLATES.OBLIGATION,
      contractId,
      choice: 'AcceptObligation',
      argument: {}
    };
  }

  public static confirmObligation(contractId: string): CantonExerciseCommand {
    return {
      type: 'exercise',
      templateId: TEMPLATES.OBLIGATION,
      contractId,
      choice: 'ConfirmObligation',
      argument: {}
    };
  }

  public static cancelObligation(contractId: string, reason: string): CantonExerciseCommand {
    return {
      type: 'exercise',
      templateId: TEMPLATES.OBLIGATION,
      contractId,
      choice: 'CancelObligation',
      argument: { cancellationReason: reason }
    };
  }

  public static enterSettlementPending(contractId: string): CantonExerciseCommand {
    return {
      type: 'exercise',
      templateId: TEMPLATES.OBLIGATION,
      contractId,
      choice: 'EnterSettlementPending',
      argument: {}
    };
  }

  public static finalizeSettlement(contractId: string): CantonExerciseCommand {
    return {
      type: 'exercise',
      templateId: TEMPLATES.OBLIGATION,
      contractId,
      choice: 'FinalizeSettlement',
      argument: {}
    };
  }

  public static reopenAfterSettlementFailure(contractId: string): CantonExerciseCommand {
    return {
      type: 'exercise',
      templateId: TEMPLATES.OBLIGATION,
      contractId,
      choice: 'ReopenAfterSettlementFailure',
      argument: {}
    };
  }

  public static createSettlementInstruction(args: Record<string, unknown>): CantonCreateCommand {
    return {
      type: 'create',
      templateId: TEMPLATES.SETTLEMENT_INSTRUCTION,
      argument: args
    };
  }

  public static startSettlementProcessing(contractId: string): CantonExerciseCommand {
    return {
      type: 'exercise',
      templateId: TEMPLATES.SETTLEMENT_INSTRUCTION,
      contractId,
      choice: 'StartProcessing',
      argument: {}
    };
  }

  public static completeSettlement(
    contractId: string,
    externalTransactionId: string,
    settlementReference: string
  ): CantonExerciseCommand {
    return {
      type: 'exercise',
      templateId: TEMPLATES.SETTLEMENT_INSTRUCTION,
      contractId,
      choice: 'CompleteSettlement',
      argument: {
        externalTransactionId,
        settlementReference
      }
    };
  }

  public static failSettlement(
    contractId: string,
    failureReason: string,
    details: string
  ): CantonExerciseCommand {
    return {
      type: 'exercise',
      templateId: TEMPLATES.SETTLEMENT_INSTRUCTION,
      contractId,
      choice: 'FailSettlement',
      argument: {
        reason: failureReason,
        details
      }
    };
  }

  public static proposeNetting(args: Record<string, unknown>): CantonCreateCommand {
    return {
      type: 'create',
      templateId: TEMPLATES.NETTING_PROPOSAL,
      argument: args
    };
  }

  public static acceptNettingProposal(contractId: string): CantonExerciseCommand {
    return {
      type: 'exercise',
      templateId: TEMPLATES.NETTING_PROPOSAL,
      contractId,
      choice: 'AcceptNettingProposal',
      argument: {}
    };
  }

  public static executeNetting(contractId: string): CantonExerciseCommand {
    return {
      type: 'exercise',
      templateId: TEMPLATES.NETTING_PROPOSAL,
      contractId,
      choice: 'ExecuteNetting',
      argument: {}
    };
  }

  public static buildSubmitRequest(
    commands: (CantonCreateCommand | CantonExerciseCommand)[],
    commandIdParams: CommandIdParams,
    actAs: string[],
    readAs?: string[],
    workflowId?: string
  ): CantonSubmitRequest {
    return {
      commands,
      commandId: this.buildCommandId(commandIdParams),
      actAs,
      readAs: readAs || [],
      workflowId: workflowId || `${commandIdParams.tenant}-${commandIdParams.businessId}`
    };
  }
}
