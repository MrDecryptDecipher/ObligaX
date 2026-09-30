import Decimal from 'decimal.js';
import crypto from 'crypto';
import { NettingLine, NettingTerms } from './netting.types';
import { ObligationEntity, Currency } from '../obligation/obligation.types';
import { SafeDecimal } from '../../utils/decimal';
import { UnprocessableError } from '../../types/errors.types';

export interface DeterministicNettingResult {
  lines: NettingLine[];
  terms: NettingTerms;
  nettingHash: string;
  calculatedAt: string;
}

export class NettingCalculator {
  private static readonly CURRENCY_DECIMALS: Record<Currency, number> = {
    USD: 2,
    EUR: 2,
    GBP: 2,
    CHF: 2,
    SGD: 2,
    AUD: 2,
    CAD: 2,
    INR: 2,
    JPY: 0
  };

  /**
   * Calculate deterministic bilateral netting results with sorted inputs,
   * currency precision, and canonical cryptographic output hash
   */
  public static calculateBilateralNetting(
    initiator: string,
    counterparty: string,
    currency: Currency,
    obligations: ObligationEntity[]
  ): DeterministicNettingResult {
    const partyMatches = (a: string, b: string) => a === b || a.split('::')[0] === b.split('::')[0];

    if (partyMatches(initiator, counterparty)) {
      throw new UnprocessableError('NET-CALC-001: Initiator and counterparty must be different entities.');
    }

    if (!obligations || obligations.length === 0) {
      throw new UnprocessableError('NET-CALC-002: Netting set cannot be empty.');
    }

    // 1. Sort obligations canonically by obligationId ascending
    const sortedObligations = [...obligations].sort((a, b) => a.obligationId.localeCompare(b.obligationId));

    // 2. Check for duplicate obligations in netting set
    const seenIds = new Set<string>();
    for (const obl of sortedObligations) {
      if (seenIds.has(obl.obligationId)) {
        throw new UnprocessableError(`NET-CALC-008: Duplicate obligation '${obl.obligationId}' found in netting set.`);
      }
      seenIds.add(obl.obligationId);
    }

    const precision = this.CURRENCY_DECIMALS[currency] ?? 2;
    Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN });

    let grossReceivable = new Decimal(0);
    let grossPayable = new Decimal(0);
    const lines: NettingLine[] = [];

    for (const obl of sortedObligations) {
      if (obl.status !== 'Confirmed') {
        throw new UnprocessableError(
          `NET-CALC-003: Obligation '${obl.obligationId}' cannot enter netting in state '${obl.status}'. Must be 'Confirmed'.`
        );
      }

      if (obl.currency !== currency) {
        throw new UnprocessableError(
          `NET-CALC-004: Obligation '${obl.obligationId}' has currency '${obl.currency}', expected netting currency '${currency}'.`
        );
      }

      const amount = SafeDecimal.from(obl.amount).toDecimalPlaces(precision, Decimal.ROUND_HALF_EVEN);
      if (!SafeDecimal.gt(amount, 0)) {
        throw new Error(`NET-CALC-005: Obligation '${obl.obligationId}' has non-positive amount '${amount.toString()}'.`);
      }

      const isReceivable = partyMatches(obl.creditor, initiator) && partyMatches(obl.debtor, counterparty);
      const isPayable = partyMatches(obl.debtor, initiator) && partyMatches(obl.creditor, counterparty);

      if (!isReceivable && !isPayable) {
        throw new Error(
          `NET-CALC-006: Obligation '${obl.obligationId}' parties (${obl.creditor}, ${obl.debtor}) do not match bilateral pair (${initiator}, ${counterparty}).`
        );
      }

      if (isReceivable) {
        grossReceivable = SafeDecimal.add(grossReceivable, amount);
      } else {
        grossPayable = SafeDecimal.add(grossPayable, amount);
      }

      lines.push({
        obligationId: obl.obligationId,
        obligationContractId: obl.contractId || '',
        creditor: obl.creditor,
        debtor: obl.debtor,
        amount,
        currency
      });
    }

    grossReceivable = grossReceivable.toDecimalPlaces(precision, Decimal.ROUND_HALF_EVEN);
    grossPayable = grossPayable.toDecimalPlaces(precision, Decimal.ROUND_HALF_EVEN);

    const netAmount = SafeDecimal.abs(SafeDecimal.subtract(grossReceivable, grossPayable)).toDecimalPlaces(
      precision,
      Decimal.ROUND_HALF_EVEN
    );

    if (SafeDecimal.eq(netAmount, 0)) {
      throw new Error('NET-CALC-007: Netting resulted in a zero balance. ObligaX requires net balance > 0.');
    }

    // Direction logic
    const direction = SafeDecimal.gte(grossReceivable, grossPayable) ? 'CounterpartyPays' : 'InitiatorPays';

    const terms: NettingTerms = {
      grossReceivable,
      grossPayable,
      netAmount,
      currency,
      direction
    };

    // 3. Compute deterministic output hash (SHA-256 over canonical string)
    const canonicalPayload = JSON.stringify({
      initiator,
      counterparty,
      currency,
      grossReceivable: grossReceivable.toString(),
      grossPayable: grossPayable.toString(),
      netAmount: netAmount.toString(),
      direction,
      obligationIds: lines.map(l => l.obligationId)
    });

    const nettingHash = crypto.createHash('sha256').update(canonicalPayload).digest('hex');

    return {
      lines,
      terms,
      nettingHash,
      calculatedAt: new Date().toISOString()
    };
  }
}
