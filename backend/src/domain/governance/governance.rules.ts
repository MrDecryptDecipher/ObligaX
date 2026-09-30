import { ObligaXPolicyEntity, ParticipantRegistrationEntity } from './governance.types';
import { Currency } from '../obligation/obligation.types';
import { SafeDecimal } from '../../utils/decimal';
import Decimal from 'decimal.js';

export class GovernanceDomainRules {
  public static validateAgainstPolicy(
    policy: ObligaXPolicyEntity,
    amount: Decimal.Value,
    currency: Currency
  ): void {
    if (!policy.active) {
      throw new Error(`GOV-RULE-001: ObligaX network policy '${policy.policyId}' is inactive.`);
    }

    if (!policy.supportedCurrencies.includes(currency)) {
      throw new Error(`GOV-RULE-002: Currency '${currency}' is not supported by network policy (supported: ${policy.supportedCurrencies.join(', ')}).`);
    }

    const amt = SafeDecimal.from(amount);
    if (SafeDecimal.gt(amt, policy.maximumObligationAmount)) {
      throw new Error(
        `GOV-RULE-003: Amount '${amt.toString()}' exceeds policy maximum obligation limit '${policy.maximumObligationAmount.toString()}'.`
      );
    }
  }

  public static validateParticipantActive(participant: ParticipantRegistrationEntity): void {
    if (participant.status !== 'ParticipantActive') {
      throw new Error(
        `GOV-RULE-004: Participant '${participant.participantId}' is not active on the network (status: ${participant.status}).`
      );
    }
  }
}
