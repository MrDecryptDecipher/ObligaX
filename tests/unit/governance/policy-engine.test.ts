import Decimal from 'decimal.js';
import { PolicyEngine } from '../../../backend/src/domain/governance/policy-engine';
import { DailyExposureTracker } from '../../../backend/src/domain/governance/daily-exposure.service';

describe('PolicyEngine Policy-as-Code Tests (Item 49 & 50)', () => {
  let policyEngine: PolicyEngine;

  beforeEach(() => {
    policyEngine = new PolicyEngine();
    DailyExposureTracker.reset();
  });

  test('Approves compliant transaction between Tier 1 participants within currency corridor and limits', () => {
    const decision = policyEngine.evaluate({
      partyId: 'BankA',
      counterpartyId: 'BankB',
      operation: 'CREATE_OBLIGATION',
      amount: new Decimal('1000000.00'), // $1M (under $100M limit)
      currency: 'USD'
    });

    expect(decision.allowed).toBe(true);
    expect(decision.decision).toBe('APPROVED');
    expect(decision.violations).toHaveLength(0);
  });

  test('Rejects transaction exceeding maximum single transaction limit', () => {
    const decision = policyEngine.evaluate({
      partyId: 'BankC', // Regional bank with $25M single transaction limit
      counterpartyId: 'BankA',
      operation: 'CREATE_OBLIGATION',
      amount: new Decimal('30000000.00'), // $30M exceeds $25M cap
      currency: 'USD'
    });

    expect(decision.allowed).toBe(false);
    expect(decision.decision).toBe('REJECTED');
    expect(decision.violations.some(v => v.includes('POL-004'))).toBe(true);
  });

  test('Rejects transaction with unauthorized currency corridor for participant', () => {
    const decision = policyEngine.evaluate({
      partyId: 'BankC', // Bank C only allowed USD, EUR, GBP
      counterpartyId: 'BankA',
      operation: 'CREATE_OBLIGATION',
      amount: new Decimal('500000.00'),
      currency: 'CHF' // Not in Bank C's permitted corridor
    });

    expect(decision.allowed).toBe(false);
    expect(decision.decision).toBe('REJECTED');
    expect(decision.violations.some(v => v.includes('POL-003'))).toBe(true);
  });

  test('Rejects transaction when counterparty is suspended under sanctions policy', () => {
    policyEngine.registerProfile({
      partyId: 'SanctionedBank',
      organizationId: 'ORG_SANCTIONED',
      tier: 'TIER_3_NON_BANK_CLEARING',
      jurisdiction: 'US',
      allowedCurrencies: ['USD'],
      maxSingleTransactionLimit: new Decimal('1000000.00'),
      maxDailyGrossVolumeLimit: new Decimal('10000000.00'),
      allowedSettlementRails: ['RTGS'],
      sanctionStatus: 'SUSPENDED'
    });

    const decision = policyEngine.evaluate({
      partyId: 'BankA',
      counterpartyId: 'SanctionedBank',
      operation: 'CREATE_OBLIGATION',
      amount: new Decimal('100000.00'),
      currency: 'USD'
    });

    expect(decision.allowed).toBe(false);
    expect(decision.decision).toBe('REJECTED');
    expect(decision.violations.some(v => v.includes('POL-002'))).toBe(true);
  });

  test('Enforces cumulative daily gross exposure limits across multiple transactions (Item 50)', () => {
    const dailyCap = new Decimal('250000000.00'); // $250M

    // Record volume up to the daily cap
    DailyExposureTracker.recordExposure('BankC', new Decimal('240000000.00'));

    // Next transaction of $20M exceeds remaining $10M buffer
    const decision = policyEngine.evaluate({
      partyId: 'BankC',
      counterpartyId: 'BankA',
      operation: 'CREATE_OBLIGATION',
      amount: new Decimal('20000000.00'),
      currency: 'USD'
    });

    expect(decision.allowed).toBe(false);
    expect(decision.decision).toBe('REJECTED');
    expect(decision.violations.some(v => v.includes('POL-005'))).toBe(true);
  });
});
