import { EventEmitter } from 'events';

export interface DomainEvent<T = unknown> {
  eventId: string;
  eventType: string;
  aggregateId: string;
  timestamp: Date;
  payload: T;
  traceId?: string;
}

export type EventHandler<T = unknown> = (event: DomainEvent<T>) => Promise<void> | void;

export class EventBus {
  private static emitter = new EventEmitter();

  public static subscribe<T = unknown>(eventType: string, handler: EventHandler<T>): void {
    this.emitter.on(eventType, async (event: DomainEvent<T>) => {
      try {
        await handler(event);
      } catch (err: unknown) {
        console.error(`[EventBus] Error processing event '${eventType}':`, err);
      }
    });
  }

  public static async publish<T = unknown>(event: DomainEvent<T>): Promise<void> {
    this.emitter.emit(event.eventType, event);
    this.emitter.emit('*', event);
  }

  public static removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }
}
