import request from 'supertest';
import { buildAppContainer } from '@/index';
import { Express } from 'express';

describe('Bilateral Netting API E2E', () => {
  let app: Express;

  beforeEach(() => {
    const container = buildAppContainer();
    app = container.app;
  });

  const setupConfirmedObligations = async () => {
    // Leg 1: Bank A owes Bank B 100,000 USD
    await request(app)
      .post('/api/v1/obligations')
      .set('x-party-id', 'NetworkOperator')
      .send({
        obligationId: 'NET-LEG-1',
        creditor: 'BankB',
        debtor: 'BankA',
        description: 'Bilateral Leg 1',
        amount: '100000.00',
        currency: 'USD',
        createdDate: '2026-09-30',
        dueDate: '2026-10-31',
        priority: 'Normal',
        sourceSystem: 'Core',
        sourceReference: 'LEG-1',
        businessUnit: 'Treasury'
      });
    await request(app).post('/api/v1/obligations/NET-LEG-1/accept').set('x-party-id', 'BankA').send({});
    await request(app).post('/api/v1/obligations/NET-LEG-1/confirm').set('x-party-id', 'BankB').send({});

    // Leg 2: Bank B owes Bank A 70,000 USD
    await request(app)
      .post('/api/v1/obligations')
      .set('x-party-id', 'NetworkOperator')
      .send({
        obligationId: 'NET-LEG-2',
        creditor: 'BankA',
        debtor: 'BankB',
        description: 'Bilateral Leg 2',
        amount: '70000.00',
        currency: 'USD',
        createdDate: '2026-09-30',
        dueDate: '2026-10-31',
        priority: 'Normal',
        sourceSystem: 'Core',
        sourceReference: 'LEG-2',
        businessUnit: 'Treasury'
      });
    await request(app).post('/api/v1/obligations/NET-LEG-2/accept').set('x-party-id', 'BankB').send({});
    await request(app).post('/api/v1/obligations/NET-LEG-2/confirm').set('x-party-id', 'BankA').send({});
  };

  test('executes complete bilateral netting workflow atomically', async () => {
    await setupConfirmedObligations();

    // 1. Propose Netting (Bank A is initiator)
    const proposeRes = await request(app)
      .post('/api/v1/netting/proposals')
      .set('x-party-id', 'BankA')
      .send({
        nettingId: 'NET-RUN-001',
        counterparty: 'BankB',
        obligationIds: ['NET-LEG-1', 'NET-LEG-2'],
        currency: 'USD',
        sourceSystem: 'NettingEngine',
        sourceReference: 'CYCLE-20260930',
        businessUnit: 'SettlementOps'
      });

    expect(proposeRes.status).toBe(201);
    expect(proposeRes.body.data.nettingId).toBe('NET-RUN-001');
    expect(proposeRes.body.data.status).toBe('NettingProposed');
    expect(proposeRes.body.data.terms.grossReceivable).toBe('70000');
    expect(proposeRes.body.data.terms.grossPayable).toBe('100000');
    expect(proposeRes.body.data.terms.netAmount).toBe('30000');
    expect(proposeRes.body.data.terms.direction).toBe('InitiatorPays');

    // 2. Counterparty (Bank B) Accepts
    const acceptRes = await request(app)
      .post('/api/v1/netting/proposals/NET-RUN-001/accept')
      .set('x-party-id', 'BankB')
      .send({});

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.data.status).toBe('NettingAccepted');

    // 3. Initiator (Bank A) Executes Netting
    const execRes = await request(app)
      .post('/api/v1/netting/proposals/NET-RUN-001/execute')
      .set('x-party-id', 'BankA')
      .send({});

    expect(execRes.status).toBe(200);
    expect(execRes.body.data.nettingId).toBe('NET-RUN-001');
    expect(execRes.body.data.terms.netAmount).toBe('30000');
    expect(execRes.body.data.terms.direction).toBe('InitiatorPays');

    // 4. Verify participating obligations transitioned to Netted state
    const obl1Res = await request(app).get('/api/v1/obligations/NET-LEG-1').set('x-party-id', 'BankA');
    expect(obl1Res.body.data.status).toBe('Netted');

    const obl2Res = await request(app).get('/api/v1/obligations/NET-LEG-2').set('x-party-id', 'BankA');
    expect(obl2Res.body.data.status).toBe('Netted');
  });

  test('enforces atomic rollback: invalid obligation prevents any obligation from being netted', async () => {
    // Leg 1: Confirmed
    await request(app)
      .post('/api/v1/obligations')
      .set('x-party-id', 'NetworkOperator')
      .send({
        obligationId: 'ATOM-LEG-1',
        creditor: 'BankB',
        debtor: 'BankA',
        description: 'Valid Leg 1',
        amount: '50000.00',
        currency: 'USD',
        createdDate: '2026-09-30',
        dueDate: '2026-10-31',
        priority: 'Normal',
        sourceSystem: 'Core',
        sourceReference: 'ATOM-1',
        businessUnit: 'Treasury'
      });
    await request(app).post('/api/v1/obligations/ATOM-LEG-1/accept').set('x-party-id', 'BankA').send({});
    await request(app).post('/api/v1/obligations/ATOM-LEG-1/confirm').set('x-party-id', 'BankB').send({});

    // Leg 2: Still Proposed (INVALID FOR NETTING)
    await request(app)
      .post('/api/v1/obligations')
      .set('x-party-id', 'NetworkOperator')
      .send({
        obligationId: 'ATOM-LEG-2',
        creditor: 'BankA',
        debtor: 'BankB',
        description: 'Unconfirmed Leg 2',
        amount: '20000.00',
        currency: 'USD',
        createdDate: '2026-09-30',
        dueDate: '2026-10-31',
        priority: 'Normal',
        sourceSystem: 'Core',
        sourceReference: 'ATOM-2',
        businessUnit: 'Treasury'
      });

    // Propose netting with unconfirmed obligation -> must fail immediately
    const failRes = await request(app)
      .post('/api/v1/netting/proposals')
      .set('x-party-id', 'BankA')
      .send({
        nettingId: 'NET-ATOM-FAIL',
        counterparty: 'BankB',
        obligationIds: ['ATOM-LEG-1', 'ATOM-LEG-2'],
        currency: 'USD',
        sourceSystem: 'NettingEngine',
        sourceReference: 'ERR-RUN',
        businessUnit: 'SettlementOps'
      });

    expect(failRes.status).toBe(422);

    // Verify Leg 1 is still Confirmed (NO PARTIAL NETTING)
    const leg1Check = await request(app).get('/api/v1/obligations/ATOM-LEG-1').set('x-party-id', 'BankA');
    expect(leg1Check.body.data.status).toBe('Confirmed');

    // Verify Leg 2 is still Proposed
    const leg2Check = await request(app).get('/api/v1/obligations/ATOM-LEG-2').set('x-party-id', 'BankA');
    expect(leg2Check.body.data.status).toBe('Proposed');
  });
});
