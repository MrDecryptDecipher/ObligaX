import Decimal from 'decimal.js';

export interface SettlementInstructionParams {
  settlementId: string;
  obligationId: string;
  payer: string;
  payee: string;
  amount: Decimal;
  currency: string;
  reference: string;
  traceId?: string;
}

export interface SettlementInitiation {
  rail: string;
  settlementId: string;
  externalTransactionId: string;
  status: 'PENDING' | 'SUBMITTED' | 'REJECTED';
  acknowledgementReference: string;
  initiatedAt: Date;
  details?: Record<string, unknown>;
}

export interface RailSettlementStatus {
  externalTransactionId: string;
  settlementId: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  completedAt?: Date;
  failureReason?: string;
  failureDetails?: string;
}

export interface SettlementCancellation {
  settlementId: string;
  externalTransactionId: string;
  cancelled: boolean;
  reason?: string;
  cancelledAt: Date;
}

export interface SettlementRail {
  readonly railName: string;
  initiate(instruction: SettlementInstructionParams): Promise<SettlementInitiation>;
  status(externalTransactionId: string, settlementId: string): Promise<RailSettlementStatus>;
  cancel(externalTransactionId: string, settlementId: string, reason: string): Promise<SettlementCancellation>;
}
