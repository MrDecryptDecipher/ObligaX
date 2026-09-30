import { z } from 'zod';

export const SettlementRailSchema = z.enum([
  'BankPaymentRail',
  'RTGS',
  'InternalLedger',
  'TokenizedDeposit',
  'Stablecoin',
  'SecuritiesSettlement',
  'ExternalCustodian'
]);

export const SettlementFailureReasonSchema = z.enum([
  'SettlementTimeout',
  'SettlementRailUnavailable',
  'InsufficientFunds',
  'ComplianceHold',
  'CounterpartyUnavailable',
  'InvalidSettlementReference',
  'DuplicateSettlement',
  'ExternalRejection',
  'TechnicalFailure',
  'UnknownSettlementFailure'
]);

export const InitiateSettlementSchema = z.object({
  settlementId: z.string().min(1, 'Settlement ID is required').max(128),
  obligationId: z.string().min(1, 'Obligation ID is required').max(128),
  settlementRail: SettlementRailSchema.default('RTGS'),
  sourceSystem: z.string().min(1).max(64),
  sourceReference: z.string().min(1).max(128)
});

export const CompleteSettlementSchema = z.object({
  externalTransactionId: z.string().min(1, 'External transaction ID is required').max(256),
  settlementReference: z.string().min(1, 'Settlement reference is required').max(256),
  processedAt: z.string().datetime({ offset: true }).optional()
});

export const FailSettlementSchema = z.object({
  reason: SettlementFailureReasonSchema,
  details: z.string().min(1, 'Failure details are required').max(2048),
  failedAt: z.string().datetime({ offset: true }).optional()
});

export const RetrySettlementSchema = z.object({
  failedSettlementId: z.string().min(1, 'Failed settlement ID is required').max(128),
  newSettlementId: z.string().min(1, 'New settlement ID is required').max(128),
  settlementReference: z.string().min(1, 'Settlement reference is required').max(256),
  settlementRail: SettlementRailSchema.default('RTGS'),
  sourceSystem: z.string().min(1).max(64),
  sourceReference: z.string().min(1).max(128)
});
