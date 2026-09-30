import { AsyncLocalStorage } from 'async_hooks';

export interface TraceContext {
  traceId: string;
  actor?: string;
  startTime: number;
}

export const traceStorage = new AsyncLocalStorage<TraceContext>();

export class TracingHelper {
  public static runWithTrace<T>(context: TraceContext, fn: () => T): T {
    return traceStorage.run(context, fn);
  }

  public static getCurrentTraceId(): string {
    const ctx = traceStorage.getStore();
    return ctx?.traceId || 'unknown-trace';
  }

  public static getCurrentActor(): string {
    const ctx = traceStorage.getStore();
    return ctx?.actor || 'anonymous';
  }
}
