import { IdempotencyRepository } from '@/infrastructure/database/repositories/idempotency.repository';
import { HashingUtils } from '@/utils/hashing';

describe('IdempotencyRepository', () => {
  let repo: IdempotencyRepository;

  beforeEach(() => {
    repo = new IdempotencyRepository();
  });

  test('acquires lock for new idempotency key', async () => {
    const key = 'idem-key-1';
    const hash = HashingUtils.sha256({ foo: 'bar' });
    const result = await repo.lock(key, hash, '/api/v1/obligations', 'POST');
    expect(result).toBe('ACQUIRED');

    const entry = await repo.get(key);
    expect(entry).not.toBeNull();
    expect(entry?.status).toBe('PENDING');
  });

  test('detects in-flight request for identical key and payload', async () => {
    const key = 'idem-key-2';
    const hash = HashingUtils.sha256({ foo: 'bar' });
    await repo.lock(key, hash, '/api/v1/obligations', 'POST');

    const secondAttempt = await repo.lock(key, hash, '/api/v1/obligations', 'POST');
    expect(secondAttempt).toBe('IN_FLIGHT');
  });

  test('detects conflict when same key is reused with different payload', async () => {
    const key = 'idem-key-3';
    const hash1 = HashingUtils.sha256({ amount: 100 });
    const hash2 = HashingUtils.sha256({ amount: 200 });

    await repo.lock(key, hash1, '/api/v1/obligations', 'POST');
    const conflictResult = await repo.lock(key, hash2, '/api/v1/obligations', 'POST');
    expect(conflictResult).toBe('CONFLICT');
  });

  test('completes and stores response for replay', async () => {
    const key = 'idem-key-4';
    const hash = HashingUtils.sha256({ amount: 500 });
    await repo.lock(key, hash, '/api/v1/obligations', 'POST');

    await repo.complete(key, 201, { 'content-type': 'application/json' }, { id: 'OBL-999' });

    const entry = await repo.get(key);
    expect(entry?.status).toBe('COMPLETED');
    expect(entry?.statusCode).toBe(201);
    expect(entry?.body).toEqual({ id: 'OBL-999' });
  });
});
