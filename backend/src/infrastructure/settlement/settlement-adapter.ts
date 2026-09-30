import { SettlementEntity } from '../../domain/settlement/settlement.types';
import { ExternalSettlementRailClient, ExternalPaymentResult } from './settlement-client';

export class SettlementRailAdapter {
  constructor(private readonly railClient: ExternalSettlementRailClient = new ExternalSettlementRailClient()) {}

  /**
   * Adapts institutional settlement entity to banking rail format and triggers dispatch
   */
  public async dispatchToRail(settlement: SettlementEntity): Promise<ExternalPaymentResult> {
    return this.railClient.executePayment({
      settlementId: settlement.settlementId,
      payer: settlement.debtor,
      payee: settlement.creditor,
      amount: settlement.amount,
      currency: settlement.currency,
      rail: settlement.requestMetadata.settlementRail,
      reference: settlement.requestMetadata.sourceReference
    });
  }
}
