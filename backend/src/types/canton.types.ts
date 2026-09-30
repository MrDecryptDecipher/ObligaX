export interface CantonLedgerConfig {
  host: string;
  port: number;
  adminPort: number;
  useTls: boolean;
  tlsCaCertPath?: string;
  tlsClientCertPath?: string;
  tlsClientKeyPath?: string;
  operatorParty: string;
  participantId?: string;
  synchronizerId?: string;
  token?: string;
  timeoutMs: number;
  ledgerApiVersion?: string;
}

export interface CantonCreateCommand {
  type: 'create';
  templateId: string;
  argument: Record<string, unknown>;
}

export interface CantonExerciseCommand {
  type: 'exercise';
  templateId: string;
  contractId: string;
  choice: string;
  argument: Record<string, unknown>;
}

export interface CantonExerciseByKeyCommand {
  type: 'exerciseByKey';
  templateId: string;
  contractKey: Record<string, unknown>;
  choice: string;
  argument: Record<string, unknown>;
}

export interface CantonCreateAndExerciseCommand {
  type: 'createAndExercise';
  templateId: string;
  payload: Record<string, unknown>;
  choice: string;
  argument: Record<string, unknown>;
}

export type CantonCommand =
  | CantonCreateCommand
  | CantonExerciseCommand
  | CantonExerciseByKeyCommand
  | CantonCreateAndExerciseCommand;

export interface CantonSubmitRequest {
  commands: CantonCommand[];
  commandId: string;
  actAs: string[];
  readAs?: string[];
  workflowId?: string;
  deduplicationPeriodMs?: number;
  minLedgerTimeAbs?: string;
  minLedgerTimeRelMs?: number;
}

export interface CantonContractRecord<T = Record<string, unknown>> {
  contractId: string;
  templateId: string;
  payload: T;
  signatories: string[];
  observers: string[];
  createdAt?: string;
  packageId?: string;
}

export interface CantonSubmitResult {
  transactionId: string;
  commandId: string;
  effectiveTime: string;
  offset?: string;
  createdContractIds: string[];
  archivedContractIds: string[];
  events?: CantonLedgerEventWire[];
}

export interface CantonLedgerEventWire {
  created?: {
    contractId: string;
    templateId: string;
    payload: Record<string, unknown>;
    signatories: string[];
    observers: string[];
    createdAt?: string;
    packageId?: string;
  };
  archived?: {
    contractId: string;
    templateId: string;
  };
  offset?: string;
  eventId?: string;
}

export interface CantonPartyDetails {
  party: string;
  displayName: string;
  isLocal: boolean;
  namespace?: string;
  participantId?: string;
}

export interface CantonPackageDetails {
  packageId: string;
  packageName?: string;
  packageVersion?: string;
  sourceDescription?: string;
  uploadedAt?: string;
  vetted?: boolean;
}

export interface CantonHealthStatus {
  connected: boolean;
  mode: 'live-canton' | 'error';
  participantId?: string;
  synchronizerId?: string;
  ledgerApiVersion: string;
  details?: unknown;
}
