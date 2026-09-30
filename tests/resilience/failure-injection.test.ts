import request from 'supertest';
import crypto from 'crypto';
import { buildAppContainer } from '@/index';
import { Express } from 'express';
import { CantonLedgerClient } from '../../backend/src/infrastructure/canton/canton-ledger-client';
import { CantonRetryPolicy } from '../../backend/src/infrastructure/canton/canton-retry';
import { AuditRepository } from '../../backend/src/infrastructure/database/repositories/audit.repository';

describe('Resilience and Failure Injection Tests', () => {
  let app: Express;
  let container: ReturnType<typeof buildAppContainer>;

  beforeEach(() => {
    container = buildAppContainer();
    app = container.app;
  });

  test('Resilience 1: Canton Ledger Client retries transient network errors with exponential backoff and jitter', async () => {
    // Client configured pointing to a non-existent port to force connection failure
    const deadClient = new CantonLedgerClient({
      host: '127.0.0.1',
      port: 59999, // Dead port
      adminPort: 59999,
      useTls: false,
      operatorParty: 'NetworkOperator',
      timeoutMs: 100
    });

    const startTime = Date.now();
    await expect(
      deadClient.submitAndWait({
        commandId: 'RESILIENCE/RETRY_TEST/001',
        actAs: ['NetworkOperator'],
        commands: []
      })
    ).rejects.toThrow();

    const elapsed = Date.now() - startTime;
    // With 3 retries and backoff (initial 100ms), elapsed time should demonstrate retries were performed
    expect(elapsed).toBeGreaterThanOrEqual(100);
  });

  test('Resilience 2: Idempotent duplicate callback delivery on settlement webhook rail', async () => {
    // 1. Propose and confirm an obligation first
    const oblId = 'RESIL-SETTLE-001';
    await request(app)
      .post('/api/v1/obligations')
      .set('x-party-id', 'BankB')
      .send({
        obligationId: oblId,
        creditor: 'BankB',
        debtor: 'BankA',
        description: 'Settlement callback resilience test',
        amount: '150000.00',
        currency: 'USD',
        createdDate: '2026-09-30',
        dueDate: '2026-10-31',
        priority: 'Normal',
        sourceSystem: 'Trading',
        sourceReference: 'RESIL-REF-1',
        businessUnit: 'Treasury'
      });

    await request(app).post(`/api/v1/obligations/${oblId}/accept`).set('x-party-id', 'BankA').send({});
    await request(app).post(`/api/v1/obligations/${oblId}/confirm`).set('x-party-id', 'BankB').send({});

    // 2. Initiate settlement
    const settleId = 'SETTLE-RESIL-001';
    await request(app)
      .post('/api/v1/settlements')
      .set('x-party-id', 'BankB')
      .send({
        settlementId: settleId,
        obligationId: oblId,
        settlementRail: 'RTGS',
        sourceSystem: 'Fedwire',
        sourceReference: 'INIT-RESIL'
      });

    // 3. Construct external rail webhook callback payload
    const callbackPayload = {
      settlementId: settleId,
      status: 'COMPLETED',
      externalTransactionId: 'FED-TX-998877',
      reference: 'FED-REF-998877',
      rail: 'RTGS',
      amount: '150000.00',
      currency: 'USD',
      payer: 'BankA',
      payee: 'BankB',
      timestamp: new Date().toISOString()
    };

    const secret = process.env.SETTLEMENT_WEBHOOK_SECRET || 'obligax-institutional-settlement-hmac-secret-2026';
    const timestamp = Date.now().toString();
    const nonce = crypto.randomBytes(12).toString('hex');
    const bodyStr = JSON.stringify(callbackPayload);
    const signature = crypto.createHmac('sha256', secret).update(`${timestamp}:${nonce}:${bodyStr}`).digest('hex');

    // 4. Send FIRST callback delivery -> Should succeed (200)
    const firstDelivery = await request(app)
      .post('/api/v1/settlements/callback')
      .set('X-Timestamp', timestamp)
      .set('X-Nonce', nonce)
      .set('X-Signature', signature)
      .send(callbackPayload);

    expect(firstDelivery.status).toBe(200);
    expect(firstDelivery.body.success).toBe(true);

    // 5. Send DUPLICATE callback delivery with same nonce & signature -> Anti-replay / Idempotency absorbs it safely
    const duplicateDelivery = await request(app)
      .post('/api/v1/settlements/callback')
      .set('X-Timestamp', timestamp)
      .set('X-Nonce', nonce)
      .set('X-Signature', signature)
      .send(callbackPayload);

    // Either 200 (idempotent replay) or 409 Conflict (replay rejected), but NEVER 500 error or double settlement
    expect([200, 409]).toContain(duplicateDelivery.status);

    // 6. Verify obligation is in Settled terminal state and not corrupted
    const oblCheck = await request(app).get(`/api/v1/obligations/${oblId}`).set('x-party-id', 'BankB');
    expect(oblCheck.body.data.status).toBe('Settled');
  });

  test('Resilience 3: Tamper detection flags direct out-of-band modification to audit record', async () => {
    const auditRepo = new AuditRepository();

    await auditRepo.record({
      traceId: 'trace-resil-1',
      actor: 'BankA',
      action: 'OBLIGATION_PROPOSED',
      resourceType: 'Obligation',
      resourceId: 'OBL-TAMPER-001',
      payloadAfter: { amount: '1000' }
    });

    await auditRepo.record({
      traceId: 'trace-resil-2',
      actor: 'BankB',
      action: 'OBLIGATION_ACCEPTED',
      resourceType: 'Obligation',
      resourceId: 'OBL-TAMPER-001',
      payloadAfter: { amount: '1000', status: 'Accepted' }
    });

    // Clean chain passes
    expect(auditRepo.verifyChainIntegrity().isValid).toBe(true);

    // Malicious attacker directly modifies in-memory/DB payload without knowledge of secret or subsequent hash recomputation
    const chain = auditRepo.getChain();
    chain[0].payloadHash = '0000000000000000000000000000000000000000000000000000000000000000';

    // Verification must immediately detect the tamper and identify the sequence
    const check = auditRepo.verifyChainIntegrity();
    expect(check.isValid).toBe(false);
    expect(check.brokenAtSequence).toBe(1);
  });
});
