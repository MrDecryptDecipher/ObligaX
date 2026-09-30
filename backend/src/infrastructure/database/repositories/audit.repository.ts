import { v4 as uuidv4 } from 'uuid';

export interface AuditRecord {
  id: string;
  eventId: string;
  traceId: string;
  actor: string;
  action: string;
  resourceType: string;
  resourceId: string;
  contractId?: string;
  payloadBefore?: unknown;
  payloadAfter?: unknown;
  ipAddress?: string;
  timestamp: Date;
}

export class AuditRepository {
  private auditLogs: AuditRecord[] = [];

  public async record(entry: Omit<AuditRecord, 'id' | 'eventId' | 'timestamp'>): Promise<AuditRecord> {
    const record: AuditRecord = {
      id: uuidv4(),
      eventId: uuidv4(),
      timestamp: new Date(),
      ...entry
    };
    this.auditLogs.push(record);
    return record;
  }

  public async query(filters?: {
    resourceId?: string;
    resourceType?: string;
    actor?: string;
    traceId?: string;
  }): Promise<AuditRecord[]> {
    let result = [...this.auditLogs];
    if (filters?.resourceId) {
      result = result.filter(r => r.resourceId === filters.resourceId);
    }
    if (filters?.resourceType) {
      result = result.filter(r => r.resourceType === filters.resourceType);
    }
    if (filters?.actor) {
      result = result.filter(r => r.actor === filters.actor);
    }
    if (filters?.traceId) {
      result = result.filter(r => r.traceId === filters.traceId);
    }
    return result;
  }
}
