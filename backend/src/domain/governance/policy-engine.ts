import Decimal from 'decimal.js';
import { SafeDecimal } from '../../utils/decimal';
import {
  ParticipantPolicyProfile,
  PolicyEvaluationContext,
  PolicyDecision,
  InstitutionalTier
} from './policy.types';
import { DailyExposureTracker } from './daily-exposure.service';

/**
 * Enterprise Policy-as-Code Engine (Item 49)
 * Evaluates pre-submission business rules, participant tiers, risk limits,
 * currency corridors, and allowable settlement rails before DAML command dispatch.
 */
export class PolicyEngine {
  private readonly profiles: Map<string, ParticipantPolicyProfile> = new Map();

  constructor() {
    this.seedDefaultInstitutionalProfiles();
  }

  public registerProfile(profile: ParticipantPolicyProfile): void {
    this.profiles.set(profile.partyId, profile);
    const prefix = profile.partyId.split('::')[0];
    this.profiles.set(prefix, profile);
  }

  public getProfile(partyId: string): ParticipantPolicyProfile | undefined {
    return this.profiles.get(partyId) || this.profiles.get(partyId.split('::')[0]);
  }

  /**
   * Evaluates comprehensive institutional policy against transaction context
   */
  public evaluate(context: PolicyEvaluationContext): PolicyDecision {
    const violations: string[] = [];
    const partyProfile = this.getProfile(context.partyId);
    const counterpartyProfile = this.getProfile(context.counterpartyId);

    // 1. Sanctions & KYC screening
    if (partyProfile?.sanctionStatus === 'SUSPENDED' || partyProfile?.sanctionStatus === 'RESTRICTED') {
      violations.push(`POL-001: Submitting party '${context.partyId}' is in '${partyProfile.sanctionStatus}' status.`);
    }
    if (counterpartyProfile?.sanctionStatus === 'SUSPENDED' || counterpartyProfile?.sanctionStatus === 'RESTRICTED') {
      violations.push(`POL-002: Counterparty '${context.counterpartyId}' is in '${counterpartyProfile.sanctionStatus}' status.`);
    }

    // 2. Currency corridor authorization
    if (partyProfile && !partyProfile.allowedCurrencies.includes(context.currency)) {
      violations.push(
        `POL-003: Currency '${context.currency}' is outside permitted trading mandate for '${context.partyId}'.`
      );
    }

    // 3. Single-transaction exposure limit
    if (partyProfile && SafeDecimal.gt(context.amount, partyProfile.maxSingleTransactionLimit)) {
      violations.push(
        `POL-004: Transaction amount ${context.amount.toString()} exceeds maximum single transaction limit ${partyProfile.maxSingleTransactionLimit.toString()}.`
      );
    }

    // 4. Cumulative daily volume check (Item 50)
    if (partyProfile) {
      const allowedDaily = DailyExposureTracker.canAccommodateVolume(
        context.partyId,
        context.amount,
        partyProfile.maxDailyGrossVolumeLimit
      );
      if (!allowedDaily) {
        violations.push(
          `POL-005: Cumulative gross volume exceeds daily institutional cap of ${partyProfile.maxDailyGrossVolumeLimit.toString()} ${context.currency}.`
        );
      }
    }

    // 5. Settlement rail eligibility
    if (context.settlementRail && partyProfile) {
      if (!partyProfile.allowedSettlementRails.includes(context.settlementRail)) {
        violations.push(
          `POL-006: Settlement rail '${context.settlementRail}' is not authorized for participant tier '${partyProfile.tier}'.`
        );
      }
    }

    const allowed = violations.length === 0;
    return {
      allowed,
      decision: allowed ? 'APPROVED' : 'REJECTED',
      violations,
      evaluatedAt: new Date()
    };
  }

  private seedDefaultInstitutionalProfiles(): void {
    const tier1Rails = ['RTGS', 'Fedwire', 'TokenizedDeposit', 'Stablecoin', 'SecuritiesSettlement'];
    const tier2Rails = ['RTGS', 'Fedwire', 'BankPaymentRail'];

    this.registerProfile({
      partyId: 'BankA',
      organizationId: 'ORG_BANKA',
      tier: 'TIER_1_GLOBAL_SYSTEMIC',
      jurisdiction: 'US',
      allowedCurrencies: ['USD', 'EUR', 'GBP', 'CHF'],
      maxSingleTransactionLimit: new Decimal('100000000.00'), // $100M
      maxDailyGrossVolumeLimit: new Decimal('1000000000.00'),  // $1B
      allowedSettlementRails: tier1Rails,
      sanctionStatus: 'CLEARED'
    });

    this.registerProfile({
      partyId: 'BankB',
      organizationId: 'ORG_BANKB',
      tier: 'TIER_1_GLOBAL_SYSTEMIC',
      jurisdiction: 'EU',
      allowedCurrencies: ['USD', 'EUR', 'GBP', 'CHF'],
      maxSingleTransactionLimit: new Decimal('100000000.00'),
      maxDailyGrossVolumeLimit: new Decimal('1000000000.00'),
      allowedSettlementRails: tier1Rails,
      sanctionStatus: 'CLEARED'
    });

    this.registerProfile({
      partyId: 'BankC',
      organizationId: 'ORG_BANKC',
      tier: 'TIER_2_REGIONAL_DEPOSITORY',
      jurisdiction: 'GB',
      allowedCurrencies: ['USD', 'EUR', 'GBP'],
      maxSingleTransactionLimit: new Decimal('25000000.00'),
      maxDailyGrossVolumeLimit: new Decimal('250000000.00'),
      allowedSettlementRails: tier2Rails,
      sanctionStatus: 'CLEARED'
    });
  }
}

export const defaultPolicyEngine = new PolicyEngine();
