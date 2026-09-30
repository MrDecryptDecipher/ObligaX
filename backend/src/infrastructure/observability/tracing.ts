import { AsyncLocalStorage } from 'async_hooks';
import crypto from 'crypto';
import { trace, context, Span } from '@opentelemetry/api';

export interface TraceContext {
  traceId: string;
  spanId: string;
  actor?: string;
  party?: string;
  commandId?: string;
  cantonTransactionId?: string;
  contractId?: string;
  settlementId?: string;
  startTime: number;
}

export const traceStorage = new AsyncLocalStorage<TraceContext>();

export class TracingHelper {
  private static readonly tracer = trace.getTracer('obligax-backend', '1.0.0');

  public static runWithTrace<T>(ctx: Partial<TraceContext>, fn: () => T): T {
    const fullContext: TraceContext = {
      traceId: ctx.traceId || crypto.randomUUID(),
      spanId: ctx.spanId || crypto.randomBytes(8).toString('hex'),
      actor: ctx.actor,
      party: ctx.party,
      commandId: ctx.commandId,
      cantonTransactionId: ctx.cantonTransactionId,
      contractId: ctx.contractId,
      settlementId: ctx.settlementId,
      startTime: ctx.startTime || Date.now()
    };

    return traceStorage.run(fullContext, () => {
      const activeSpan = this.tracer.startSpan('operation');
      activeSpan.setAttribute('obligax.trace_id', fullContext.traceId);
      activeSpan.setAttribute('obligax.span_id', fullContext.spanId);
      if (fullContext.actor) activeSpan.setAttribute('obligax.actor', fullContext.actor);
      if (fullContext.party) activeSpan.setAttribute('obligax.party', fullContext.party);
      if (fullContext.commandId) activeSpan.setAttribute('obligax.command_id', fullContext.commandId);
      if (fullContext.cantonTransactionId) activeSpan.setAttribute('obligax.canton_tx_id', fullContext.cantonTransactionId);
      if (fullContext.contractId) activeSpan.setAttribute('obligax.contract_id', fullContext.contractId);
      if (fullContext.settlementId) activeSpan.setAttribute('obligax.settlement_id', fullContext.settlementId);

      try {
        const result = fn();
        activeSpan.end();
        return result;
      } catch (err) {
        activeSpan.recordException(err instanceof Error ? err : new Error(String(err)));
        activeSpan.end();
        throw err;
      }
    });
  }

  public static getCurrentContext(): TraceContext | undefined {
    return traceStorage.getStore();
  }

  public static getCurrentTraceId(): string {
    const ctx = traceStorage.getStore();
    return ctx?.traceId || 'unknown-trace';
  }

  public static getCurrentActor(): string {
    const ctx = traceStorage.getStore();
    return ctx?.actor || 'anonymous';
  }

  public static correlateCanton(cantonTxId: string, contractId?: string): void {
    const ctx = traceStorage.getStore();
    if (ctx) {
      ctx.cantonTransactionId = cantonTxId;
      if (contractId) ctx.contractId = contractId;
    }
  }
}
