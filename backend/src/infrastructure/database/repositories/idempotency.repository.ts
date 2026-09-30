export interface IdempotencyEntry {
  key: string;
  requestHash: string;
  endpoint: string;
  method: string;
  statusCode?: number;
  headers?: Record<string, string>;
  body?: unknown;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  expiresAt: Date;
  createdAt: Date;
}

export class IdempotencyRepository {
  private cache: Map<string, IdempotencyEntry> = new Map();

  public async get(key: string): Promise<IdempotencyEntry | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (entry.expiresAt.getTime() <= Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return entry;
  }

  public async lock(
    key: string,
    requestHash: string,
    endpoint: string,
    method: string,
    ttlSeconds: number = 86400
  ): Promise<'ACQUIRED' | 'CONFLICT' | 'IN_FLIGHT'> {
    const existing = await this.get(key);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        return 'CONFLICT';
      }
      if (existing.status === 'PENDING') {
        return 'IN_FLIGHT';
      }
      return 'CONFLICT';
    }

    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    this.cache.set(key, {
      key,
      requestHash,
      endpoint,
      method,
      status: 'PENDING',
      expiresAt,
      createdAt: new Date()
    });

    return 'ACQUIRED';
  }

  public async complete(
    key: string,
    statusCode: number,
    headers: Record<string, string>,
    body: unknown
  ): Promise<void> {
    const existing = this.cache.get(key);
    if (existing) {
      existing.status = 'COMPLETED';
      existing.statusCode = statusCode;
      existing.headers = headers;
      existing.body = body;
      this.cache.set(key, existing);
    }
  }

  public async fail(key: string): Promise<void> {
    const existing = this.cache.get(key);
    if (existing) {
      existing.status = 'FAILED';
      this.cache.set(key, existing);
    }
  }

  public clear(): void {
    this.cache.clear();
  }
}
