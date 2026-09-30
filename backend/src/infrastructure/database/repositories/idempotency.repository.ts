import { DatabaseService } from '../database';
import { PrismaClient, IdempotencyStatus as PrismaIdempotencyStatus } from '@prisma/client';

export interface IdempotencyEntry {
  tenantId: string;
  key: string;
  endpoint: string;
  method: string;
  requestHash: string;
  statusCode?: number;
  headers?: Record<string, string>;
  body?: unknown;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';
  expiresAt: Date;
  createdAt: Date;
  completedAt?: Date;
  traceId?: string;
}

export class IdempotencyRepository {
  // Resilient memory cache simulating UNIQUE (tenant_id, key, endpoint) constraint
  private cache: Map<string, IdempotencyEntry> = new Map();

  private get prisma(): PrismaClient {
    return DatabaseService.getClient();
  }

  private compositeKey(tenantId: string, key: string, endpoint: string): string {
    return `${tenantId}:::${key}:::${endpoint}`;
  }

  public async get(key: string, tenantId = 'OBLIGAX', endpoint = ''): Promise<IdempotencyEntry | null> {
    const compKey = this.compositeKey(tenantId, key, endpoint);

    if (DatabaseService.connected) {
      try {
        const record = await this.prisma.idempotencyRecord.findUnique({
          where: { key: compKey }
        });
        if (!record) return null;
        if (record.expiresAt.getTime() <= Date.now()) {
          return null;
        }
        return {
          tenantId,
          key,
          endpoint: record.endpoint,
          method: record.method,
          requestHash: record.requestHash,
          statusCode: record.statusCode || undefined,
          headers: (record.responseHeaders as Record<string, string>) || undefined,
          body: record.responseBody,
          status: record.status as any,
          expiresAt: record.expiresAt,
          createdAt: record.createdAt
        };
      } catch (err) {
        // Fallback to cache
      }
    }

    let entry = this.cache.get(compKey);
    if (!entry) {
      for (const e of this.cache.values()) {
        if (e.key === key && e.tenantId === tenantId) {
          entry = e;
          break;
        }
      }
    }
    if (!entry) return null;

    if (entry.expiresAt.getTime() <= Date.now()) {
      entry.status = 'EXPIRED';
      this.cache.delete(compKey);
      return null;
    }

    return entry;
  }

  public async lock(
    key: string,
    requestHash: string,
    endpoint: string,
    method: string,
    ttlSeconds = 86400,
    tenantId = 'OBLIGAX',
    traceId?: string
  ): Promise<'ACQUIRED' | 'CONFLICT' | 'IN_FLIGHT'> {
    const compKey = this.compositeKey(tenantId, key, endpoint);
    const existing = await this.get(key, tenantId, endpoint);

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
    const entry: IdempotencyEntry = {
      tenantId,
      key,
      requestHash,
      endpoint,
      method,
      status: 'PENDING',
      expiresAt,
      createdAt: new Date(),
      traceId
    };

    if (DatabaseService.connected) {
      try {
        await this.prisma.idempotencyRecord.create({
          data: {
            key: compKey,
            endpoint,
            method,
            requestHash,
            status: PrismaIdempotencyStatus.PENDING,
            expiresAt
          }
        });
      } catch (err) {
        // Fallback
      }
    }

    this.cache.set(compKey, entry);
    return 'ACQUIRED';
  }

  public async complete(
    key: string,
    statusCode: number,
    headers: Record<string, string>,
    body: unknown,
    tenantId = 'OBLIGAX',
    endpoint = ''
  ): Promise<void> {
    const compKey = this.compositeKey(tenantId, key, endpoint);
    let existing = this.cache.get(compKey);
    if (!existing) {
      for (const e of this.cache.values()) {
        if (e.key === key && e.tenantId === tenantId) {
          existing = e;
          break;
        }
      }
    }

    if (existing) {
      existing.status = 'COMPLETED';
      existing.statusCode = statusCode;
      existing.headers = headers;
      existing.body = body;
      existing.completedAt = new Date();
      this.cache.set(this.compositeKey(existing.tenantId, existing.key, existing.endpoint), existing);
    }

    if (DatabaseService.connected) {
      try {
        await this.prisma.idempotencyRecord.update({
          where: { key: compKey },
          data: {
            statusCode,
            responseHeaders: headers as any,
            responseBody: body as any,
            status: PrismaIdempotencyStatus.COMPLETED
          }
        });
      } catch (err) {
        // Fallback
      }
    }
  }

  public async fail(key: string, tenantId = 'OBLIGAX', endpoint = ''): Promise<void> {
    const compKey = this.compositeKey(tenantId, key, endpoint);
    let existing = this.cache.get(compKey);
    if (!existing) {
      for (const e of this.cache.values()) {
        if (e.key === key && e.tenantId === tenantId) {
          existing = e;
          break;
        }
      }
    }

    if (existing) {
      existing.status = 'FAILED';
      this.cache.set(this.compositeKey(existing.tenantId, existing.key, existing.endpoint), existing);
    }

    if (DatabaseService.connected) {
      try {
        await this.prisma.idempotencyRecord.update({
          where: { key: compKey },
          data: { status: PrismaIdempotencyStatus.FAILED }
        });
      } catch (err) {
        // Fallback
      }
    }
  }

  public clear(): void {
    this.cache.clear();
  }
}
