import { CantonContractRecord } from '../../types/canton.types';
import { CantonLedgerClient } from './canton-ledger-client';
import { TEMPLATES } from './canton-command-builder';

export class CantonQueryService {
  constructor(private readonly ledgerClient: CantonLedgerClient) {}

  /**
   * Query active contracts of a specific template visible to a party
   */
  public async getActiveContractsByTemplate<T = Record<string, unknown>>(
    templateId: string,
    party: string
  ): Promise<CantonContractRecord<T>[]> {
    return this.ledgerClient.queryActiveContracts<T>(templateId, party);
  }

  /**
   * Fetch specific contract by contractId for a given party
   */
  public async getContractById<T = Record<string, unknown>>(
    contractId: string,
    party?: string
  ): Promise<CantonContractRecord<T> | null> {
    return this.ledgerClient.fetchContract<T>(contractId, party);
  }

  /**
   * Fetch active Obligation contract by business obligationId
   */
  public async findObligationByBusinessId(
    obligationId: string,
    party: string
  ): Promise<CantonContractRecord<Record<string, unknown>> | null> {
    const contracts = await this.getActiveContractsByTemplate(TEMPLATES.OBLIGATION, party);
    const found = contracts.find(c => c.payload && c.payload['obligationId'] === obligationId);
    return found || null;
  }

  /**
   * Fetch active NettingProposal contract by business nettingId
   */
  public async findNettingProposalByBusinessId(
    nettingId: string,
    party: string
  ): Promise<CantonContractRecord<Record<string, unknown>> | null> {
    const contracts = await this.getActiveContractsByTemplate(TEMPLATES.NETTING_PROPOSAL, party);
    const found = contracts.find(c => c.payload && c.payload['nettingId'] === nettingId);
    return found || null;
  }

  /**
   * Fetch active SettlementInstruction contract by settlementId
   */
  public async findSettlementInstructionByBusinessId(
    settlementId: string,
    party: string
  ): Promise<CantonContractRecord<Record<string, unknown>> | null> {
    const contracts = await this.getActiveContractsByTemplate(TEMPLATES.SETTLEMENT_INSTRUCTION, party);
    const found = contracts.find(c => c.payload && c.payload['settlementId'] === settlementId);
    return found || null;
  }
}
