import request from 'supertest';
import { buildAppContainer } from '@/index';
import { Express } from 'express';

describe('Obligation API E2E', () => {
  let app: Express;

  beforeEach(() => {
    const container = buildAppContainer();
    app = container.app;
  });

  const validPayload = {
    obligationId: 'OBL-E2E-001',
    creditor: 'BankB',
    debtor: 'BankA',
    description: 'Commercial invoice #991',
    amount: '150000.00',
    currency: 'USD',
    createdDate: '2026-09-30',
    dueDate: '2026-10-31',
    priority: 'Normal',
    sourceSystem: 'BillingERP',
    sourceReference: 'INV-991',
    businessUnit: 'CorporateTreasury'
  };

  test('POST /api/v1/obligations creates new Proposed obligation', async () => {
    const res = await request(app)
      .post('/api/v1/obligations')
      .set('x-party-id', 'NetworkOperator')
      .send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.obligationId).toBe('OBL-E2E-001');
    expect(res.body.data.status).toBe('Proposed');
    expect(res.body.data.version).toBe(1);
    expect(res.body.data.contractId).toBeDefined();
    expect(res.headers['x-correlation-id']).toBeDefined();
  });

  test('POST /api/v1/obligations rejects duplicate obligationId with 409 Conflict', async () => {
    await request(app)
      .post('/api/v1/obligations')
      .set('x-party-id', 'NetworkOperator')
      .send(validPayload);

    const dupRes = await request(app)
      .post('/api/v1/obligations')
      .set('x-party-id', 'NetworkOperator')
      .send(validPayload);

    expect(dupRes.status).toBe(409);
    expect(dupRes.body.success).toBe(false);
    expect(dupRes.body.error.code).toBe('ERR_RESOURCE_CONFLICT');
  });

  test('POST /api/v1/obligations rejects invalid schema with 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/v1/obligations')
      .set('x-party-id', 'NetworkOperator')
      .send({
        ...validPayload,
        debtor: 'BankB' // Identical creditor and debtor
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('ERR_VALIDATION_FAILED');
  });

  test('executes complete obligation lifecycle: Proposed -> Accepted -> Confirmed', async () => {
    // 1. Create Proposed
    await request(app)
      .post('/api/v1/obligations')
      .set('x-party-id', 'NetworkOperator')
      .send(validPayload);

    // 2. Debtor (BankA) Accepts
    const acceptRes = await request(app)
      .post('/api/v1/obligations/OBL-E2E-001/accept')
      .set('x-party-id', 'BankA')
      .send({});

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.data.status).toBe('Accepted');
    expect(acceptRes.body.data.version).toBe(2);

    // 3. Creditor (BankB) Confirms
    const confirmRes = await request(app)
      .post('/api/v1/obligations/OBL-E2E-001/confirm')
      .set('x-party-id', 'BankB')
      .send({});

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.status).toBe('Confirmed');
    expect(confirmRes.body.data.version).toBe(3);

    // 4. Query by ID
    const getRes = await request(app)
      .get('/api/v1/obligations/OBL-E2E-001')
      .set('x-party-id', 'BankA');

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.obligationId).toBe('OBL-E2E-001');
    expect(getRes.body.data.status).toBe('Confirmed');
  });

  test('enforces idempotency replay for identical requests with x-idempotency-key', async () => {
    const idemKey = 'e2e-idem-key-100';

    const res1 = await request(app)
      .post('/api/v1/obligations')
      .set('x-party-id', 'NetworkOperator')
      .set('x-idempotency-key', idemKey)
      .send({
        ...validPayload,
        obligationId: 'OBL-IDEM-001'
      });

    expect(res1.status).toBe(201);

    // Send identical request with same key
    const res2 = await request(app)
      .post('/api/v1/obligations')
      .set('x-party-id', 'NetworkOperator')
      .set('x-idempotency-key', idemKey)
      .send({
        ...validPayload,
        obligationId: 'OBL-IDEM-001'
      });

    expect(res2.status).toBe(201);
    expect(res2.headers['x-idempotency-replayed']).toBe('true');
    expect(res2.body).toEqual(res1.body);
  });
});
