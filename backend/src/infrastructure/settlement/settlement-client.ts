import { SettlementRail } from '../../domain/settlement/settlement.types';
import { SafeDecimal } from '../../utils/decimal';
import Decimal from 'decimal.js';

export interface ExternalPaymentInstruction {
  settlementId: string;
  payer: string;
  payee: string;
  amount: Decimal;
  currency: string;
  rail: SettlementRail;
  reference: string;
}

export interface ExternalPaymentResult {
  success: boolean;
  externalTransactionId?: string;
  settlementReference?: string;
  failureReason?: string;
  failureDetails?: string;
  processedAt: Date;
}

export class ExternalSettlementRailClient {
  /**
   * Dispatches payment instruction to external RTGS / rail simulator or live API
   */
  public async executePayment(instruction: ExternalPaymentInstruction): Promise<ExternalPaymentResult> {
    const processedAt = new Date();

    // Validate that amount is non-negative and positive
    if (!SafeDecimal.gt(instruction.amount, 0)) {
      return {
        success: false,
        failureReason: 'TechnicalFailure',
        failureDetails: 'Invalid payment amount sent to rail',
        processedAt
      };
    }

    // Simulate potential rail rejections for test purposes if specifically requested via reference
    if (instruction.reference.includes('TRIGGER_FAIL_INSUFFICIENT_FUNDS')) {
      return {
        success: false,
        failureReason: 'InsufficientFunds',
        failureDetails: 'Debtor institutional liquidity account insufficient for gross settlement',
        processedAt
      };
    }

    if (instruction.reference.includes('TRIGGER_FAIL_TIMEOUT')) {
      return {
        success: false,
        failureReason: 'SettlementTimeout',
        failureDetails: 'External rail transaction timed out awaiting counterparty confirmation',
        processedAt
      };
    }

    // Normal successful execution
    const randomHex = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
    return {
      success: true,
      externalTransactionId: `TX-RAIL-${instruction.rail}-${randomHex}`,
      settlementReference: `CONF-${instruction.settlementId}-${randomHex}`,
      processedAt
    };
  }
}
