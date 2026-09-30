import http from 'http';
import https from 'https';
import fs from 'fs';
import { CantonLedgerConfig, CantonLedgerEventWire } from '../../types/canton.types';
import { CantonErrorNormalizer } from './canton-errors';

export interface DecodedTransactionEvent {
  offset: string;
  transactionId: string;
  commandId?: string;
  workflowId?: string;
  effectiveAt: Date;
  recordedAt: Date;
  eventType: 'created' | 'archived';
  contractId: string;
  templateId: string;
  payload?: Record<string, unknown>;
  signatories?: string[];
  observers?: string[];
  packageId?: string;
}

export type TransactionEventHandler = (event: DecodedTransactionEvent) => Promise<void>;

export class CantonEventStream {
  private isRunning = false;
  private currentOffset = '0';
  private handlers: TransactionEventHandler[] = [];
  private readonly baseUrl: string;
  private readonly httpsAgent?: https.Agent;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(private readonly config: CantonLedgerConfig) {
    const protocol = config.useTls ? 'https' : 'http';
    this.baseUrl = `${protocol}://${config.host}:${config.port}`;

    if (config.useTls) {
      const agentOptions: https.AgentOptions = { rejectUnauthorized: true };
      if (config.tlsCaCertPath && fs.existsSync(config.tlsCaCertPath)) agentOptions.ca = fs.readFileSync(config.tlsCaCertPath);
      if (config.tlsClientCertPath && fs.existsSync(config.tlsClientCertPath)) agentOptions.cert = fs.readFileSync(config.tlsClientCertPath);
      if (config.tlsClientKeyPath && fs.existsSync(config.tlsClientKeyPath)) agentOptions.key = fs.readFileSync(config.tlsClientKeyPath);
      this.httpsAgent = new https.Agent(agentOptions);
    }
  }

  public onEvent(handler: TransactionEventHandler): void {
    this.handlers.push(handler);
  }

  public setOffset(offset: string): void {
    this.currentOffset = offset;
  }

  public getOffset(): string {
    return this.currentOffset;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.connectStream();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
  }

  private connectStream(): void {
    if (!this.isRunning) return;

    const url = new URL(`/v2/updates?begin_exclusive=${encodeURIComponent(this.currentOffset)}`, this.baseUrl);
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'X-Canton-Participant-Id': this.config.participantId || 'participant1'
    };

    if (this.config.token) {
      headers['Authorization'] = `Bearer ${this.config.token}`;
    }

    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const req = client.request(
      url,
      {
        method: 'GET',
        headers,
        agent: this.httpsAgent,
        timeout: 0 // keep streaming open
      },
      res => {
        let buffer = '';

        res.on('data', async chunk => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const rawUpdate = JSON.parse(trimmed);
              await this.processRawUpdate(rawUpdate);
            } catch (parseErr) {
              // Non-JSON line or chunk boundary, continue
            }
          }
        });

        res.on('end', () => {
          this.scheduleReconnect();
        });

        res.on('error', err => {
          this.scheduleReconnect();
        });
      }
    );

    req.on('error', () => {
      this.scheduleReconnect();
    });

    req.end();
  }

  public async processRawUpdate(rawUpdate: Record<string, unknown>): Promise<void> {
    const txId = String(rawUpdate['transactionId'] || `tx-${Date.now()}`);
    const commandId = rawUpdate['commandId'] ? String(rawUpdate['commandId']) : undefined;
    const workflowId = rawUpdate['workflowId'] ? String(rawUpdate['workflowId']) : undefined;
    const effectiveAt = rawUpdate['effectiveAt'] ? new Date(String(rawUpdate['effectiveAt'])) : new Date();
    const recordedAt = rawUpdate['recordedAt'] ? new Date(String(rawUpdate['recordedAt'])) : new Date();
    const offset = String(rawUpdate['offset'] || this.currentOffset);

    this.currentOffset = offset;

    const events = (rawUpdate['events'] as CantonLedgerEventWire[]) || [];
    for (const ev of events) {
      if (ev.created) {
        const decoded: DecodedTransactionEvent = {
          offset,
          transactionId: txId,
          commandId,
          workflowId,
          effectiveAt,
          recordedAt,
          eventType: 'created',
          contractId: ev.created.contractId,
          templateId: ev.created.templateId,
          payload: ev.created.payload,
          signatories: ev.created.signatories,
          observers: ev.created.observers,
          packageId: ev.created.packageId
        };
        await this.dispatch(decoded);
      } else if (ev.archived) {
        const decoded: DecodedTransactionEvent = {
          offset,
          transactionId: txId,
          commandId,
          workflowId,
          effectiveAt,
          recordedAt,
          eventType: 'archived',
          contractId: ev.archived.contractId,
          templateId: ev.archived.templateId
        };
        await this.dispatch(decoded);
      }
    }
  }

  private async dispatch(event: DecodedTransactionEvent): Promise<void> {
    for (const handler of this.handlers) {
      try {
        await handler(event);
      } catch (err: unknown) {
        console.error(`[CantonEventStream] Handler error for transaction ${event.transactionId}:`, err);
      }
    }
  }

  private scheduleReconnect(): void {
    if (!this.isRunning) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connectStream();
    }, 3000);
  }
}
