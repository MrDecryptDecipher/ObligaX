import { Kafka, Producer, Consumer, logLevel } from 'kafkajs';
import { AuditLogger } from '../observability/audit-logger';

export interface KafkaConfig {
  brokers: string[];
  clientId: string;
  groupId: string;
  useSsl?: boolean;
}

export interface KafkaEnvelope<T = unknown> {
  schemaVersion: string;
  eventId: string;
  eventType: string;
  aggregateId: string;
  partitionKey: string;
  timestamp: string;
  traceId?: string;
  payload: T;
}

export class KafkaMessageBroker {
  private kafka: Kafka;
  private producer: Producer;
  private consumer: Consumer;
  private isConnected = false;

  constructor(config?: Partial<KafkaConfig>) {
    const brokers = config?.brokers || (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
    const clientId = config?.clientId || process.env.KAFKA_CLIENT_ID || 'obligax-institutional-broker';
    const groupId = config?.groupId || process.env.KAFKA_GROUP_ID || 'obligax-core-group';

    this.kafka = new Kafka({
      clientId,
      brokers,
      logLevel: logLevel.ERROR,
      ssl: config?.useSsl || process.env.KAFKA_USE_SSL === 'true'
    });

    this.producer = this.kafka.producer();
    this.consumer = this.kafka.consumer({ groupId });
  }

  public async connect(): Promise<boolean> {
    try {
      await this.producer.connect();
      await this.consumer.connect();
      this.isConnected = true;
      AuditLogger.info('Connected to Kafka/Redpanda message broker.');
      return true;
    } catch (err: unknown) {
      this.isConnected = false;
      // In offline / local test environments, allow graceful non-blocking behavior
      AuditLogger.warn('Kafka message broker connection failed or offline. Fallback mode engaged.');
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.producer.disconnect();
      await this.consumer.disconnect();
      this.isConnected = false;
    }
  }

  public async publish<T>(topic: string, envelope: KafkaEnvelope<T>): Promise<void> {
    if (!this.isConnected) {
      return; // Offline fallback for local unit tests without Kafka
    }

    try {
      await this.producer.send({
        topic,
        messages: [
          {
            key: envelope.partitionKey,
            value: JSON.stringify(envelope),
            headers: {
              'schema-version': envelope.schemaVersion,
              'event-type': envelope.eventType,
              'trace-id': envelope.traceId || ''
            }
          }
        ]
      });
    } catch (err: unknown) {
      // Send to DLQ on persistent failure
      const dlqTopic = `${topic}.dlq`;
      AuditLogger.error(`Failed to publish message to ${topic}, redirecting to ${dlqTopic}`, err);
      try {
        await this.producer.send({
          topic: dlqTopic,
          messages: [
            {
              key: envelope.partitionKey,
              value: JSON.stringify({ ...envelope, dlqReason: String(err) })
            }
          ]
        });
      } catch (dlqErr) {
        AuditLogger.error(`Failed to publish to DLQ ${dlqTopic}`, dlqErr);
      }
    }
  }

  public async subscribe(
    topic: string,
    handler: (envelope: KafkaEnvelope) => Promise<void>
  ): Promise<void> {
    if (!this.isConnected) return;

    await this.consumer.subscribe({ topic, fromBeginning: false });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        try {
          const envelope = JSON.parse(message.value.toString()) as KafkaEnvelope;
          await handler(envelope);
        } catch (err: unknown) {
          AuditLogger.error(`Error processing Kafka message from topic ${topic}:`, err);
        }
      }
    });
  }

  public get connected(): boolean {
    return this.isConnected;
  }
}
