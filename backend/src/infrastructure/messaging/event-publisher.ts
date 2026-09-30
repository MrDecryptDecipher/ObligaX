import { EventBus, DomainEvent } from './event-bus';
import { v4 as uuidv4 } from 'uuid';

export class EventPublisher {
  public static async publishEvent<T>(
    eventType: string,
    aggregateId: string,
    payload: T,
    traceId?: string
  ): Promise<DomainEvent<T>> {
    const event: DomainEvent<T> = {
      eventId: uuidv4(),
      eventType,
      aggregateId,
      timestamp: new Date(),
      payload,
      traceId
    };

    await EventBus.publish(event);
    return event;
  }
}
