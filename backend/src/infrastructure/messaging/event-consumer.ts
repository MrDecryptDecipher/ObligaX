import { EventBus, DomainEvent, EventHandler } from './event-bus';

export class EventConsumer {
  public static registerConsumer<T>(eventType: string, handler: EventHandler<T>): void {
    EventBus.subscribe(eventType, handler);
  }
}
