export interface CantonLedgerConfig {
  host: string;
  port: number;
  adminPort: number;
  useTls: boolean;
  operatorParty: string;
  token?: string;
  timeoutMs: number;
}

export interface CantonExerciseCommand {
  type: 'exercise';
  templateId: string;
  contractId: string;
  choice: string;
  argument: Record<string, unknown>;
}

export interface CantonCreateCommand {
  type: 'create';
  templateId: string;
  argument: Record<string, unknown>;
}

export type CantonCommand = CantonCreateCommand | CantonExerciseCommand;

export interface CantonSubmitRequest {
  commands: CantonCommand[];
  commandId: string;
  actAs: string[];
  readAs?: string[];
  workflowId?: string;
}

export interface CantonContractRecord<T = Record<string, unknown>> {
  contractId: string;
  templateId: string;
  payload: T;
  signatories: string[];
  observers: string[];
  createdAt?: string;
}

export interface CantonSubmitResult {
  transactionId: string;
  commandId: string;
  effectiveTime: string;
  createdContractIds: string[];
  archivedContractIds: string[];
}
