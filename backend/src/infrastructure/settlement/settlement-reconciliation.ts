import { SettlementEntity } from '../../domain/settlement/settlement.types';
import { ExternalPaymentResult } from './settlement-client';

export interface ReconciliationDiscrepancy {
  settlementId: string;
  type: 'STATUS_MISMATCH' | 'REFERENCE_MISMATCH' | 'AMOUNT_MISMATCH';
  expected: unknown;
  actual: unknown;
  severity: 'WARNING' | 'CRITICAL';
}

export class SettlementReconciliationService {
  public static reconcileSettlement(
    ledgerSettlement: SettlementEntity,
    railResult: ExternalPaymentResult
  ): ReconciliationDiscrepancy[] {
    const discrepancies: ReconciliationDiscrepancy[] = [];

    if (railResult.success && ledgerSettlement.status !== 'SettlementCompleted') {
      discrepancies.push({
        settlementId: ledgerSettlement.settlementId,
        type: 'STATUS_MISMATCH',
        expected: 'SettlementCompleted',
        actual: ledgerSettlement.status,
        severity: 'CRITICAL'
      });
    }

    if (!railResult.success && ledgerSettlement.status !== 'SettlementFailed') {
      discrepancies.push({
        settlementId: ledgerSettlement.settlementId,
        type: 'STATUS_MISMATCH',
        expected: 'SettlementFailed',
        actual: ledgerSettlement.status,
        severity: 'CRITICAL'
      });
    }

    return discrepancies;
  }
}
