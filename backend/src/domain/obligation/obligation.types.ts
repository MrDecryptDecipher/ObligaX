import Decimal from 'decimal.js';

export type Currency = 'USD' | 'EUR' | 'GBP' | 'INR' | 'JPY' | 'CHF' | 'SGD' | 'AUD' | 'CAD';

export type ObligationStatus =
  | 'Proposed'
  | 'Accepted'
  | 'Confirmed'
  | 'AmendmentPending'
  | 'NettingPending'
  | 'SettlementPending'
  | 'Disputed'
  | 'Settled'
  | 'Netted'
  | 'Cancelled';

export type ObligationPriority = 'Low' | 'Normal' | 'High' | 'Urgent';

export type AmendmentField = 'AmendmentAmount' | 'AmendmentDueDate' | 'AmendmentDescription' | 'AmendmentPriority';

export type AmendmentStatus = 'AmendmentProposed' | 'AmendmentAccepted' | 'AmendmentRejected' | 'AmendmentCancelled';

export type DisputeStatus = 'DisputeProposed' | 'DisputeUnderReview' | 'DisputeResolved' | 'DisputeRejected';

export type DisputeReason =
  | 'IncorrectAmount'
  | 'IncorrectCurrency'
  | 'IncorrectDueDate'
  | 'DuplicateObligation'
  | 'UnauthorizedObligation'
  | 'IncorrectCounterparty'
  | 'SettlementFailure'
  | 'NettingError'
  | 'ContractualDisagreement'
  | 'OtherReason';

export interface ObligationMetadata {
  sourceSystem: string;
  sourceReference: string;
  businessUnit: string;
  createdBy: string;
  createdAt: Date;
  version: number;
}

export interface ObligationEntity {
  id?: string;
  contractId?: string;
  obligationId: string;
  creditor: string;
  debtor: string;
  description: string;
  amount: Decimal;
  currency: Currency;
  status: ObligationStatus;
  createdDate: Date;
  dueDate: Date;
  priority: ObligationPriority;
  version: number;
  metadata: ObligationMetadata;
}

export interface CreateObligationDto {
  creditor: string;
  debtor: string;
  obligationId: string;
  description: string;
  amount: string | number | Decimal;
  currency: Currency;
  createdDate: string | Date;
  dueDate: string | Date;
  priority?: ObligationPriority;
  sourceSystem: string;
  sourceReference: string;
  businessUnit: string;
}

export interface AmendmentEntity {
  id?: string;
  contractId?: string;
  obligationId: string;
  creditor: string;
  debtor: string;
  field: AmendmentField;
  originalAmount: Decimal;
  proposedAmount: Decimal;
  originalDueDate: Date;
  proposedDueDate: Date;
  proposedDescription: string;
  proposedBy: string;
  reason: string;
  status: AmendmentStatus;
  version: number;
  createdAt: Date;
}

export interface DisputeEntity {
  id?: string;
  contractId?: string;
  obligationId: string;
  initiator: string;
  respondent: string;
  reason: DisputeReason;
  details: string;
  status: DisputeStatus;
  resolutionDetails?: string;
  raisedAt: Date;
  resolvedAt?: Date;
}
