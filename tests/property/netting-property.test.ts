import fc from 'fast-check';
import Decimal from 'decimal.js';
import { NettingCalculator } from '../../backend/src/domain/netting/netting-calculator';
import { ObligationEntity } from '../../backend/src/domain/obligation/obligation.types';
import { SafeDecimal } from '../../backend/src/utils/decimal';

describe('NettingCalculator Property-Based Tests (fast-check)', () => {
  // Arbitrary for positive amounts formatted as institutional decimal strings
  const positiveAmountArb = fc
    .integer({ min: 1, max: 10_000_000 })
    .map(cents => (cents / 100).toFixed(2));

  // Arbitrary for distinct bilateral parties
  const partyPairArb = fc
    .tuple(
      fc.constantFrom('BankA', 'BankB', 'BankC'),
      fc.constantFrom('BankA', 'BankB', 'BankC')
    )
    .filter(([p1, p2]) => (p1 as string) !== (p2 as string));

  test('Property 1: Canonical input order invariance — shuffle of input obligations produces identical netting hash', () => {
    fc.assert(
      fc.property(
        partyPairArb,
        fc.array(
          fc.record({
            idSuffix: fc.integer({ min: 1, max: 9999 }),
            amount: positiveAmountArb,
            isAtoB: fc.boolean()
          }),
          { minLength: 2, maxLength: 8 }
        ),
        ([partyA, partyB], legSpecs) => {
          // Generate unique obligations
          const obligations: ObligationEntity[] = legSpecs.map((leg, idx) => ({
            contractId: `#c-prop-${idx}`,
            obligationId: `OBL-PROP-${String(idx).padStart(4, '0')}-${leg.idSuffix}`,
            creditor: leg.isAtoB ? partyB : partyA,
            debtor: leg.isAtoB ? partyA : partyB,
            description: `Leg ${idx}`,
            amount: new Decimal(leg.amount),
            currency: 'USD',
            status: 'Confirmed',
            createdDate: new Date('2026-09-30'),
            dueDate: new Date('2026-10-31'),
            priority: 'Normal',
            version: 1,
            metadata: {
              sourceSystem: 'TradingDesk',
              sourceReference: `REF-${idx}`,
              businessUnit: 'Treasury',
              createdBy: partyA,
              createdAt: new Date(),
              version: 1
            }
          }));

          // Avoid cases where obligations perfectly cancel out to zero
          try {
            const resOriginal = NettingCalculator.calculateBilateralNetting(partyA, partyB, 'USD', obligations);
            
            // Reverse obligations list and calculate again
            const reversedObligations = [...obligations].reverse();
            const resReversed = NettingCalculator.calculateBilateralNetting(partyA, partyB, 'USD', reversedObligations);

            // Invariant: Netting Hash, Net Amount, and Net Direction must be strictly identical
            expect(resOriginal.nettingHash).toBe(resReversed.nettingHash);
            expect(resOriginal.terms.netAmount.toString()).toBe(resReversed.terms.netAmount.toString());
            expect(resOriginal.terms.direction).toBe(resReversed.terms.direction);
          } catch (err: any) {
            // Net balance zero is a valid domain rejection
            if (!err.message.includes('NET-CALC-007')) {
              throw err;
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Property 2: Conservation of value — |grossReceivable - grossPayable| strictly equals netAmount', () => {
    fc.assert(
      fc.property(
        partyPairArb,
        fc.array(
          fc.record({
            idSuffix: fc.integer({ min: 1, max: 9999 }),
            amount: positiveAmountArb,
            isAtoB: fc.boolean()
          }),
          { minLength: 1, maxLength: 10 }
        ),
        ([partyA, partyB], legSpecs) => {
          const obligations: ObligationEntity[] = legSpecs.map((leg, idx) => ({
            contractId: `#c-prop-${idx}`,
            obligationId: `OBL-CONS-${String(idx).padStart(4, '0')}-${leg.idSuffix}`,
            creditor: leg.isAtoB ? partyB : partyA,
            debtor: leg.isAtoB ? partyA : partyB,
            description: `Leg ${idx}`,
            amount: new Decimal(leg.amount),
            currency: 'USD',
            status: 'Confirmed',
            createdDate: new Date('2026-09-30'),
            dueDate: new Date('2026-10-31'),
            priority: 'Normal',
            version: 1,
            metadata: {
              sourceSystem: 'TradingDesk',
              sourceReference: `REF-${idx}`,
              businessUnit: 'Treasury',
              createdBy: partyA,
              createdAt: new Date(),
              version: 1
            }
          }));

          try {
            const res = NettingCalculator.calculateBilateralNetting(partyA, partyB, 'USD', obligations);
            const expectedNet = SafeDecimal.abs(
              SafeDecimal.subtract(res.terms.grossReceivable, res.terms.grossPayable)
            );

            expect(SafeDecimal.eq(res.terms.netAmount, expectedNet)).toBe(true);
            expect(SafeDecimal.gt(res.terms.netAmount, 0)).toBe(true);
          } catch (err: any) {
            if (!err.message.includes('NET-CALC-007')) {
              throw err;
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Property 3: Rejection of zero-balance perfect cancellation', () => {
    fc.assert(
      fc.property(
        partyPairArb,
        positiveAmountArb,
        ([partyA, partyB], amountStr) => {
          // Exactly matching bilateral obligations
          const obligations: ObligationEntity[] = [
            {
              contractId: '#c-zero-1',
              obligationId: 'OBL-ZERO-1',
              creditor: partyB,
              debtor: partyA,
              description: 'Leg A to B',
              amount: new Decimal(amountStr),
              currency: 'EUR',
              status: 'Confirmed',
              createdDate: new Date('2026-09-30'),
              dueDate: new Date('2026-10-31'),
              priority: 'Normal',
              version: 1,
              metadata: {
                sourceSystem: 'TradingDesk',
                sourceReference: 'ZERO-1',
                businessUnit: 'Treasury',
                createdBy: partyA,
                createdAt: new Date(),
                version: 1
              }
            },
            {
              contractId: '#c-zero-2',
              obligationId: 'OBL-ZERO-2',
              creditor: partyA,
              debtor: partyB,
              description: 'Leg B to A',
              amount: new Decimal(amountStr),
              currency: 'EUR',
              status: 'Confirmed',
              createdDate: new Date('2026-09-30'),
              dueDate: new Date('2026-10-31'),
              priority: 'Normal',
              version: 1,
              metadata: {
                sourceSystem: 'TradingDesk',
                sourceReference: 'ZERO-2',
                businessUnit: 'Treasury',
                createdBy: partyB,
                createdAt: new Date(),
                version: 1
              }
            }
          ];

          expect(() => {
            NettingCalculator.calculateBilateralNetting(partyA, partyB, 'EUR', obligations);
          }).toThrow('NET-CALC-007');
        }
      ),
      { numRuns: 25 }
    );
  });
});
