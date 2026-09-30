import request from 'supertest';
import { buildAppContainer } from '@/index';
import { Express } from 'express';

describe('Settlement API E2E', () => {
  let app: Express;

  beforeEach(() => {
    const container = buildAppContainer();
    app = container.app;
  });

  const setupConfirmedObligation = async (obligationId: string, amount: string = '50000.00') => {
    await request(app)
      .post('/api/v1/obligations')
      .set('x-party-id', 'NetworkOperator')
      .send({
        obligationId,
        creditor: 'BankB',
        debtor: 'BankA',
        description: 'Settlement test obligation',
        amount,
        currency: 'USD',
        createdDate: '2026-09-30',
        dueDate: '2026-10-31',
        priority: 'High',
        sourceSystem: 'Core',
        sourceReference: `REF-${obligationId}`,
        businessUnit: 'Treasury'
      });
    await request(app).post(`/api/v1/obligations/${obligationId}/accept`).set('x-party-id', 'BankA').send({});
    await request(app).post(`/api/v1/obligations/${obligationId}/confirm`).set('x-party-id', 'BankB').send({});
  };

  test('executes direct settlement successfully: Confirmed -> SettlementPending -> Settled', async () => {
    await setupConfirmedObligation('SETTLE-OBL-1');

    // 1. Creditor (Bank B) Initiates Settlement
    const initRes = await request(app)
      .post('/api/v1/settlements')
      .set('x-party-id', 'BankB')
      .send({
        settlementId: 'SETTLE-INST-001',
        obligationId: 'SETTLE-OBL-1',
        settlementRail: 'RTGS',
        sourceSystem: 'Fedwire',
        sourceReference: 'FED-TX-9988'
      });

    expect(initRes.status).toBe(201);
    expect(initRes.body.data.settlementId).toBe('SETTLE-INST-001');
    expect(initRes.body.data.status).toBe('SettlementCreated');

    // Verify Obligation is in SettlementPending state
    const oblCheck1 = await request(app).get('/api/v1/obligations/SETTLE-OBL-1').set('x-party-id', 'BankB');
    expect(oblCheck1.body.data.status).toBe('SettlementPending');

    // 2. Process Settlement (Rail Succeeded)
    const procRes = await request(app)
      .post('/api/v1/settlements/SETTLE-INST-001/process')
      .set('x-party-id', 'BankB')
      .send({});

    expect(procRes.status).toBe(200);
    expect(procRes.body.data.status).toBe('SettlementCompleted');
    expect(procRes.body.data.executionMetadata.externalTransactionId).toBeDefined();

    // Verify Obligation is in Settled terminal state
    const oblCheck2 = await request(app).get('/api/v1/obligations/SETTLE-OBL-1').set('x-party-id', 'BankB');
    expect(oblCheck2.body.data.status).toBe('Settled');
  });

  test('handles settlement rail failure and supports retry after reopening obligation', async () => {
    await setupConfirmedObligation('SETTLE-OBL-FAIL');

    // 1. Initiate settlement with reference that triggers external rail failure
    await request(app)
      .post('/api/v1/settlements')
      .set('x-party-id', 'BankB')
      .send({
        settlementId: 'SETTLE-FAIL-001',
        obligationId: 'SETTLE-OBL-FAIL',
        settlementRail: 'RTGS',
        sourceSystem: 'Fedwire',
        sourceReference: 'TRIGGER_FAIL_INSUFFICIENT_FUNDS'
      });

    // 2. Process Settlement -> Fails on external rail
    const procRes = await request(app)
      .post('/api/v1/settlements/SETTLE-FAIL-001/process')
      .set('x-party-id', 'BankB')
      .send({});

    expect(procRes.status).toBe(200);
    expect(procRes.body.data.status).toBe('SettlementFailed');
    expect(procRes.body.data.failureMetadata.reason).toBe('InsufficientFunds');

    // 3. Verify Obligation safely reopened to Confirmed state
    const oblCheck = await request(app).get('/api/v1/obligations/SETTLE-OBL-FAIL').set('x-party-id', 'BankB');
    expect(oblCheck.body.data.status).toBe('Confirmed');

    // 4. Retry Settlement
    const retryRes = await request(app)
      .post('/api/v1/settlements/retry')
      .set('x-party-id', 'BankB')
      .send({
        failedSettlementId: 'SETTLE-FAIL-001',
        newSettlementId: 'SETTLE-RETRY-002',
        settlementReference: 'FED-RETRY-REF-2',
        settlementRail: 'RTGS',
        sourceSystem: 'Fedwire',
        sourceReference: 'NORMAL_EXECUTION'
      });

    expect(retryRes.status).toBe(200);
    expect(retryRes.body.data.settlementId).toBe('SETTLE-RETRY-002');
    expect(retryRes.body.data.status).toBe('SettlementCreated');

    // 5. Process retried settlement -> completes successfully
    const completeRetryRes = await request(app)
      .post('/api/v1/settlements/SETTLE-RETRY-002/process')
      .set('x-party-id', 'BankB')
      .send({});

    expect(completeRetryRes.status).toBe(200);
    expect(completeRetryRes.body.data.status).toBe('SettlementCompleted');

    // Final obligation state is Settled
    const finalOblCheck = await request(app).get('/api/v1/obligations/SETTLE-OBL-FAIL').set('x-party-id', 'BankB');
    expect(finalOblCheck.body.data.status).toBe('Settled');
  });
});
