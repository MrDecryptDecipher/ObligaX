import request from 'supertest';
import { buildAppContainer } from '@/index';
import { Express } from 'express';

describe('Multi-Participant Atomicity Integration Tests (Item 35)', () => {
  let app: Express;

  beforeEach(() => {
    const container = buildAppContainer();
    app = container.app;
  });

  test('Multi-Participant Chain: A owes B $100k, B owes C $100k, C owes A $100k', async () => {
    // 1. Setup Circular Obligations between 3 distinct participants
    // Leg 1: Bank A owes Bank B 100k
    await request(app)
      .post('/api/v1/obligations')
      .set('x-party-id', 'BankA')
      .send({
        obligationId: 'CIRC-LEG-1',
        creditor: 'BankB',
        debtor: 'BankA',
        description: 'Circular Leg 1 (A to B)',
        amount: '100000.00',
        currency: 'USD',
        createdDate: '2026-09-30',
        dueDate: '2026-10-31',
        priority: 'Normal',
        sourceSystem: 'TradingDesk',
        sourceReference: 'CIRC-1',
        businessUnit: 'Treasury'
      });
    await request(app).post('/api/v1/obligations/CIRC-LEG-1/accept').set('x-party-id', 'BankA').send({});
    await request(app).post('/api/v1/obligations/CIRC-LEG-1/confirm').set('x-party-id', 'BankB').send({});

    // Leg 2: Bank B owes Bank C 100k
    await request(app)
      .post('/api/v1/obligations')
      .set('x-party-id', 'BankB')
      .send({
        obligationId: 'CIRC-LEG-2',
        creditor: 'BankC',
        debtor: 'BankB',
        description: 'Circular Leg 2 (B to C)',
        amount: '100000.00',
        currency: 'USD',
        createdDate: '2026-09-30',
        dueDate: '2026-10-31',
        priority: 'Normal',
        sourceSystem: 'TradingDesk',
        sourceReference: 'CIRC-2',
        businessUnit: 'Treasury'
      });
    await request(app).post('/api/v1/obligations/CIRC-LEG-2/accept').set('x-party-id', 'BankB').send({});
    await request(app).post('/api/v1/obligations/CIRC-LEG-2/confirm').set('x-party-id', 'BankC').send({});

    // Leg 3: Bank C owes Bank A 100k
    await request(app)
      .post('/api/v1/obligations')
      .set('x-party-id', 'BankC')
      .send({
        obligationId: 'CIRC-LEG-3',
        creditor: 'BankA',
        debtor: 'BankC',
        description: 'Circular Leg 3 (C to A)',
        amount: '100000.00',
        currency: 'USD',
        createdDate: '2026-09-30',
        dueDate: '2026-10-31',
        priority: 'Normal',
        sourceSystem: 'TradingDesk',
        sourceReference: 'CIRC-3',
        businessUnit: 'Treasury'
      });
    await request(app).post('/api/v1/obligations/CIRC-LEG-3/accept').set('x-party-id', 'BankC').send({});
    await request(app).post('/api/v1/obligations/CIRC-LEG-3/confirm').set('x-party-id', 'BankA').send({});

    // Verify all 3 legs reached Confirmed state independently
    const check1 = await request(app).get('/api/v1/obligations/CIRC-LEG-1').set('x-party-id', 'BankA');
    const check2 = await request(app).get('/api/v1/obligations/CIRC-LEG-2').set('x-party-id', 'BankB');
    const check3 = await request(app).get('/api/v1/obligations/CIRC-LEG-3').set('x-party-id', 'BankC');

    expect(check1.body.data.status).toBe('Confirmed');
    expect(check2.body.data.status).toBe('Confirmed');
    expect(check3.body.data.status).toBe('Confirmed');

    // 2. Multilateral Netting Boundary Check:
    // Bilateral netting between Bank A and Bank B MUST strictly exclude CIRC-LEG-2 (Bank B -> Bank C)
    const bilateralRes = await request(app)
      .post('/api/v1/netting/proposals')
      .set('x-party-id', 'BankA')
      .send({
        nettingId: 'NET-CIRC-ILLEGAL',
        counterparty: 'BankB',
        obligationIds: ['CIRC-LEG-1', 'CIRC-LEG-2'], // Leg 2 involves Bank C!
        currency: 'USD',
        sourceSystem: 'NettingDesk',
        sourceReference: 'ILLEGAL-CIRC-RUN',
        businessUnit: 'Clearing'
      });

    // Rejection: Bilateral netting cannot bundle an uninvolved third party's obligation
    expect([422, 500]).toContain(bilateralRes.status);

    // Atomicity assertion: Neither Leg 1 nor Leg 2 was consumed or moved to NettingPending
    const verifyLeg1 = await request(app).get('/api/v1/obligations/CIRC-LEG-1').set('x-party-id', 'BankA');
    const verifyLeg2 = await request(app).get('/api/v1/obligations/CIRC-LEG-2').set('x-party-id', 'BankB');
    expect(verifyLeg1.body.data.status).toBe('Confirmed');
    expect(verifyLeg2.body.data.status).toBe('Confirmed');
  });
});
