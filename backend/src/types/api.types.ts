import { Currency, ObligationPriority, ObligationStatus } from '../domain/obligation/obligation.types';
import { SettlementRail } from '../domain/settlement/settlement.types';

export interface CreateObligationRequest {
  creditor: string;
  debtor: string;
  obligationId: string;
  description: string;
  amount: string;
  currency: Currency;
  createdDate: string;
  dueDate: string;
  priority?: ObligationPriority;
  sourceSystem: string;
  sourceReference: string;
  businessUnit: string;
}

export interface ProposeAmendmentRequest {
  field: 'AmendmentAmount' | 'AmendmentDueDate' | 'AmendmentDescription' | 'AmendmentPriority';
  proposedAmount?: string;
  proposedDueDate?: string;
  proposedDescription?: string;
  reason: string;
}

export interface RaiseDisputeRequest {
  reason:
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
  details: string;
}

export interface ProposeNettingRequest {
  nettingId: string;
  counterparty: string;
  obligationIds: string[];
  currency: Currency;
  sourceSystem: string;
  sourceReference: string;
  businessUnit: string;
}

export interface InitiateSettlementRequest {
  settlementId: string;
  obligationId: string;
  settlementRail: SettlementRail;
  sourceSystem: string;
  sourceReference: string;
}

export interface QueryObligationsFilter {
  creditor?: string;
  debtor?: string;
  status?: ObligationStatus;
  currency?: Currency;
  dueBefore?: string;
  dueAfter?: string;
  page?: number;
  limit?: number;
}
