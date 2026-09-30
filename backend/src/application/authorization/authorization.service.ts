import { RequestContext } from '../../types/common.types';
import { ObligationEntity, CreateObligationDto } from '../../domain/obligation/obligation.types';
import { ForbiddenError } from '../../types/errors.types';
import Decimal from 'decimal.js';

export interface AuthorizationDecision {
  allowed: boolean;
  reason?: string;
  evaluatedCapabilities: string[];
  evaluatedRoles: string[];
}

export class AuthorizationService {
  /**
   * Evaluates if context actor can create an obligation proposal
   */
  public canCreateObligation(context: RequestContext, dto: CreateObligationDto): AuthorizationDecision {
    const roles = context.roles || [];
    const party = context.partyId || '';

    // Creditor proposing: must match or act for creditor
    const isPartyAuthorized = party === dto.creditor || party === 'NetworkOperator' || roles.includes('NetworkOperator');
    if (!isPartyAuthorized) {
      throw new ForbiddenError(
        `AUTH-OBL-001: Party '${party}' is not authorized to propose obligations on behalf of creditor '${dto.creditor}'.`
      );
    }

    return {
      allowed: true,
      evaluatedCapabilities: ['canCreateObligations'],
      evaluatedRoles: roles
    };
  }

  /**
   * Evaluates if context actor can accept an obligation proposal (must be Debtor)
   */
  public canAcceptObligation(context: RequestContext, obligation: ObligationEntity): AuthorizationDecision {
    const roles = context.roles || [];
    const party = context.partyId || '';

    const isDebtor = party === obligation.debtor || party.startsWith(obligation.debtor + '::') || roles.includes('NetworkOperator');
    if (!isDebtor) {
      throw new ForbiddenError(
        `AUTH-OBL-002: Only the designated debtor '${obligation.debtor}' can accept this obligation proposal. Party '${party}' rejected.`
      );
    }

    return {
      allowed: true,
      evaluatedCapabilities: ['canAcceptObligations'],
      evaluatedRoles: roles
    };
  }

  /**
   * Evaluates if context actor can confirm an accepted obligation (must be Creditor)
   */
  public canConfirmObligation(context: RequestContext, obligation: ObligationEntity): AuthorizationDecision {
    const roles = context.roles || [];
    const party = context.partyId || '';

    const isCreditor = party === obligation.creditor || party.startsWith(obligation.creditor + '::') || roles.includes('NetworkOperator');
    if (!isCreditor) {
      throw new ForbiddenError(
        `AUTH-OBL-003: Only the designated creditor '${obligation.creditor}' can confirm this obligation. Party '${party}' rejected.`
      );
    }

    return {
      allowed: true,
      evaluatedCapabilities: ['canConfirmObligations'],
      evaluatedRoles: roles
    };
  }

  /**
   * Evaluates if context actor can propose bilateral netting
   */
  public canProposeNetting(
    context: RequestContext,
    initiator: string,
    counterparty: string
  ): AuthorizationDecision {
    const roles = context.roles || [];
    const party = context.partyId || '';

    const isInitiator = party === initiator || party.startsWith(initiator + '::') || roles.includes('NetworkOperator');
    if (!isInitiator) {
      throw new ForbiddenError(
        `AUTH-NET-001: Party '${party}' is not authorized to initiate netting for '${initiator}'.`
      );
    }

    return {
      allowed: true,
      evaluatedCapabilities: ['canInitiateNetting'],
      evaluatedRoles: roles
    };
  }

  /**
   * Evaluates if context actor can execute bilateral netting
   */
  public canExecuteNetting(
    context: RequestContext,
    initiator: string,
    counterparty: string
  ): AuthorizationDecision {
    const roles = context.roles || [];
    const party = context.partyId || '';

    const isParticipant =
      party === initiator ||
      party.startsWith(initiator + '::') ||
      party === counterparty ||
      party.startsWith(counterparty + '::') ||
      roles.includes('NetworkOperator');

    if (!isParticipant) {
      throw new ForbiddenError(
        `AUTH-NET-002: Party '${party}' is not a counterparty to this netting agreement.`
      );
    }

    return {
      allowed: true,
      evaluatedCapabilities: ['canParticipateInNetting'],
      evaluatedRoles: roles
    };
  }

  /**
   * Evaluates if context actor can initiate settlement
   */
  public canInitiateSettlement(context: RequestContext, obligation: ObligationEntity): AuthorizationDecision {
    const roles = context.roles || [];
    const party = context.partyId || '';

    const isSignatory =
      party === obligation.creditor ||
      party.startsWith(obligation.creditor + '::') ||
      party === obligation.debtor ||
      party.startsWith(obligation.debtor + '::') ||
      roles.includes('NetworkOperator') ||
      roles.includes('SettlementOperator');

    if (!isSignatory) {
      throw new ForbiddenError(
        `AUTH-SET-001: Party '${party}' is not authorized to initiate settlement for obligation '${obligation.obligationId}'.`
      );
    }

    return {
      allowed: true,
      evaluatedCapabilities: ['canInitiateSettlement'],
      evaluatedRoles: roles
    };
  }

  /**
   * Evaluates if context actor can manage network participants
   */
  public canManageParticipant(context: RequestContext): AuthorizationDecision {
    const roles = context.roles || [];
    if (!roles.includes('NetworkOperator') && !roles.includes('ComplianceOperator')) {
      throw new ForbiddenError(
        `AUTH-GOV-001: Administrative role required to manage network participants.`
      );
    }

    return {
      allowed: true,
      evaluatedCapabilities: ['canManageParticipant'],
      evaluatedRoles: roles
    };
  }

  /**
   * Evaluates if context actor can audit the ledger
   */
  public canAuditLedger(context: RequestContext): AuthorizationDecision {
    const roles = context.roles || [];
    if (!roles.includes('Auditor') && !roles.includes('NetworkOperator') && !roles.includes('ComplianceOperator')) {
      throw new ForbiddenError(
        `AUTH-AUD-001: Auditor or NetworkOperator role required to access raw audit trails.`
      );
    }

    return {
      allowed: true,
      evaluatedCapabilities: ['canAuditLedger'],
      evaluatedRoles: roles
    };
  }
}
