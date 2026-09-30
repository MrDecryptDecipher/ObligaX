import Decimal from 'decimal.js';
import { Currency } from '../obligation/obligation.types';

export type InstitutionalTier = 'TIER_1_GLOBAL_SYSTEMIC' | 'TIER_2_REGIONAL_DEPOSITORY' | 'TIER_3_NON_BANK_CLEARING';

export type JurisdictionCode = 'US' | 'EU' | 'GB' | 'CH' | 'SG' | 'AU' | 'JP';

export interface ParticipantPolicyProfile {
  partyId: string;
  organizationId: string;
  tier: InstitutionalTier;
  jurisdiction: JurisdictionCode;
  allowedCurrencies: Currency[];
  maxSingleTransactionLimit: Decimal;
  maxDailyGrossVolumeLimit: Decimal;
  allowedSettlementRails: string[];
  sanctionStatus: 'CLEARED' | 'SUSPENDED' | 'RESTRICTED';
}

export interface PolicyEvaluationContext {
  partyId: string;
  counterpartyId: string;
  operation: 'CREATE_OBLIGATION' | 'ACCEPT_OBLIGATION' | 'CONFIRM_OBLIGATION' | 'PROPOSE_NETTING' | 'INITIATE_SETTLEMENT';
  amount: Decimal;
  currency: Currency;
  settlementRail?: string;
  traceId?: string;
}

export interface PolicyDecision {
  allowed: boolean;
  decision: 'APPROVED' | 'REJECTED' | 'MANUAL_REVIEW_REQUIRED';
  violations: string[];
  evaluatedAt: Date;
}
