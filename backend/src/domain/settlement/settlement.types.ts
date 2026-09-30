import Decimal from 'decimal.js';
import { Currency } from '../obligation/obligation.types';

export type SettlementStatus =
  | 'SettlementCreated'
  | 'SettlementProcessing'
  | 'SettlementCompleted'
  | 'SettlementFailed'
  | 'SettlementCancelled';

export type SettlementRail =
  | 'BankPaymentRail'
  | 'RTGS'
  | 'InternalLedger'
  | 'TokenizedDeposit'
  | 'Stablecoin'
  | 'SecuritiesSettlement'
  | 'ExternalCustodian';

export type SettlementFailureReason =
  | 'SettlementTimeout'
  | 'SettlementRailUnavailable'
  | 'InsufficientFunds'
  | 'ComplianceHold'
  | 'CounterpartyUnavailable'
  | 'InvalidSettlementReference'
  | 'DuplicateSettlement'
  | 'ExternalRejection'
  | 'TechnicalFailure'
  | 'UnknownSettlementFailure';

export interface SettlementRequestMetadata {
  sourceSystem: string;
  sourceReference: string;
  settlementRail: SettlementRail;
  createdAt: Date;
  createdBy: string;
}

export interface SettlementExecutionMetadata {
  externalTransactionId: string;
  settlementReference: string;
  processedAt: Date;
  processedBy: string;
}

export interface SettlementFailureMetadata {
  reason: SettlementFailureReason;
  details: string;
  failedAt: Date;
  failedBy: string;
}

export interface SettlementEntity {
  id?: string;
  settlementId: string;
  contractId?: string;
  obligationId: string;
  obligationContractId: string;
  creditor: string;
  debtor: string;
  amount: Decimal;
  currency: Currency;
  status: SettlementStatus;
  requestMetadata: SettlementRequestMetadata;
  executionMetadata?: SettlementExecutionMetadata;
  failureMetadata?: SettlementFailureMetadata;
  retryCount: number;
}

export interface InitiateSettlementDto {
  settlementId: string;
  obligationId: string;
  settlementRail: SettlementRail;
  sourceSystem: string;
  sourceReference: string;
}

export interface CompleteSettlementDto {
  settlementId: string;
  externalTransactionId: string;
  settlementReference: string;
  processedAt?: Date;
}

export interface FailSettlementDto {
  settlementId: string;
  reason: SettlementFailureReason;
  details: string;
  failedAt?: Date;
}

export interface RetrySettlementDto {
  failedSettlementId: string;
  newSettlementId: string;
  settlementReference: string;
  settlementRail: SettlementRail;
  sourceSystem: string;
  sourceReference: string;
}
