import Decimal from 'decimal.js';
import { Currency } from '../obligation/obligation.types';

export type NettingStatus =
  | 'NettingProposed'
  | 'NettingAccepted'
  | 'NettingRejected'
  | 'NettingCancelled'
  | 'NettingExecuted';

export type NettingDirection = 'InitiatorPays' | 'CounterpartyPays';

export type NetSettlementStatus =
  | 'NetSettlementCreated'
  | 'NetSettlementProcessing'
  | 'NetSettlementCompleted'
  | 'NetSettlementFailed';

export interface NettingLine {
  obligationId: string;
  obligationContractId: string;
  creditor: string;
  debtor: string;
  amount: Decimal;
  currency: Currency;
}

export interface NettingTerms {
  grossReceivable: Decimal;
  grossPayable: Decimal;
  netAmount: Decimal;
  currency: Currency;
  direction: NettingDirection;
}

export interface NettingMetadata {
  sourceSystem: string;
  sourceReference: string;
  createdBy: string;
  createdAt: Date;
  businessUnit: string;
}

export interface NettingProposalEntity {
  id?: string;
  contractId?: string;
  nettingId: string;
  initiator: string;
  counterparty: string;
  lines: NettingLine[];
  terms: NettingTerms;
  status: NettingStatus;
  createdDate: Date;
  metadata: NettingMetadata;
}

export interface NettingSettlementEntity {
  id?: string;
  contractId?: string;
  nettingId: string;
  initiator: string;
  counterparty: string;
  lines: NettingLine[];
  terms: NettingTerms;
  executedDate: Date;
  metadata: NettingMetadata;
}

export interface ProposeNettingDto {
  nettingId: string;
  initiator: string;
  counterparty: string;
  obligationIds: string[];
  currency: Currency;
  sourceSystem: string;
  sourceReference: string;
  businessUnit: string;
}
