import { ObligationEntity, Currency } from '../obligation/obligation.types';
import { UnprocessableError, ForbiddenError } from '../../types/errors.types';
import { SafeDecimal } from '../../utils/decimal';
import Decimal from 'decimal.js';

export interface NettingEligibilityDecision {
  eligible: boolean;
  reasons: string[];
  totalGrossExposure: Decimal;
  currency: Currency;
  participatingObligationCount: number;
  evaluatedAt: Date;
}

export class NettingRiskService {
  // Sanctions and blocked entity watchlist
  private static readonly SANCTIONED_PARTIES = new Set<string>([
    'SANCTIONED_BANK_X',
    'BLOCKED_ENTITY_Y'
  ]);

  /**
   * Pre-netting institutional risk evaluation before DAML command submission
   */
  public static evaluateNettingEligibility(
    initiator: string,
    counterparty: string,
    currency: Currency,
    obligations: ObligationEntity[],
    maxGrossExposureLimit?: Decimal
  ): NettingEligibilityDecision {
    const reasons: string[] = [];

    // 1. Sanctions & Compliance Screening
    const initPrefix = initiator.split('::')[0];
    const cpPrefix = counterparty.split('::')[0];
    if (
      this.SANCTIONED_PARTIES.has(initiator) ||
      this.SANCTIONED_PARTIES.has(initPrefix) ||
      this.SANCTIONED_PARTIES.has(counterparty) ||
      this.SANCTIONED_PARTIES.has(cpPrefix)
    ) {
      throw new ForbiddenError(
        `RISK-NET-001: Counterparty sanctions check failed. Parties involved in netting are on the prohibited list.`
      );
    }

    // 2. Counterparty Validity
    if (initiator === counterparty || initPrefix === cpPrefix) {
      reasons.push('Initiator and counterparty must be distinct legal entities.');
    }

    if (!obligations || obligations.length === 0) {
      reasons.push('Netting set is empty.');
    }

    let totalGrossExposure = new Decimal(0);
    const seenObligationIds = new Set<string>();

    for (const obl of obligations) {
      // 3. Duplicate membership
      if (seenObligationIds.has(obl.obligationId)) {
        reasons.push(`Duplicate obligation '${obl.obligationId}' in netting set.`);
      }
      seenObligationIds.add(obl.obligationId);

      // 4. Status Check
      if (obl.status !== 'Confirmed') {
        reasons.push(`Obligation '${obl.obligationId}' is in status '${obl.status}', required: 'Confirmed'.`);
      }

      // 5. Currency Check
      if (obl.currency !== currency) {
        reasons.push(`Obligation '${obl.obligationId}' currency '${obl.currency}' does not match netting currency '${currency}'.`);
      }

      // 6. Non-positive amount
      const amt = SafeDecimal.from(obl.amount);
      if (!SafeDecimal.gt(amt, 0)) {
        reasons.push(`Obligation '${obl.obligationId}' amount must be positive.`);
      }

      totalGrossExposure = SafeDecimal.add(totalGrossExposure, amt);
    }

    // 7. Exposure Limit Enforcement
    if (maxGrossExposureLimit && SafeDecimal.gt(totalGrossExposure, maxGrossExposureLimit)) {
      reasons.push(
        `Gross netting exposure ${totalGrossExposure.toString()} exceeds participant risk limit ${maxGrossExposureLimit.toString()}.`
      );
    }

    if (reasons.length > 0) {
      throw new UnprocessableError(`RISK-NET-002: Netting eligibility failed: ${reasons.join('; ')}`);
    }

    return {
      eligible: true,
      reasons: [],
      totalGrossExposure,
      currency,
      participatingObligationCount: obligations.length,
      evaluatedAt: new Date()
    };
  }
}
