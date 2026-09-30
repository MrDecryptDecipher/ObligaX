import { NettingCalculator } from '@/domain/netting/netting-calculator';
import { ObligationEntity } from '@/domain/obligation/obligation.types';
import Decimal from 'decimal.js';

describe('NettingCalculator', () => {
  const createMockObligation = (
    id: string,
    creditor: string,
    debtor: string,
    amount: string,
    currency: any = 'USD',
    status: any = 'Confirmed'
  ): ObligationEntity => ({
    obligationId: id,
    contractId: `#cid-${id}`,
    creditor,
    debtor,
    description: `Leg for ${id}`,
    amount: new Decimal(amount),
    currency,
    status,
    createdDate: new Date('2026-09-30'),
    dueDate: new Date('2026-10-30'),
    priority: 'Normal',
    version: 3,
    metadata: {
      sourceSystem: 'TradingCore',
      sourceReference: `REF-${id}`,
      businessUnit: 'Treasury',
      createdBy: creditor,
      createdAt: new Date(),
      version: 3
    }
  });

  test('calculates correct bilateral netting where initiator pays net deficit', () => {
    // Bank A is initiator
    // Leg 1: Bank A owes Bank B 100,000 USD (Bank A is debtor, Bank B is creditor -> Payable for A)
    // Leg 2: Bank B owes Bank A 70,000 USD (Bank A is creditor, Bank B is debtor -> Receivable for A)
    const leg1 = createMockObligation('OBL-1', 'BankB', 'BankA', '100000.00');
    const leg2 = createMockObligation('OBL-2', 'BankA', 'BankB', '70000.00');

    const result = NettingCalculator.calculateBilateralNetting('BankA', 'BankB', 'USD', [leg1, leg2]);

    expect(result.terms.grossReceivable.toString()).toBe('70000');
    expect(result.terms.grossPayable.toString()).toBe('100000');
    expect(result.terms.netAmount.toString()).toBe('30000');
    expect(result.terms.direction).toBe('InitiatorPays'); // Bank A pays Bank B $30,000
    expect(result.lines).toHaveLength(2);
  });

  test('calculates correct bilateral netting where counterparty pays net surplus', () => {
    // Bank A is initiator
    // Leg 1: Bank B owes Bank A 120,000 USD (Receivable for A)
    // Leg 2: Bank A owes Bank B 50,000 USD (Payable for A)
    const leg1 = createMockObligation('OBL-1', 'BankA', 'BankB', '120000.00');
    const leg2 = createMockObligation('OBL-2', 'BankB', 'BankA', '50000.00');

    const result = NettingCalculator.calculateBilateralNetting('BankA', 'BankB', 'USD', [leg1, leg2]);

    expect(result.terms.grossReceivable.toString()).toBe('120000');
    expect(result.terms.grossPayable.toString()).toBe('50000');
    expect(result.terms.netAmount.toString()).toBe('70000');
    expect(result.terms.direction).toBe('CounterpartyPays'); // Bank B pays Bank A $70,000
  });

  test('rejects obligation with different currency', () => {
    const leg1 = createMockObligation('OBL-1', 'BankB', 'BankA', '100000.00', 'USD');
    const leg2 = createMockObligation('OBL-2', 'BankA', 'BankB', '70000.00', 'EUR');

    expect(() =>
      NettingCalculator.calculateBilateralNetting('BankA', 'BankB', 'USD', [leg1, leg2])
    ).toThrow(/expected netting currency 'USD'/);
  });

  test('rejects obligation not in Confirmed state', () => {
    const leg1 = createMockObligation('OBL-1', 'BankB', 'BankA', '100000.00', 'USD', 'Confirmed');
    const leg2 = createMockObligation('OBL-2', 'BankA', 'BankB', '70000.00', 'USD', 'Proposed');

    expect(() =>
      NettingCalculator.calculateBilateralNetting('BankA', 'BankB', 'USD', [leg1, leg2])
    ).toThrow(/Must be 'Confirmed'/);
  });

  test('rejects netting when gross balances perfectly cancel out to zero', () => {
    const leg1 = createMockObligation('OBL-1', 'BankB', 'BankA', '100000.00');
    const leg2 = createMockObligation('OBL-2', 'BankA', 'BankB', '100000.00');

    expect(() =>
      NettingCalculator.calculateBilateralNetting('BankA', 'BankB', 'USD', [leg1, leg2])
    ).toThrow(/resulted in a zero balance/);
  });
});
