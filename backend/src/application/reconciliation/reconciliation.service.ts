import { ObligationRepository } from '../../infrastructure/database/repositories/obligation.repository';
import { CantonClient } from '../../infrastructure/canton/canton-client';
import { TEMPLATES } from '../../infrastructure/canton/canton-commands';
import { v4 as uuidv4 } from 'uuid';
import { SafeDecimal } from '../../utils/decimal';

export interface DiscrepancyItem {
  obligationId: string;
  type: 'MISSING_ON_LEDGER' | 'MISSING_IN_DB' | 'STATE_MISMATCH' | 'AMOUNT_MISMATCH';
  dbValue?: unknown;
  ledgerValue?: unknown;
}

export interface ReconciliationReport {
  reconciliationId: string;
  timestamp: Date;
  totalDbRecords: number;
  totalLedgerContracts: number;
  discrepancies: DiscrepancyItem[];
  isBalanced: boolean;
}

export class ReconciliationService {
  constructor(
    private readonly obligationRepo: ObligationRepository,
    private readonly cantonClient: CantonClient
  ) {}

  public async runObligationReconciliation(operatorParty: string): Promise<ReconciliationReport> {
    const reconciliationId = `rec-${uuidv4().substring(0, 8)}`;
    const timestamp = new Date();
    const discrepancies: DiscrepancyItem[] = [];

    // 1. Fetch all DB projections
    const dbResult = await this.obligationRepo.query({ limit: 500 });
    const dbObligations = dbResult.data;

    // 2. Fetch authoritative active contracts from Canton ledger
    const ledgerContracts = await this.cantonClient.queryActiveContracts(TEMPLATES.OBLIGATION, operatorParty);

    const ledgerMap = new Map<string, Record<string, unknown>>();
    for (const c of ledgerContracts) {
      const oblId = String(c.payload['obligationId']);
      ledgerMap.set(oblId, c.payload);
    }

    // 3. Compare DB against Ledger
    for (const dbObl of dbObligations) {
      const ledgerPayload = ledgerMap.get(dbObl.obligationId);

      if (!ledgerPayload) {
        // If it's in a terminal state (Settled, Netted, Cancelled), it might be consumed/archived on Canton
        if (!['Settled', 'Netted', 'Cancelled'].includes(dbObl.status)) {
          discrepancies.push({
            obligationId: dbObl.obligationId,
            type: 'MISSING_ON_LEDGER',
            dbValue: dbObl.status
          });
        }
        continue;
      }

      // Check state consistency
      const ledgerStatus = String(ledgerPayload['status']);
      if (ledgerStatus !== dbObl.status) {
        discrepancies.push({
          obligationId: dbObl.obligationId,
          type: 'STATE_MISMATCH',
          dbValue: dbObl.status,
          ledgerValue: ledgerStatus
        });
      }

      // Check amount consistency
      const ledgerAmount = SafeDecimal.from(String(ledgerPayload['amount']));
      if (!SafeDecimal.eq(ledgerAmount, dbObl.amount)) {
        discrepancies.push({
          obligationId: dbObl.obligationId,
          type: 'AMOUNT_MISMATCH',
          dbValue: dbObl.amount.toString(),
          ledgerValue: ledgerAmount.toString()
        });
      }
    }

    return {
      reconciliationId,
      timestamp,
      totalDbRecords: dbObligations.length,
      totalLedgerContracts: ledgerContracts.length,
      discrepancies,
      isBalanced: discrepancies.length === 0
    };
  }
}
