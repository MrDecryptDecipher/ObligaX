import Decimal from 'decimal.js';
import { SafeDecimal } from '../../utils/decimal';
import { ForbiddenError } from '../../types/errors.types';

export interface DailyExposureRecord {
  partyId: string;
  dateString: string; // YYYY-MM-DD
  dailyGrossVolume: Decimal;
  dailyNetExposure: Decimal;
  dailySettlementVolume: Decimal;
  maximumDailyGrossVolume: Decimal;
  lastUpdated: Date;
}

export class DailyExposureTracker {
  private static store: Map<string, DailyExposureRecord> = new Map();

  private static getKey(partyId: string, date: Date): string {
    const dStr = date.toISOString().split('T')[0];
    return `${partyId}:::${dStr}`;
  }

  /**
   * Atomic recording of gross transaction volume against participant daily limits
   */
  public static recordTransaction(
    partyId: string,
    amount: Decimal,
    maxLimit: Decimal,
    date = new Date()
  ): DailyExposureRecord {
    const key = this.getKey(partyId, date);
    const existing = this.store.get(key) || {
      partyId,
      dateString: date.toISOString().split('T')[0],
      dailyGrossVolume: new Decimal(0),
      dailyNetExposure: new Decimal(0),
      dailySettlementVolume: new Decimal(0),
      maximumDailyGrossVolume: maxLimit,
      lastUpdated: new Date()
    };

    const newGross = SafeDecimal.add(existing.dailyGrossVolume, amount);

    // Enforce hard daily volume limit
    if (SafeDecimal.gt(newGross, existing.maximumDailyGrossVolume)) {
      throw new ForbiddenError(
        `LIMIT-001: Daily gross volume limit exceeded for participant '${partyId}'. Current: ${existing.dailyGrossVolume.toString()}, Attempted: ${amount.toString()}, Limit: ${existing.maximumDailyGrossVolume.toString()}`
      );
    }

    existing.dailyGrossVolume = newGross;
    existing.lastUpdated = new Date();
    this.store.set(key, existing);
    return existing;
  }

  public static getExposure(partyId: string, date = new Date()): DailyExposureRecord | null {
    const key = this.getKey(partyId, date);
    return this.store.get(key) || null;
  }

  public static clear(): void {
    this.store.clear();
  }
}
