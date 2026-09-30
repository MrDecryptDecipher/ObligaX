import fc from 'fast-check';
import { AuditRepository, CanonicalJson } from '../../backend/src/infrastructure/database/repositories/audit.repository';

describe('AuditRepository Cryptographic Chain Property-Based Tests (fast-check)', () => {
  test('Property 1: CanonicalJson serializes object properties deterministically regardless of key insertion order', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.stringMatching(/^[a-zA-Z0-9_]{1,10}$/), fc.string({ maxLength: 20 })),
        dict => {
          const keys = Object.keys(dict);
          if (keys.length < 2) return true;

          // Shuffle keys to build permuted object
          const shuffledKeys = [...keys].reverse();
          const permutedDict: Record<string, string> = Object.create(null);
          for (const k of shuffledKeys) {
            permutedDict[k] = dict[k];
          }

          const canon1 = CanonicalJson.canonicalize(dict);
          const canon2 = CanonicalJson.canonicalize(permutedDict);

          expect(canon1).toBe(canon2);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 2: Sequential chain integrity — verifyChainIntegrity() returns isValid: true for all valid generated chains', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            action: fc.constantFrom('OBLIGATION_PROPOSED', 'OBLIGATION_ACCEPTED', 'NETTING_PROPOSED', 'SETTLEMENT_INITIATED'),
            actor: fc.constantFrom('BankA', 'BankB', 'NetworkOperator'),
            resourceType: fc.constantFrom('Obligation', 'NettingProposal', 'SettlementInstruction'),
            resourceId: fc.uuid()
          }),
          { minLength: 3, maxLength: 15 }
        ),
        async events => {
          const repo = new AuditRepository();

          for (const ev of events) {
            await repo.record({
              traceId: 'trace-prop-chain',
              actor: ev.actor,
              action: ev.action,
              resourceType: ev.resourceType,
              resourceId: ev.resourceId,
              payloadAfter: { ts: Date.now() }
            });
          }

          const integrity = repo.verifyChainIntegrity();
          expect(integrity.isValid).toBe(true);
          expect(integrity.brokenAtSequence).toBeUndefined();
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 3: Tamper-evidence — mutating any historical record breaks chain verification immediately', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            action: fc.constantFrom('OBLIGATION_PROPOSED', 'OBLIGATION_ACCEPTED', 'NETTING_PROPOSED'),
            actor: fc.constantFrom('BankA', 'BankB'),
            resourceType: fc.constant('Obligation'),
            resourceId: fc.uuid()
          }),
          { minLength: 4, maxLength: 10 }
        ),
        fc.integer({ min: 0, max: 3 }),
        async (events, tamperIndexOffset) => {
          const repo = new AuditRepository();

          for (const ev of events) {
            await repo.record({
              traceId: 'trace-tamper-check',
              actor: ev.actor,
              action: ev.action,
              resourceType: ev.resourceType,
              resourceId: ev.resourceId,
              payloadAfter: { payloadKey: 'original' }
            });
          }

          // Pick an element to tamper with (within valid bounds)
          const targetIndex = tamperIndexOffset % events.length;
          const records = repo.getChain();

          // Mutate the actor of the record without updating hash
          records[targetIndex].actor = 'AdversaryMallory';

          const integrity = repo.verifyChainIntegrity();
          expect(integrity.isValid).toBe(false);
          expect(integrity.brokenAtSequence).toBeDefined();
        }
      ),
      { numRuns: 20 }
    );
  });
});
