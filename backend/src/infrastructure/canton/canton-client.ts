import {
  CantonContractRecord,
  CantonLedgerConfig,
  CantonSubmitRequest,
  CantonSubmitResult,
  CantonHealthStatus
} from '../../types/canton.types';
import { CantonLedgerClient } from './canton-ledger-client';
import { CantonAdminClient } from './canton-admin-client';
import { CantonQueryService } from './canton-query-service';
import { CantonPartyService } from './canton-party-service';
import { CantonPackageService } from './canton-package-service';
import { CantonEventStream } from './canton-event-stream';

/**
 * Enterprise Canton Ledger Adapter
 * ObligaX Backend -> Canton Ledger Adapter -> Canton Participant Node (Ledger API & Admin API)
 *
 * NO in-memory activeContracts Map
 * NO local command execution or choice simulation
 * Direct communication with real Canton Participant over Ledger API and Admin API
 */
export class CantonClient {
  public readonly ledgerClient: CantonLedgerClient;
  public readonly adminClient: CantonAdminClient;
  public readonly queryService: CantonQueryService;
  public readonly partyService: CantonPartyService;
  public readonly packageService: CantonPackageService;
  public readonly eventStream: CantonEventStream;

  constructor(private readonly config: CantonLedgerConfig) {
    this.ledgerClient = new CantonLedgerClient(config);
    this.adminClient = new CantonAdminClient(config);
    this.queryService = new CantonQueryService(this.ledgerClient);
    this.partyService = new CantonPartyService(this.adminClient);
    this.packageService = new CantonPackageService(this.adminClient);
    this.eventStream = new CantonEventStream(config);
  }

  /**
   * Health check verifying real Canton participant connectivity
   */
  public async healthCheck(): Promise<CantonHealthStatus> {
    return this.ledgerClient.healthCheck();
  }

  /**
   * Submit commands to real Canton participant node via Ledger API
   */
  public async submit(request: CantonSubmitRequest): Promise<CantonSubmitResult> {
    return this.ledgerClient.submitAndWait(request);
  }

  /**
   * Query active contracts from real Canton participant Active Contract Set (ACS)
   */
  public async queryActiveContracts<T = Record<string, unknown>>(
    templateId: string,
    party: string
  ): Promise<CantonContractRecord<T>[]> {
    return this.ledgerClient.queryActiveContracts<T>(templateId, party);
  }

  /**
   * Fetch specific contract from real Canton participant
   */
  public async fetchContract<T = Record<string, unknown>>(
    contractId: string,
    party?: string
  ): Promise<CantonContractRecord<T> | null> {
    return this.ledgerClient.fetchContract<T>(contractId, party);
  }

  public getConfig(): CantonLedgerConfig {
    return { ...this.config };
  }
}
