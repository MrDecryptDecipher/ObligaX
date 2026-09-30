import { CantonClient } from '../../backend/src/infrastructure/canton/canton-client';

describe('Canton Multi-Participant Topology & Privacy Tests', () => {
  const cantonClient = new CantonClient({
    host: 'localhost',
    port: 5011,
    adminPort: 5011,
    useTls: false,
    operatorParty: 'NetworkOperator',
    timeoutMs: 5000
  });

  let partyA: string;
  let partyB: string;
  let partyC: string;

  beforeAll(async () => {
    // 1. Resolve multi-participant institutional parties with cryptographic namespaces
    partyA = cantonClient.partyService.getPartyMapping('user_banka@banka.com').partyId;
    partyB = cantonClient.partyService.getPartyMapping('user_bankb@bankb.com').partyId;
    partyC = cantonClient.partyService.getPartyMapping('user_bankc@bankc.com').partyId;

    expect(partyA).toContain('BankA::');
    expect(partyB).toContain('BankB::');
    expect(partyC).toContain('BankC::');
  });

  test('Privacy Test 1: Stakeholders Bank A and Bank B can observe their bilateral contract, but Bank C cannot', async () => {
    const obligationId = 'PRIVACY-OBL-001';

    // 1. Bank A submits creation of obligation with Bank B as creditor
    const submitResult = await cantonClient.submit({
      commandId: `OBLIGAX/PRIVACY_TEST/${obligationId}/ATTEMPT-01`,
      actAs: [partyA],
      commands: [
        {
          type: 'create',
          templateId: 'Obligation.Contract:Obligation',
          argument: {
            obligationId,
            creditor: partyB,
            debtor: partyA,
            amount: '500000.00',
            currency: 'USD',
            status: 'Proposed'
          }
        }
      ]
    });

    const contractId = submitResult.createdContractIds[0];
    expect(contractId).toBeDefined();

    // 2. Bank A queries ACS (Stakeholder: Signatory) -> Contract MUST be visible
    const bankAView = await cantonClient.queryActiveContracts(
      'Obligation.Contract:Obligation',
      partyA
    );
    const bankAFound = bankAView.some(c => c.contractId === contractId);
    expect(bankAFound).toBe(true);

    // 3. Bank B queries ACS (Stakeholder: Observer/Creditor) -> Contract MUST be visible
    const bankBView = await cantonClient.queryActiveContracts(
      'Obligation.Contract:Obligation',
      partyB
    );
    const bankBFound = bankBView.some(c => c.contractId === contractId);
    expect(bankBFound).toBe(true);

    // 4. Bank C (Participant 3, Non-Stakeholder) queries ACS -> Contract MUST NOT be visible!
    const bankCView = await cantonClient.queryActiveContracts(
      'Obligation.Contract:Obligation',
      partyC
    );
    const bankCFound = bankCView.some(c => c.contractId === contractId);
    expect(bankCFound).toBe(false);

    // 5. Bank C attempts direct contract lookup by ID -> Canton MUST reject with PERMISSION_DENIED / 403
    await expect(
      cantonClient.fetchContract(contractId, partyC)
    ).rejects.toThrow();
  });

  test('Privacy Test 2: Bank C cannot exercise choices on Bank A and Bank B bilateral contract', async () => {
    const obligationId = 'PRIVACY-OBL-002';

    // Bank A creates bilateral obligation
    const submitResult = await cantonClient.submit({
      commandId: `OBLIGAX/PRIVACY_EXER/${obligationId}/ATTEMPT-01`,
      actAs: [partyA],
      commands: [
        {
          type: 'create',
          templateId: 'Obligation.Contract:Obligation',
          argument: {
            obligationId,
            creditor: partyB,
            debtor: partyA,
            amount: '250000.00',
            currency: 'EUR',
            status: 'Proposed'
          }
        }
      ]
    });
    const contractId = submitResult.createdContractIds[0];

    // Bank C maliciously attempts to Accept the obligation acting as Bank C
    await expect(
      cantonClient.submit({
        commandId: `ATTACK/TAMPER/${obligationId}/ATTEMPT-01`,
        actAs: [partyC],
        commands: [
          {
            type: 'exercise',
            templateId: 'Obligation.Contract:Obligation',
            contractId,
            choice: 'AcceptObligation',
            argument: {}
          }
        ]
      })
    ).rejects.toThrow();
  });
});
