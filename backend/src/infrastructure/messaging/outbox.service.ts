import { v4 as uuidv4 } from 'uuid';
import { KafkaMessageBroker, KafkaEnvelope } from './kafka-client';
import { EventBus } from './event-bus';
import { AuditLogger } from '../observability/audit-logger';

export interface OutboxEntry {
  id?: string;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  topic: string;
  payload: Record<string, unknown>;
  traceId?: string;
  partitionKey?: string;
  status?: 'PENDING' | 'PUBLISHED' | 'FAILED';
  retryCount?: number;
  createdAt?: Date;
  publishedAt?: Date;
}

export class OutboxService {
  private static outboxQueue: OutboxEntry[] = [];
  private static workerInterval?: NodeJS.Timeout;
  private static broker: KafkaMessageBroker = new KafkaMessageBroker();

  public static async recordEvent(entry: OutboxEntry): Promise<OutboxEntry> {
    const record: OutboxEntry = {
      id: entry.id || uuidv4(),
      tenantId: entry.tenantId || 'OBLIGAX',
      aggregateType: entry.aggregateType,
      aggregateId: entry.aggregateId,
      eventType: entry.eventType,
      topic: entry.topic || `obligax.${entry.aggregateType.toLowerCase()}`,
      payload: entry.payload,
      traceId: entry.traceId,
      partitionKey: entry.partitionKey || entry.aggregateId,
      status: 'PENDING',
      retryCount: 0,
      createdAt: new Date()
    };

    this.outboxQueue.push(record);
    return record;
  }

  public static async startWorker(intervalMs = 1000): Promise<void> {
    if (this.workerInterval) return;
    await this.broker.connect();

    this.workerInterval = setInterval(async () => {
      await this.processPendingEvents();
    }, intervalMs);
  }

  public static stopWorker(): void {
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = undefined;
    }
  }

  public static async processPendingEvents(): Promise<number> {
    const pending = this.outboxQueue.filter(e => e.status === 'PENDING');
    let processedCount = 0;

    for (const item of pending) {
      try {
        const envelope: KafkaEnvelope = {
          schemaVersion: '1.0.0',
          eventId: item.id || uuidv4(),
          eventType: item.eventType,
          aggregateId: item.aggregateId,
          partitionKey: item.partitionKey || item.aggregateId,
          timestamp: new Date().toISOString(),
          traceId: item.traceId,
          payload: item.payload
        };

        // Publish to message broker (Kafka/Redpanda)
        await this.broker.publish(item.topic, envelope);

        // Also publish to internal event bus for in-process subscribers
        await EventBus.publish({
          eventId: envelope.eventId,
          eventType: envelope.eventType,
          aggregateId: envelope.aggregateId,
          timestamp: new Date(),
          payload: envelope.payload,
          traceId: envelope.traceId
        });

        item.status = 'PUBLISHED';
        item.publishedAt = new Date();
        processedCount++;
      } catch (err: unknown) {
        item.retryCount = (item.retryCount || 0) + 1;
        if (item.retryCount > 5) {
          item.status = 'FAILED';
          AuditLogger.error(`Outbox event ${item.id} permanently failed after 5 retries.`, err);
        }
      }
    }

    // Retain only recent items
    if (this.outboxQueue.length > 5000) {
      this.outboxQueue = this.outboxQueue.filter(
        e => e.status === 'PENDING' || (e.publishedAt && Date.now() - e.publishedAt.getTime() < 3600000)
      );
    }

    return processedCount;
  }

  public static getPendingCount(): number {
    return this.outboxQueue.filter(e => e.status === 'PENDING').length;
  }
}
