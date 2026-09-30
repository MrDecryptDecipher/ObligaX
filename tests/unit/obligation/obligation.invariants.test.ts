import Decimal from 'decimal.js';
import { ObligationStateMachine } from '../../../backend/src/domain/obligation/obligation.state-machine';
import { ObligationDomainRules } from '../../../backend/src/domain/obligation/obligation.rules';
import { NettingCalculator } from '../../../backend/src/domain/netting/netting-calculator';
import { SettlementDomainRules } from '../../../backend/src/domain/settlement/settlement.rules';
import { ObligationEntity, ObligationStatus } from '../../../backend/src/domain/obligation/obligation.types';

describe('ObligaX Domain Invariants Test Suite (Item 64)', () => {
  const buildMockObligation = (status: ObligationStatus, amount = '100000.00', currency = 'USD'): ObligationEntity => ({
    contractId: '#c-inv-001',
    obligationId: 'OBL-INV-001',
    creditor: 'BankB',
    debtor: 'BankA',
    description: 'Invariant obligation',
    amount: new Decimal(amount),
    currency: currency as any,
    status,
    createdDate: new Date('2026-09-30'),
    dueDate: new Date('2026-10-31'),
    priority: 'Normal',
    version: 1,
    metadata: {
      sourceSystem: 'TradingDesk',
      sourceReference: 'REF-INV',
      businessUnit: 'Treasury',
      createdBy: 'BankA',
      createdAt: new Date(),
      version: 1
    }
  });

  test('Invariant 1: Terminal state (Settled) cannot transition to any other state (e.g. Proposed, Confirmed)', () => {
    const invalidNextStates: ObligationStatus[] = [
      'Proposed',
      'Accepted',
      'Confirmed',
      'SettlementPending',
      'NettingPending',
      'Netted',
      'Disputed',
      'AmendmentPending',
      'Cancelled'
    ];

    for (const nextState of invalidNextStates) {
      expect(() => {
        ObligationStateMachine.assertTransition('Settled', nextState, 'OBL-INV-001');
      }).toThrow();
    }
  });

  test('Invariant 2: Terminal state (Netted) cannot transition to any other state or be settled independently', () => {
    const invalidNextStates: ObligationStatus[] = [
      'Proposed',
      'Accepted',
      'Confirmed',
      'SettlementPending',
      'Settled',
      'NettingPending',
      'Disputed',
      'AmendmentPending'
    ];

    for (const nextState of invalidNextStates) {
      expect(() => {
        ObligationStateMachine.assertTransition('Netted', nextState, 'OBL-INV-001');
      }).toThrow();
    }

    // Direct settlement initiation must reject netted obligation
    const nettedObl = buildMockObligation('Netted');
    expect(() => {
      SettlementDomainRules.validateInitiate(
        {
          settlementId: 'SETTLE-001',
          obligationId: nettedObl.obligationId,
          settlementRail: 'RTGS',
          sourceSystem: 'Core',
          sourceReference: 'REF-1'
        },
        nettedObl,
        'BankB'
      );
    }).toThrow('SET-RULE-002');
  });

  test('Invariant 3: Creditor and Debtor must be distinct institutional entities (Payer != Payee)', () => {
    expect(() => {
      ObligationDomainRules.validateCreateProposal({
        obligationId: 'OBL-SAME-PARTY',
        creditor: 'BankA',
        debtor: 'BankA',
        description: 'Illegal self-obligation',
        amount: '50000.00',
        currency: 'USD',
        createdDate: '2026-09-30',
        dueDate: '2026-10-31',
        sourceSystem: 'Core',
        sourceReference: 'REF-SAME',
        businessUnit: 'Treasury'
      });
    }).toThrow('OBL-RULE-004');
  });

  test('Invariant 4: Netting set currency consistency — all obligations must match the netting currency', () => {
    const oblUsd = buildMockObligation('Confirmed', '100000.00', 'USD');
    const oblEur = buildMockObligation('Confirmed', '50000.00', 'EUR');
    oblEur.obligationId = 'OBL-INV-EUR';

    expect(() => {
      NettingCalculator.calculateBilateralNetting('BankA', 'BankB', 'USD', [oblUsd, oblEur]);
    }).toThrow('NET-CALC-004');
  });

  test('Invariant 5: Zero-sum cancellation is rejected — netting must yield net economic movement > 0', () => {
    const leg1 = buildMockObligation('Confirmed', '100000.00', 'USD');
    const leg2: ObligationEntity = {
      ...buildMockObligation('Confirmed', '100000.00', 'USD'),
      obligationId: 'OBL-INV-002',
      creditor: 'BankA',
      debtor: 'BankB'
    };

    expect(() => {
      NettingCalculator.calculateBilateralNetting('BankA', 'BankB', 'USD', [leg1, leg2]);
    }).toThrow('NET-CALC-007');
  });

  test('Invariant 6: Non-Confirmed obligations cannot enter settlement', () => {
    const unconfirmedStatuses: ObligationStatus[] = ['Proposed', 'Accepted', 'NettingPending', 'Netted', 'Settled', 'Disputed', 'Cancelled'];

    for (const st of unconfirmedStatuses) {
      const obl = buildMockObligation(st);
      expect(() => {
        SettlementDomainRules.validateInitiate(
          {
            settlementId: 'SETTLE-INVALID',
            obligationId: obl.obligationId,
            settlementRail: 'RTGS',
            sourceSystem: 'Core',
            sourceReference: 'REF-1'
          },
          obl,
          'BankB'
        );
      }).toThrow('SET-RULE-002');
    }
  });
});
