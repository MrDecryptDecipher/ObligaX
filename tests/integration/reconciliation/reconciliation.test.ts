import { ReconciliationService } from '@/application/reconciliation/reconciliation.service';
import { ObligationRepository } from '@/infrastructure/database/repositories/obligation.repository';
import { CantonClient } from '@/infrastructure/canton/canton-client';
import { getCantonConfig } from '@/infrastructure/canton/canton-config';
import { TEMPLATES } from '@/infrastructure/canton/canton-commands';
import { defaultCantonWireServer } from '../../test-harness/canton-wire-server';
import Decimal from 'decimal.js';

describe('ReconciliationService Integration', () => {
  let reconciliationService: ReconciliationService;
  let obligationRepo: ObligationRepository;
  let cantonClient: CantonClient;

  beforeEach(() => {
    cantonClient = new CantonClient(getCantonConfig());
    obligationRepo = new ObligationRepository();
    reconciliationService = new ReconciliationService(obligationRepo, cantonClient);
  });

  test('reports balanced when database and Canton ledger are in sync', async () => {
    const oblId = 'REC-OBL-001';
    const amount = new Decimal('50000');

    // 1. Seed DB
    await obligationRepo.save({
      obligationId: oblId,
      contractId: '#c-100',
      creditor: 'BankB',
      debtor: 'BankA',
      description: 'Reconciliation test',
      amount,
      currency: 'USD',
      status: 'Confirmed',
      createdDate: new Date('2026-09-30'),
      dueDate: new Date('2026-10-31'),
      priority: 'Normal',
      version: 1,
      metadata: {
        sourceSystem: 'Core',
        sourceReference: 'REF',
        businessUnit: 'Treasury',
        createdBy: 'BankB',
        createdAt: new Date(),
        version: 1
      }
    });

    // 2. Seed Canton active contract set
    defaultCantonWireServer.seedContract({
      contractId: '#c-100',
      templateId: TEMPLATES.OBLIGATION,
      signatories: ['BankA', 'BankB'],
      observers: [],
      payload: {
        obligationId: oblId,
        creditor: 'BankB',
        debtor: 'BankA',
        amount: '50000',
        currency: 'USD',
        status: 'Confirmed',
        version: 1
      }
    });

    const report = await reconciliationService.runObligationReconciliation('NetworkOperator');
    expect(report.isBalanced).toBe(true);
    expect(report.discrepancies).toHaveLength(0);
  });

  test('detects state mismatch drift between DB projection and Canton ledger', async () => {
    const oblId = 'REC-DRIFT-001';

    // DB thinks it is Confirmed
    await obligationRepo.save({
      obligationId: oblId,
      contractId: '#c-200',
      creditor: 'BankB',
      debtor: 'BankA',
      description: 'Drift test',
      amount: new Decimal('10000'),
      currency: 'USD',
      status: 'Confirmed',
      createdDate: new Date(),
      dueDate: new Date(),
      priority: 'Normal',
      version: 2,
      metadata: {
        sourceSystem: 'Core',
        sourceReference: 'REF',
        businessUnit: 'Treasury',
        createdBy: 'BankB',
        createdAt: new Date(),
        version: 2
      }
    });

    // Canton Ledger actually transitioned to SettlementPending
    defaultCantonWireServer.seedContract({
      contractId: '#c-201',
      templateId: TEMPLATES.OBLIGATION,
      signatories: ['BankA', 'BankB'],
      observers: [],
      payload: {
        obligationId: oblId,
        creditor: 'BankB',
        debtor: 'BankA',
        amount: '10000',
        currency: 'USD',
        status: 'SettlementPending',
        version: 3
      }
    });

    const report = await reconciliationService.runObligationReconciliation('NetworkOperator');
    expect(report.isBalanced).toBe(false);
    expect(report.discrepancies).toHaveLength(1);
    expect(report.discrepancies[0]?.type).toBe('STATE_MISMATCH');
    expect(report.discrepancies[0]?.dbValue).toBe('Confirmed');
    expect(report.discrepancies[0]?.ledgerValue).toBe('SettlementPending');
  });
});
