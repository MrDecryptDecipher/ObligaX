import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database';
import { PrismaClient } from '@prisma/client';

export type DataClassification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';

export interface AuditRecord {
  id: string;
  sequenceNumber: number;
  eventId: string;
  previousHash: string;
  currentHash: string;
  payloadHash: string;
  schemaVersion: number;
  traceId: string;
  actor: string;
  partyId?: string;
  tenantId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  contractId?: string;
  transactionId?: string;
  canonicalPayload?: string;
  payloadBefore?: unknown;
  payloadAfter?: unknown;
  classification: DataClassification;
  ipAddress?: string;
  timestamp: Date;
}

export class CanonicalJson {
  /**
   * Deterministic RFC 8785 / JSON canonicalization
   */
  public static canonicalize(obj: unknown): string {
    if (obj === null || obj === undefined) return 'null';
    if (typeof obj === 'number' || typeof obj === 'boolean') return JSON.stringify(obj);
    if (typeof obj === 'string') return JSON.stringify(obj);
    if (obj instanceof Date) return JSON.stringify(obj.toISOString());

    if (Array.isArray(obj)) {
      return '[' + obj.map(item => CanonicalJson.canonicalize(item)).join(',') + ']';
    }

    if (typeof obj === 'object') {
      const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
      const entries = sortedKeys.map(
        key => `${JSON.stringify(key)}:${CanonicalJson.canonicalize((obj as Record<string, unknown>)[key])}`
      );
      return '{' + entries.join(',') + '}';
    }

    return JSON.stringify(String(obj));
  }
}

export class AuditRepository {
  private static readonly GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
  private auditLogs: AuditRecord[] = [];
  private sequenceCounter = 0;
  private lastHash = AuditRepository.GENESIS_HASH;

  private get prisma(): PrismaClient {
    return DatabaseService.getClient();
  }

  /**
   * Records a tamper-evident cryptographically chained audit record
   * H_n = SHA256(sequence_number || event_id || timestamp || actor || action || resourceType || resourceId || payload_hash || H_{n-1})
   */
  public async record(
    entry: Omit<AuditRecord, 'id' | 'sequenceNumber' | 'eventId' | 'previousHash' | 'currentHash' | 'payloadHash' | 'schemaVersion' | 'timestamp' | 'classification'> & {
      classification?: DataClassification;
      eventId?: string;
    }
  ): Promise<AuditRecord> {
    this.sequenceCounter++;
    const sequenceNumber = this.sequenceCounter;
    const eventId = entry.eventId || uuidv4();
    const timestamp = new Date();
    const previousHash = this.lastHash;
    const classification = entry.classification || 'CONFIDENTIAL';

    // Canonicalize payload and calculate payload_hash
    const payloadToHash = {
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      contractId: entry.contractId,
      payloadBefore: entry.payloadBefore,
      payloadAfter: entry.payloadAfter
    };
    const canonicalPayload = CanonicalJson.canonicalize(payloadToHash);
    const payloadHash = crypto.createHash('sha256').update(canonicalPayload).digest('hex');

    // Chained hash equation: Hn = SHA256(event_data || H(n-1))
    const eventDataString = [
      sequenceNumber.toString(),
      eventId,
      timestamp.toISOString(),
      entry.actor,
      entry.action,
      entry.resourceType,
      entry.resourceId,
      entry.contractId || '',
      entry.traceId,
      payloadHash,
      previousHash
    ].join('||');

    const currentHash = crypto.createHash('sha256').update(eventDataString).digest('hex');
    this.lastHash = currentHash;

    const record: AuditRecord = {
      id: uuidv4(),
      sequenceNumber,
      eventId,
      previousHash,
      currentHash,
      payloadHash,
      schemaVersion: 1,
      traceId: entry.traceId,
      actor: entry.actor,
      partyId: entry.partyId,
      tenantId: entry.tenantId || 'OBLIGAX',
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      contractId: entry.contractId,
      transactionId: entry.transactionId,
      canonicalPayload,
      payloadBefore: entry.payloadBefore,
      payloadAfter: entry.payloadAfter,
      classification,
      ipAddress: entry.ipAddress,
      timestamp
    };

    if (DatabaseService.connected) {
      try {
        await this.prisma.auditEvent.create({
          data: {
            eventId: record.eventId,
            traceId: record.traceId,
            actor: record.actor,
            action: record.action,
            resourceType: record.resourceType,
            resourceId: record.resourceId,
            contractId: record.contractId,
            payloadBefore: record.payloadBefore as any,
            payloadAfter: record.payloadAfter as any,
            ipAddress: record.ipAddress,
            timestamp: record.timestamp
          }
        });
      } catch (err) {
        // Fallback
      }
    }

    this.auditLogs.push(record);
    return record;
  }

  /**
   * Cryptographic verification of the complete audit chain from genesis to tip
   */
  public verifyChainIntegrity(): { isValid: boolean; brokenAtSequence?: number; reason?: string } {
    let expectedPrevious = AuditRepository.GENESIS_HASH;

    for (let i = 0; i < this.auditLogs.length; i++) {
      const record = this.auditLogs[i];

      // 1. Verify link to previous hash
      if (record.previousHash !== expectedPrevious) {
        return {
          isValid: false,
          brokenAtSequence: record.sequenceNumber,
          reason: `Previous hash mismatch: expected ${expectedPrevious}, found ${record.previousHash}`
        };
      }

      // 2. Re-compute payload hash
      const payloadToHash = {
        action: record.action,
        resourceType: record.resourceType,
        resourceId: record.resourceId,
        contractId: record.contractId,
        payloadBefore: record.payloadBefore,
        payloadAfter: record.payloadAfter
      };
      const canonicalPayload = CanonicalJson.canonicalize(payloadToHash);
      const computedPayloadHash = crypto.createHash('sha256').update(canonicalPayload).digest('hex');

      if (computedPayloadHash !== record.payloadHash) {
        return {
          isValid: false,
          brokenAtSequence: record.sequenceNumber,
          reason: `Payload hash corrupted at sequence ${record.sequenceNumber}`
        };
      }

      // 3. Re-compute current hash
      const eventDataString = [
        record.sequenceNumber.toString(),
        record.eventId,
        record.timestamp.toISOString(),
        record.actor,
        record.action,
        record.resourceType,
        record.resourceId,
        record.contractId || '',
        record.traceId,
        record.payloadHash,
        record.previousHash
      ].join('||');

      const computedCurrentHash = crypto.createHash('sha256').update(eventDataString).digest('hex');
      if (computedCurrentHash !== record.currentHash) {
        return {
          isValid: false,
          brokenAtSequence: record.sequenceNumber,
          reason: `Current hash mismatch at sequence ${record.sequenceNumber}`
        };
      }

      expectedPrevious = record.currentHash;
    }

    return { isValid: true };
  }

  public async query(filters?: {
    resourceId?: string;
    resourceType?: string;
    actor?: string;
    traceId?: string;
  }): Promise<AuditRecord[]> {
    let result = [...this.auditLogs];
    if (filters?.resourceId) result = result.filter(r => r.resourceId === filters.resourceId);
    if (filters?.resourceType) result = result.filter(r => r.resourceType === filters.resourceType);
    if (filters?.actor) result = result.filter(r => r.actor === filters.actor);
    if (filters?.traceId) result = result.filter(r => r.traceId === filters.traceId);
    return result;
  }

  public getTipHash(): string {
    return this.lastHash;
  }

  public getChain(): AuditRecord[] {
    return this.auditLogs;
  }
}
