import Decimal from 'decimal.js';
import { NettingLine, NettingTerms } from './netting.types';
import { ObligationEntity, Currency } from '../obligation/obligation.types';
import { SafeDecimal } from '../../utils/decimal';
import { UnprocessableError } from '../../types/errors.types';

export class NettingCalculator {
  /**
   * Calculate bilateral netting results with decimal precision
   */
  public static calculateBilateralNetting(
    initiator: string,
    counterparty: string,
    currency: Currency,
    obligations: ObligationEntity[]
  ): { lines: NettingLine[]; terms: NettingTerms } {
    if (initiator === counterparty) {
      throw new UnprocessableError('NET-CALC-001: Initiator and counterparty must be different entities.');
    }

    if (!obligations || obligations.length === 0) {
      throw new UnprocessableError('NET-CALC-002: Netting set cannot be empty.');
    }

    let grossReceivable = new Decimal(0);
    let grossPayable = new Decimal(0);
    const lines: NettingLine[] = [];

    for (const obl of obligations) {
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

      const amount = SafeDecimal.from(obl.amount);
      if (!SafeDecimal.gt(amount, 0)) {
        throw new Error(`NET-CALC-005: Obligation '${obl.obligationId}' has non-positive amount '${amount.toString()}'.`);
      }

      const isReceivable = obl.creditor === initiator && obl.debtor === counterparty;
      const isPayable = obl.debtor === initiator && obl.creditor === counterparty;

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

    const netAmount = SafeDecimal.abs(SafeDecimal.subtract(grossReceivable, grossPayable));

    if (SafeDecimal.eq(netAmount, 0)) {
      throw new Error('NET-CALC-007: Netting resulted in a zero balance. ObligaX requires net balance > 0.');
    }

    // Direction logic:
    // If grossReceivable >= grossPayable, initiator receives net payment -> counterparty must pay
    // If grossReceivable < grossPayable, initiator owes net payment -> initiator must pay
    const direction = SafeDecimal.gte(grossReceivable, grossPayable) ? 'CounterpartyPays' : 'InitiatorPays';

    const terms: NettingTerms = {
      grossReceivable,
      grossPayable,
      netAmount,
      currency,
      direction
    };

    return { lines, terms };
  }
}
