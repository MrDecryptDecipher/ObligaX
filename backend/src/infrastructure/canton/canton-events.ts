export interface CantonCreatedEvent<T = Record<string, unknown>> {
  type: 'created';
  contractId: string;
  templateId: string;
  payload: T;
  signatories: string[];
  observers: string[];
  offset: string;
}

export interface CantonArchivedEvent {
  type: 'archived';
  contractId: string;
  templateId: string;
  offset: string;
}

export type CantonLedgerEvent = CantonCreatedEvent | CantonArchivedEvent;

export class CantonEventParser {
  public static parseTransactionEvents(rawTx: Record<string, unknown>): CantonLedgerEvent[] {
    const events: CantonLedgerEvent[] = [];
    const rawEvents = (rawTx['events'] as Record<string, unknown>[]) || [];

    for (const ev of rawEvents) {
      if (ev['created']) {
        const c = ev['created'] as Record<string, unknown>;
        events.push({
          type: 'created',
          contractId: String(c['contractId'] || ''),
          templateId: String(c['templateId'] || ''),
          payload: (c['payload'] || {}) as Record<string, unknown>,
          signatories: (c['signatories'] as string[]) || [],
          observers: (c['observers'] as string[]) || [],
          offset: String(ev['offset'] || '')
        });
      } else if (ev['archived']) {
        const a = ev['archived'] as Record<string, unknown>;
        events.push({
          type: 'archived',
          contractId: String(a['contractId'] || ''),
          templateId: String(a['templateId'] || ''),
          offset: String(ev['offset'] || '')
        });
      }
    }

    return events;
  }
}
