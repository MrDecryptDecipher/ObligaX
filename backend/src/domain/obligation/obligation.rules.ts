import { CreateObligationDto, ObligationEntity } from './obligation.types';
import { SafeDecimal } from '../../utils/decimal';
import { DateUtils } from '../../utils/dates';

export class ObligationDomainRules {
  /**
   * Validate new obligation proposal against institutional rules
   */
  public static validateCreateProposal(dto: CreateObligationDto): void {
    if (!dto.obligationId || dto.obligationId.trim() === '') {
      throw new Error('OBL-RULE-001: Obligation ID cannot be empty.');
    }

    if (!dto.creditor || dto.creditor.trim() === '') {
      throw new Error('OBL-RULE-002: Creditor party must be specified.');
    }

    if (!dto.debtor || dto.debtor.trim() === '') {
      throw new Error('OBL-RULE-003: Debtor party must be specified.');
    }

    if (dto.creditor.trim() === dto.debtor.trim()) {
      throw new Error('OBL-RULE-004: Creditor and debtor cannot be the same entity.');
    }

    if (!dto.description || dto.description.trim() === '') {
      throw new Error('OBL-RULE-005: Description cannot be empty.');
    }

    const amountDecimal = SafeDecimal.from(dto.amount);
    if (!SafeDecimal.gt(amountDecimal, 0)) {
      throw new Error('OBL-RULE-006: Obligation amount must be strictly greater than zero.');
    }

    if (!DateUtils.validateDueAfterCreated(dto.createdDate, dto.dueDate)) {
      throw new Error('OBL-RULE-007: Due date must be equal to or after created date.');
    }

    if (!dto.sourceSystem || dto.sourceSystem.trim() === '') {
      throw new Error('OBL-RULE-008: Source system must be provided.');
    }

    if (!dto.sourceReference || dto.sourceReference.trim() === '') {
      throw new Error('OBL-RULE-009: Source reference must be provided.');
    }

    if (!dto.businessUnit || dto.businessUnit.trim() === '') {
      throw new Error('OBL-RULE-010: Business unit must be provided.');
    }
  }

  /**
   * Validate that an obligation can be accepted
   */
  public static validateAccept(obligation: ObligationEntity, actorParty: string): void {
    if (obligation.status !== 'Proposed') {
      throw new Error(`OBL-RULE-011: Obligation '${obligation.obligationId}' is not in Proposed state (current: ${obligation.status}).`);
    }
    const debtorPrefix = obligation.debtor.split('::')[0];
    const actorPrefix = actorParty.split('::')[0];
    if (obligation.debtor !== actorParty && debtorPrefix !== actorPrefix) {
      throw new Error(`OBL-RULE-012: Only debtor '${obligation.debtor}' can accept obligation '${obligation.obligationId}'.`);
    }
  }

  /**
   * Validate that an obligation can be confirmed
   */
  public static validateConfirm(obligation: ObligationEntity, actorParty: string): void {
    if (obligation.status !== 'Accepted') {
      throw new Error(`OBL-RULE-013: Obligation '${obligation.obligationId}' is not in Accepted state (current: ${obligation.status}).`);
    }
    const creditorPrefix = obligation.creditor.split('::')[0];
    const actorPrefix = actorParty.split('::')[0];
    if (obligation.creditor !== actorParty && creditorPrefix !== actorPrefix) {
      throw new Error(`OBL-RULE-014: Only creditor '${obligation.creditor}' can confirm obligation '${obligation.obligationId}'.`);
    }
  }
}
