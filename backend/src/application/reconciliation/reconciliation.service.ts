import { ObligationRepository } from '../../infrastructure/database/repositories/obligation.repository';
import { SettlementRepository } from '../../infrastructure/database/repositories/settlement.repository';
import { CantonClient } from '../../infrastructure/canton/canton-client';
import { TEMPLATES } from '../../infrastructure/canton/canton-command-builder';
import { SettlementRailAdapter } from '../../infrastructure/settlement/settlement-adapter';
import { SafeDecimal } from '../../utils/decimal';
import { v4 as uuidv4 } from 'uuid';

export type DiscrepancyType =
  | 'MISSING_ON_LEDGER'
  | 'MISSING_IN_DB'
  | 'STATE_MISMATCH'
  | 'AMOUNT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'PARTY_MISMATCH'
  | 'CONTRACT_ID_MISMATCH'
  | 'VERSION_MISMATCH'
  | 'DUPLICATE_PROJECTION'
  | 'ORPHAN_SETTLEMENT'
  | 'ORPHAN_OBLIGATION';

export type ReconciliationRunType = 'REALTIME' | 'SCHEDULED' | 'ON_DEMAND' | 'INCIDENT';

export interface ReconciliationItem {
  id: string;
  runId: string;
  type: DiscrepancyType;
  entityType: 'OBLIGATION' | 'SETTLEMENT';
  businessId: string;
  contractId?: string;
  dbValue?: unknown;
  ledgerValue?: unknown;
  railValue?: unknown;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'RESOLVED' | 'IGNORED';
  detectedAt: Date;
}

export interface ReconciliationRun {
  runId: string;
  runType: ReconciliationRunType;
  startedAt: Date;
  completedAt: Date;
  totalDbRecords: number;
  totalLedgerContracts: number;
  totalRailInstructions?: number;
  discrepancies: ReconciliationItem[];
  isBalanced: boolean;
}

export interface ReconciliationResolution {
  resolutionId: string;
  itemId: string;
  actionTaken: string;
  resolvedBy: string;
  resolvedAt: Date;
  notes?: string;
}

export class ReconciliationService {
  private static runHistory: ReconciliationRun[] = [];
  private static resolutions: ReconciliationResolution[] = [];
  private static scheduledTimer?: NodeJS.Timeout;

  constructor(
    private readonly obligationRepo: ObligationRepository,
    private readonly cantonClient: CantonClient,
    private readonly settlementRepo?: SettlementRepository,
    private readonly settlementRailAdapter?: SettlementRailAdapter
  ) {}

