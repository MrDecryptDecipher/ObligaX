import { CantonCommand, CantonCreateCommand, CantonExerciseCommand } from '../../types/canton.types';

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

export class CantonCommands {
  public static createObligationViaFactory(
    factoryCid: string,
    args: Record<string, unknown>
  ): CantonExerciseCommand {
    return {
      type: 'exercise',
      templateId: TEMPLATES.OBLIGATION_FACTORY,
      contractId: factoryCid,
      choice: 'CreateObligation',
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
    settlementReference: string,
    processedAt: string
  ): CantonExerciseCommand {
    return {
      type: 'exercise',
      templateId: TEMPLATES.SETTLEMENT_INSTRUCTION,
      contractId,
      choice: 'CompleteSettlement',
      argument: {
        externalTransactionId,
        settlementReference,
        processedAt
      }
    };
  }

  public static failSettlement(
    contractId: string,
    failureReason: string,
    failureDetails: string,
    failedAt: string
  ): CantonExerciseCommand {
    return {
      type: 'exercise',
      templateId: TEMPLATES.SETTLEMENT_INSTRUCTION,
      contractId,
      choice: 'FailSettlement',
      argument: {
        failureReason,
        failureDetails,
        failedAt
      }
    };
  }

  public static retrySettlement(
    contractId: string,
    args: Record<string, unknown>
  ): CantonExerciseCommand {
    return {
      type: 'exercise',
      templateId: TEMPLATES.SETTLEMENT_INSTRUCTION,
      contractId,
      choice: 'RetrySettlement',
      argument: args
    };
  }

  public static createNettingProposalViaFactory(
    factoryCid: string,
    args: Record<string, unknown>
  ): CantonExerciseCommand {
    return {
      type: 'exercise',
      templateId: TEMPLATES.NETTING_FACTORY,
      contractId: factoryCid,
      choice: 'CreateProposal',
      argument: args
    };
  }

  public static acceptNettingProposal(contractId: string): CantonExerciseCommand {
    return {
      type: 'exercise',
      templateId: TEMPLATES.NETTING_PROPOSAL,
      contractId,
      choice: 'Accept',
      argument: {}
    };
  }

  public static rejectNettingProposal(contractId: string, reason: string): CantonExerciseCommand {
    return {
      type: 'exercise',
      templateId: TEMPLATES.NETTING_PROPOSAL,
      contractId,
      choice: 'Reject',
      argument: { reason }
    };
  }

  public static cancelNettingProposal(contractId: string, reason: string): CantonExerciseCommand {
    return {
      type: 'exercise',
      templateId: TEMPLATES.NETTING_PROPOSAL,
      contractId,
      choice: 'Cancel',
      argument: { reason }
    };
  }

  public static executeNetting(contractId: string): CantonExerciseCommand {
    return {
      type: 'exercise',
      templateId: TEMPLATES.NETTING_PROPOSAL,
      contractId,
      choice: 'Execute',
      argument: {}
    };
  }
}

export * from './canton-command-builder';

