import { SettlementEntity } from '../../domain/settlement/settlement.types';
import { ExternalPaymentResult } from './settlement-client';
import { SettlementRail } from './settlement-rail.interface';
import {
  BankPaymentRail,
  RTGSRail,
  TokenizedDepositRail,
  StablecoinRail,
  SecuritiesSettlementRail
} from './rails/base-settlement-rail';

export class SettlementRailAdapter {
  private readonly rails: Map<string, SettlementRail> = new Map();

  constructor() {
    this.rails.set('BankPaymentRail', new BankPaymentRail());
    this.rails.set('RTGS', new RTGSRail());
    this.rails.set('TokenizedDeposit', new TokenizedDepositRail());
    this.rails.set('Stablecoin', new StablecoinRail());
    this.rails.set('SecuritiesSettlement', new SecuritiesSettlementRail());
  }

  public getRail(railName: string): SettlementRail {
    const rail = this.rails.get(railName);
    if (!rail) {
      // Default to RTGS rail if unrecognized
      return this.rails.get('RTGS')!;
    }
    return rail;
  }

  /**
   * Adapts institutional settlement entity to banking rail format and triggers dispatch via real rail
   */
  public async dispatchToRail(settlement: SettlementEntity): Promise<ExternalPaymentResult> {
    const rail = this.getRail(settlement.requestMetadata.settlementRail);

    try {
      const initiation = await rail.initiate({
        settlementId: settlement.settlementId,
        obligationId: settlement.obligationId,
        payer: settlement.debtor,
        payee: settlement.creditor,
        amount: settlement.amount,
        currency: settlement.currency,
        reference: settlement.requestMetadata.sourceReference
      });

      return {
        success: initiation.status !== 'REJECTED',
        externalTransactionId: initiation.externalTransactionId,
        settlementReference: initiation.acknowledgementReference,
        processedAt: initiation.initiatedAt
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        failureReason: msg.includes('InsufficientFunds') ? 'InsufficientFunds' : 'TechnicalFailure',
        failureDetails: msg,
        processedAt: new Date()
      };
    }
  }
}
