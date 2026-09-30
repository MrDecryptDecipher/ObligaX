import Decimal from 'decimal.js';
import { Currency } from '../obligation/obligation.types';

export type ParticipantRole =
  | 'Issuer'
  | 'ObligationCounterparty'
  | 'SettlementParticipant'
  | 'NettingParticipant'
  | 'Auditor'
  | 'Regulator';

export type ParticipantTier = 'Tier1' | 'Tier2' | 'Tier3';

export type ParticipantStatus =
  | 'ParticipantPending'
  | 'ParticipantActive'
  | 'ParticipantSuspended'
  | 'ParticipantRevoked';

export interface ParticipantLimits {
  maximumObligationAmount: Decimal;
  maximumDailyGrossVolume: Decimal;
  maximumNettingAmount: Decimal;
}

export interface ParticipantCapabilities {
  canCreateObligations: boolean;
  canAcceptObligations: boolean;
  canConfirmObligations: boolean;
  canInitiateNetting: boolean;
  canParticipateInNetting: boolean;
  canInitiateSettlement: boolean;
  canProcessSettlement: boolean;
  canResolveDisputes: boolean;
  canProposeAmendments: boolean;
}

export interface ParticipantMetadata {
  legalName: string;
  legalEntityIdentifier: string;
  jurisdiction: string;
  businessUnit: string;
  sourceSystem: string;
  registeredAt: Date;
  registeredBy: string;
}

export interface ParticipantRegistrationEntity {
  id?: string;
  contractId?: string;
  participantId: string;
  party: string;
  participantName: string;
  tier: ParticipantTier;
  roles: ParticipantRole[];
  status: ParticipantStatus;
  supportedCurrencies: Currency[];
  limits: ParticipantLimits;
  capabilities: ParticipantCapabilities;
  metadata: ParticipantMetadata;
}

export interface ObligaXPolicyEntity {
  id?: string;
  contractId?: string;
  policyId: string;
  policyVersion: number;
  active: boolean;
  supportedCurrencies: Currency[];
  maximumObligationAmount: Decimal;
  maximumNettingAmount: Decimal;
  maximumSettlementAmount: Decimal;
  allowedRoles: ParticipantRole[];
  effectiveDate: Date;
}
