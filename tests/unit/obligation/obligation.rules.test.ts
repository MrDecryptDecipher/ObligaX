import { ObligationDomainRules } from '@/domain/obligation/obligation.rules';
import { ObligationStateMachine } from '@/domain/obligation/obligation.state-machine';
import { CreateObligationDto, ObligationEntity } from '@/domain/obligation/obligation.types';
import Decimal from 'decimal.js';

describe('ObligationDomainRules and ObligationStateMachine', () => {
  const validDto: CreateObligationDto = {
    obligationId: 'OBL-TEST-001',
    creditor: 'BankB',
    debtor: 'BankA',
    description: 'Interest rate swap payment',
    amount: '100000.00',
    currency: 'USD',
    createdDate: '2026-09-30',
    dueDate: '2026-10-15',
    priority: 'Normal',
    sourceSystem: 'TradingDesk',
    sourceReference: 'TRD-9988',
    businessUnit: 'FixedIncome'
  };

  test('validates valid obligation proposal', () => {
    expect(() => ObligationDomainRules.validateCreateProposal(validDto)).not.toThrow();
  });

  test('rejects obligation when creditor and debtor are identical', () => {
    expect(() =>
      ObligationDomainRules.validateCreateProposal({
        ...validDto,
        debtor: 'BankB'
      })
    ).toThrow(/Creditor and debtor cannot be the same entity/);
  });

  test('rejects non-positive amount', () => {
    expect(() =>
      ObligationDomainRules.validateCreateProposal({
        ...validDto,
        amount: '0.00'
      })
    ).toThrow(/strictly greater than zero/);

    expect(() =>
      ObligationDomainRules.validateCreateProposal({
        ...validDto,
        amount: '-500.00'
      })
    ).toThrow(/strictly greater than zero/);
  });

  test('rejects dueDate before createdDate', () => {
    expect(() =>
      ObligationDomainRules.validateCreateProposal({
        ...validDto,
        createdDate: '2026-10-15',
        dueDate: '2026-10-10'
      })
    ).toThrow(/Due date must be equal to or after created date/);
  });

  test('state machine allows valid progression', () => {
    expect(ObligationStateMachine.canTransition('Proposed', 'Accepted')).toBe(true);
    expect(ObligationStateMachine.canTransition('Accepted', 'Confirmed')).toBe(true);
    expect(ObligationStateMachine.canTransition('Confirmed', 'SettlementPending')).toBe(true);
    expect(ObligationStateMachine.canTransition('SettlementPending', 'Settled')).toBe(true);
    expect(ObligationStateMachine.canTransition('Confirmed', 'NettingPending')).toBe(true);
    expect(ObligationStateMachine.canTransition('NettingPending', 'Netted')).toBe(true);
  });

  test('state machine rejects illegal skips or reversals', () => {
    expect(ObligationStateMachine.canTransition('Proposed', 'Confirmed')).toBe(false);
    expect(ObligationStateMachine.canTransition('Proposed', 'Settled')).toBe(false);
    expect(ObligationStateMachine.canTransition('Settled', 'Confirmed')).toBe(false);
    expect(ObligationStateMachine.canTransition('Netted', 'Proposed')).toBe(false);
  });

  test('enforces actor authorization for accept and confirm', () => {
    const obl: ObligationEntity = {
      obligationId: 'OBL-001',
      creditor: 'BankB',
      debtor: 'BankA',
      description: 'Desc',
      amount: new Decimal('1000'),
      currency: 'USD',
      status: 'Proposed',
      createdDate: new Date(),
      dueDate: new Date(),
      priority: 'Normal',
      version: 1,
      metadata: {
        sourceSystem: 'S',
        sourceReference: 'R',
        businessUnit: 'B',
        createdBy: 'BankB',
        createdAt: new Date(),
        version: 1
      }
    };

    expect(() => ObligationDomainRules.validateAccept(obl, 'BankA')).not.toThrow();
    expect(() => ObligationDomainRules.validateAccept(obl, 'BankB')).toThrow(/Only debtor/);

    obl.status = 'Accepted';
    expect(() => ObligationDomainRules.validateConfirm(obl, 'BankB')).not.toThrow();
    expect(() => ObligationDomainRules.validateConfirm(obl, 'BankA')).toThrow(/Only creditor/);
  });
});
