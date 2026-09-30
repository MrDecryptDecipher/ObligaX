import { NettingProposalEntity, NettingSettlementEntity, NettingStatus } from '../../../domain/netting/netting.types';

export class NettingRepository {
  private proposals: Map<string, NettingProposalEntity> = new Map();
  private settlements: Map<string, NettingSettlementEntity> = new Map();

  public async saveProposal(proposal: NettingProposalEntity): Promise<NettingProposalEntity> {
    this.proposals.set(proposal.nettingId, { ...proposal });
    return proposal;
  }

  public async findProposalById(nettingId: string): Promise<NettingProposalEntity | null> {
    return this.proposals.get(nettingId) || null;
  }

  public async updateProposalStatus(
    nettingId: string,
    status: NettingStatus,
    newContractId?: string
  ): Promise<void> {
    const existing = this.proposals.get(nettingId);
    if (existing) {
      existing.status = status;
      if (newContractId) {
        existing.contractId = newContractId;
      }
      this.proposals.set(nettingId, existing);
    }
  }

  public async saveSettlement(settlement: NettingSettlementEntity): Promise<NettingSettlementEntity> {
    this.settlements.set(settlement.nettingId, { ...settlement });
    return settlement;
  }

  public async findSettlementById(nettingId: string): Promise<NettingSettlementEntity | null> {
    return this.settlements.get(nettingId) || null;
  }


  public async queryProposals(filters?: {
    initiator?: string;
    counterparty?: string;
    status?: NettingStatus;
  }): Promise<NettingProposalEntity[]> {
    let items = Array.from(this.proposals.values());
    if (filters?.initiator) items = items.filter(p => p.initiator === filters.initiator);
    if (filters?.counterparty) items = items.filter(p => p.counterparty === filters.counterparty);
    if (filters?.status) items = items.filter(p => p.status === filters.status);
    return items;
  }

  public async findAllSettlements(): Promise<NettingSettlementEntity[]> {
    return Array.from(this.settlements.values());
  }
}

