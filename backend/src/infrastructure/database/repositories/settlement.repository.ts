import { SettlementEntity, SettlementStatus } from '../../../domain/settlement/settlement.types';

export class SettlementRepository {
  private settlements: Map<string, SettlementEntity> = new Map();

  public async save(settlement: SettlementEntity): Promise<SettlementEntity> {
    this.settlements.set(settlement.settlementId, { ...settlement });
    return settlement;
  }

  public async findBySettlementId(settlementId: string): Promise<SettlementEntity | null> {
    return this.settlements.get(settlementId) || null;
  }

  public async findByObligationId(obligationId: string): Promise<SettlementEntity | null> {
    for (const s of this.settlements.values()) {
      if (s.obligationId === obligationId) return s;
    }
    return null;
  }

  public async updateStatus(
    settlementId: string,
    status: SettlementStatus,
    patch?: Partial<SettlementEntity>
  ): Promise<void> {
    const existing = this.settlements.get(settlementId);
    if (existing) {
      Object.assign(existing, { status, ...patch });
      this.settlements.set(settlementId, existing);
    }
  }
}
