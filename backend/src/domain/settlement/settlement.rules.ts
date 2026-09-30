import { SettlementEntity, InitiateSettlementDto } from './settlement.types';
import { ObligationEntity } from '../obligation/obligation.types';

export class SettlementDomainRules {
  public static validateInitiate(dto: InitiateSettlementDto, obligation: ObligationEntity, actorParty: string): void {
    if (!dto.settlementId || dto.settlementId.trim() === '') {
      throw new Error('SET-RULE-001: Settlement ID cannot be empty.');
    }

    if (obligation.status !== 'Confirmed') {
      throw new Error(
        `SET-RULE-002: Obligation '${obligation.obligationId}' must be 'Confirmed' to enter settlement (current: ${obligation.status}).`
      );
    }

    const creditorPrefix = obligation.creditor.split('::')[0];
    const actorPrefix = actorParty.split('::')[0];
    if (obligation.creditor !== actorParty && creditorPrefix !== actorPrefix) {
      throw new Error(`SET-RULE-003: Only creditor '${obligation.creditor}' can initiate settlement for obligation '${obligation.obligationId}'.`);
    }

    if (!dto.sourceSystem || dto.sourceSystem.trim() === '') {
      throw new Error('SET-RULE-004: Source system must be provided.');
    }

    if (!dto.sourceReference || dto.sourceReference.trim() === '') {
      throw new Error('SET-RULE-005: Source reference must be provided.');
    }
  }

  public static validateStartProcessing(settlement: SettlementEntity): void {
    if (settlement.status !== 'SettlementCreated') {
      throw new Error(`SET-RULE-006: Settlement '${settlement.settlementId}' must be in 'SettlementCreated' state to begin processing (current: ${settlement.status}).`);
    }
  }

  public static validateComplete(settlement: SettlementEntity, externalTxId: string, settlementRef: string): void {
    if (settlement.status !== 'SettlementProcessing') {
      throw new Error(`SET-RULE-007: Settlement '${settlement.settlementId}' must be in 'SettlementProcessing' state to complete (current: ${settlement.status}).`);
    }

    if (!externalTxId || externalTxId.trim() === '') {
      throw new Error('SET-RULE-008: External transaction ID is required to complete settlement.');
    }

    if (!settlementRef || settlementRef.trim() === '') {
      throw new Error('SET-RULE-009: Settlement confirmation reference is required.');
    }
  }

  public static validateFail(settlement: SettlementEntity, details: string): void {
    if (settlement.status !== 'SettlementProcessing') {
      throw new Error(`SET-RULE-010: Only processing settlements can be transitioned to failed (current: ${settlement.status}).`);
    }

    if (!details || details.trim() === '') {
      throw new Error('SET-RULE-011: Failure details must be specified.');
    }
  }

  public static validateRetry(settlement: SettlementEntity, obligation: ObligationEntity): void {
    if (settlement.status !== 'SettlementFailed') {
      throw new Error(`SET-RULE-012: Only failed settlements can be retried (current: ${settlement.status}).`);
    }

    if (obligation.status !== 'Confirmed') {
      throw new Error(
        `SET-RULE-013: Associated obligation must have reopened to 'Confirmed' state before retrying settlement (current: ${obligation.status}).`
      );
    }
  }
}