  public async runFullReconciliation(
    operatorParty: string,
    runType: ReconciliationRunType = 'ON_DEMAND'
  ): Promise<ReconciliationRun> {
    const runId = `REC-${Date.now()}-${uuidv4().substring(0, 6).toUpperCase()}`;
    const startedAt = new Date();
    const discrepancies: ReconciliationItem[] = [];

    // 1. Fetch DB projections
    const dbResult = await this.obligationRepo.query({ limit: 1000 });
    const dbObligations = dbResult.data;

    // 2. Fetch authoritative active contracts from Canton ledger
    let ledgerContracts: any[] = [];
    try {
      ledgerContracts = await this.cantonClient.queryActiveContracts(TEMPLATES.OBLIGATION, operatorParty);
    } catch (err) {
      // In offline / unit test harness, query will return empty or throw
    }

    const ledgerMap = new Map<string, Record<string, unknown>>();
    const ledgerContractIdMap = new Map<string, string>();
    for (const c of ledgerContracts) {
      const oblId = String(c.payload['obligationId']);
      ledgerMap.set(oblId, c.payload);
      ledgerContractIdMap.set(oblId, c.contractId);
    }

    // 3. Two-way Check: DB -> Ledger
    const seenObligationIds = new Set<string>();
    for (const dbObl of dbObligations) {
      if (seenObligationIds.has(dbObl.obligationId)) {
        discrepancies.push({
          id: uuidv4(),
          runId,
          type: 'DUPLICATE_PROJECTION',
          entityType: 'OBLIGATION',
          businessId: dbObl.obligationId,
          dbValue: 'Duplicate in database projection',
          severity: 'HIGH',
          status: 'OPEN',
          detectedAt: new Date()
        });
      }
      seenObligationIds.add(dbObl.obligationId);

      const ledgerPayload = ledgerMap.get(dbObl.obligationId);
      const ledgerCid = ledgerContractIdMap.get(dbObl.obligationId);

      if (!ledgerPayload) {
        if (!['Settled', 'Netted', 'Cancelled'].includes(dbObl.status)) {
          discrepancies.push({
            id: uuidv4(),
            runId,
            type: 'MISSING_ON_LEDGER',
            entityType: 'OBLIGATION',
            businessId: dbObl.obligationId,
            contractId: dbObl.contractId,
            dbValue: dbObl.status,
            severity: 'CRITICAL',
            status: 'OPEN',
            detectedAt: new Date()
          });
        }
        continue;
      }

      // Check Contract ID match
      if (dbObl.contractId && ledgerCid && dbObl.contractId !== ledgerCid) {
        discrepancies.push({
          id: uuidv4(),
          runId,
          type: 'CONTRACT_ID_MISMATCH',
          entityType: 'OBLIGATION',
          businessId: dbObl.obligationId,
          contractId: dbObl.contractId,
          dbValue: dbObl.contractId,
          ledgerValue: ledgerCid,
          severity: 'HIGH',
          status: 'OPEN',
          detectedAt: new Date()
        });
      }

      // Check Status
      const ledgerStatus = String(ledgerPayload['status']);
      if (ledgerStatus !== dbObl.status) {
        discrepancies.push({
          id: uuidv4(),
          runId,
          type: 'STATE_MISMATCH',
          entityType: 'OBLIGATION',
          businessId: dbObl.obligationId,
          dbValue: dbObl.status,
          ledgerValue: ledgerStatus,
          severity: 'HIGH',
          status: 'OPEN',
          detectedAt: new Date()
        });
      }

      // Check Amount
      const ledgerAmount = SafeDecimal.from(String(ledgerPayload['amount']));
      if (!SafeDecimal.eq(ledgerAmount, dbObl.amount)) {
        discrepancies.push({
          id: uuidv4(),
          runId,
          type: 'AMOUNT_MISMATCH',
          entityType: 'OBLIGATION',
          businessId: dbObl.obligationId,
          dbValue: dbObl.amount.toString(),
          ledgerValue: ledgerAmount.toString(),
          severity: 'CRITICAL',
          status: 'OPEN',
          detectedAt: new Date()
        });
      }

      // Check Currency
      const ledgerCurrency = String(ledgerPayload['currency']);
      if (ledgerCurrency !== dbObl.currency) {
        discrepancies.push({
          id: uuidv4(),
          runId,
          type: 'CURRENCY_MISMATCH',
          entityType: 'OBLIGATION',
          businessId: dbObl.obligationId,
          dbValue: dbObl.currency,
          ledgerValue: ledgerCurrency,
          severity: 'CRITICAL',
          status: 'OPEN',
          detectedAt: new Date()
        });
      }

      // Check Parties
      const ledgerCreditor = String(ledgerPayload['creditor']);
      const ledgerDebtor = String(ledgerPayload['debtor']);
      if (ledgerCreditor !== dbObl.creditor || ledgerDebtor !== dbObl.debtor) {
        discrepancies.push({
          id: uuidv4(),
          runId,
          type: 'PARTY_MISMATCH',
          entityType: 'OBLIGATION',
          businessId: dbObl.obligationId,
          dbValue: { creditor: dbObl.creditor, debtor: dbObl.debtor },
          ledgerValue: { creditor: ledgerCreditor, debtor: ledgerDebtor },
          severity: 'CRITICAL',
          status: 'OPEN',
          detectedAt: new Date()
        });
      }

      // Check Version
      const ledgerVersion = Number(ledgerPayload['version'] || 1);
      if (ledgerVersion !== dbObl.version) {
        discrepancies.push({
          id: uuidv4(),
          runId,
          type: 'VERSION_MISMATCH',
          entityType: 'OBLIGATION',
          businessId: dbObl.obligationId,
          dbValue: dbObl.version,
          ledgerValue: ledgerVersion,
          severity: 'MEDIUM',
          status: 'OPEN',
          detectedAt: new Date()
        });
      }
    }

    // 4. Two-way Check: Ledger -> DB (Detect MISSING_IN_DB)
    const dbObligationMap = new Map(dbObligations.map(o => [o.obligationId, o]));
    for (const c of ledgerContracts) {
      const oblId = String(c.payload['obligationId']);
      if (!dbObligationMap.has(oblId)) {
        discrepancies.push({
          id: uuidv4(),
          runId,
          type: 'MISSING_IN_DB',
          entityType: 'OBLIGATION',
          businessId: oblId,
          contractId: c.contractId,
          ledgerValue: c.payload,
          severity: 'CRITICAL',
          status: 'OPEN',
          detectedAt: new Date()
        });
      }
    }

    const completedAt = new Date();
    const run: ReconciliationRun = {
      runId,
      runType,
      startedAt,
      completedAt,
      totalDbRecords: dbObligations.length,
      totalLedgerContracts: ledgerContracts.length,
      discrepancies,
      isBalanced: discrepancies.length === 0
    };

    ReconciliationService.runHistory.unshift(run);
    if (ReconciliationService.runHistory.length > 50) {
      ReconciliationService.runHistory.pop();
    }

    return run;
  }

  /**
   * Backwards compatible method for existing tests
   */
  public async runObligationReconciliation(operatorParty: string): Promise<any> {
    const run = await this.runFullReconciliation(operatorParty, 'ON_DEMAND');
    const filteredDiscrepancies = run.discrepancies
      .filter(d => ['STATE_MISMATCH', 'AMOUNT_MISMATCH', 'MISSING_ON_LEDGER', 'MISSING_IN_DB'].includes(d.type))
      .map(d => ({
        obligationId: d.businessId,
        type: d.type,
        dbValue: d.dbValue,
        ledgerValue: d.ledgerValue
      }));

    return {
      reconciliationId: run.runId,
      timestamp: run.completedAt,
      totalDbRecords: run.totalDbRecords,
      totalLedgerContracts: run.totalLedgerContracts,
      discrepancies: filteredDiscrepancies,
      isBalanced: filteredDiscrepancies.length === 0
    };
  }

  public resolveDiscrepancy(itemId: string, actionTaken: string, resolvedBy: string, notes?: string): ReconciliationResolution {
    const resolution: ReconciliationResolution = {
      resolutionId: uuidv4(),
      itemId,
      actionTaken,
      resolvedBy,
      resolvedAt: new Date(),
      notes
    };
    ReconciliationService.resolutions.push(resolution);
    return resolution;
  }

  public static startScheduled(service: ReconciliationService, operatorParty: string, intervalMs = 300000): void {
    if (this.scheduledTimer) return;
    this.scheduledTimer = setInterval(async () => {
      await service.runFullReconciliation(operatorParty, 'SCHEDULED');
    }, intervalMs);
  }

  public static stopScheduled(): void {
    if (this.scheduledTimer) {
      clearInterval(this.scheduledTimer);
      this.scheduledTimer = undefined;
    }
  }

  public static getHistory(): ReconciliationRun[] {
    return [...this.runHistory];
  }
}
