import http from 'http';
import https from 'https';
import fs from 'fs';
import {
  CantonLedgerConfig,
  CantonSubmitRequest,
  CantonSubmitResult,
  CantonContractRecord,
  CantonHealthStatus,
  CantonLedgerEventWire
} from '../../types/canton.types';
import { CantonErrorNormalizer } from './canton-errors';
import { CantonRetryPolicy } from './canton-retry';

export class CantonLedgerClient {
  private readonly baseUrl: string;
  private readonly httpsAgent?: https.Agent;

  constructor(private readonly config: CantonLedgerConfig) {
    const protocol = config.useTls ? 'https' : 'http';
    this.baseUrl = `${protocol}://${config.host}:${config.port}`;

    if (config.useTls) {
      const agentOptions: https.AgentOptions = {
        rejectUnauthorized: true
      };

      if (config.tlsCaCertPath && fs.existsSync(config.tlsCaCertPath)) {
        agentOptions.ca = fs.readFileSync(config.tlsCaCertPath);
      }
      if (config.tlsClientCertPath && fs.existsSync(config.tlsClientCertPath)) {
        agentOptions.cert = fs.readFileSync(config.tlsClientCertPath);
      }
      if (config.tlsClientKeyPath && fs.existsSync(config.tlsClientKeyPath)) {
        agentOptions.key = fs.readFileSync(config.tlsClientKeyPath);
      }

      this.httpsAgent = new https.Agent(agentOptions);
    }
  }

  /**
   * Health check against real Canton participant node
   */
  public async healthCheck(): Promise<CantonHealthStatus> {
    try {
      const res = await this.request<{ status?: string; participantId?: string; synchronizerId?: string }>(
        'GET',
        '/v2/health'
      );

      return {
        connected: true,
        mode: 'live-canton',
        participantId: res.participantId || this.config.participantId,
        synchronizerId: res.synchronizerId || this.config.synchronizerId,
        ledgerApiVersion: this.config.ledgerApiVersion || 'v2',
        details: res
      };
    } catch (err: unknown) {
      return {
        connected: false,
        mode: 'error',
        ledgerApiVersion: this.config.ledgerApiVersion || 'v2',
        details: err instanceof Error ? err.message : String(err)
      };
    }
  }

  /**
   * Submit commands to Canton Ledger API v2 submit-and-wait endpoint with retry
   */
  public async submitAndWait(request: CantonSubmitRequest): Promise<CantonSubmitResult> {
    return CantonRetryPolicy.execute(async () => {
      try {
        const payload = this.transformSubmitRequest(request);
        const response = await this.request<{
          transactionId?: string;
          commandId?: string;
          effectiveTime?: string;
          offset?: string;
          events?: CantonLedgerEventWire[];
          createdContractIds?: string[];
          archivedContractIds?: string[];
        }>('POST', '/v2/commands/submit-and-wait', payload);

        const createdContractIds =
          response.createdContractIds ||
          (response.events || [])
            .filter(e => e.created)
            .map(e => e.created!.contractId);

        const archivedContractIds =
          response.archivedContractIds ||
          (response.events || [])
            .filter(e => e.archived)
            .map(e => e.archived!.contractId);

        return {
          transactionId: response.transactionId || `tx-${Date.now()}`,
          commandId: response.commandId || request.commandId,
          effectiveTime: response.effectiveTime || new Date().toISOString(),
          offset: response.offset,
          createdContractIds,
          archivedContractIds,
          events: response.events
        };
      } catch (err: unknown) {
        throw CantonErrorNormalizer.normalize(err);
      }
    }, { maxRetries: 3 });
  }

  /**
   * Fetch active contract by contract ID from Canton Ledger API
   */
  public async fetchContract<T = Record<string, unknown>>(
    contractId: string,
    party?: string
  ): Promise<CantonContractRecord<T> | null> {
    try {
      const path = `/v2/state/contracts/${encodeURIComponent(contractId)}${
        party ? `?party=${encodeURIComponent(party)}` : ''
      }`;
      const res = await this.request<{ contract?: CantonContractRecord<T> }>('GET', path);
      return res.contract || null;
    } catch (err: unknown) {
      const appErr = CantonErrorNormalizer.normalize(err);
      if (appErr.statusCode === 404) return null;
      throw appErr;
    }
  }

  /**
   * Query Active Contract Set (ACS) for a template and party
   */
  public async queryActiveContracts<T = Record<string, unknown>>(
    templateId: string,
    party: string
  ): Promise<CantonContractRecord<T>[]> {
    try {
      const path = `/v2/state/active-contracts?template_id=${encodeURIComponent(templateId)}&party=${encodeURIComponent(party)}`;
      const res = await this.request<{ contracts?: CantonContractRecord<T>[] }>('GET', path);
      return res.contracts || [];
    } catch (err: unknown) {
      throw CantonErrorNormalizer.normalize(err);
    }
  }

  /**
   * Transform internal command representation to Canton OpenAPI Ledger API format
   */
  private transformSubmitRequest(request: CantonSubmitRequest): Record<string, unknown> {
    const commandsWire = request.commands.map(cmd => {
      if (cmd.type === 'create') {
        return {
          create: {
            templateId: cmd.templateId,
            payload: cmd.argument
          }
        };
      } else if (cmd.type === 'exercise') {
        return {
          exercise: {
            templateId: cmd.templateId,
            contractId: cmd.contractId,
            choice: cmd.choice,
            argument: cmd.argument
          }
        };
      } else if (cmd.type === 'exerciseByKey') {
        return {
          exerciseByKey: {
            templateId: cmd.templateId,
            contractKey: cmd.contractKey,
            choice: cmd.choice,
            argument: cmd.argument
          }
        };
      } else if (cmd.type === 'createAndExercise') {
        return {
          createAndExercise: {
            templateId: cmd.templateId,
            payload: cmd.payload,
            choice: cmd.choice,
            argument: cmd.argument
          }
        };
      }
      return cmd;
    });

    return {
      commands: commandsWire,
      commandId: request.commandId,
      actAs: request.actAs,
      readAs: request.readAs || [],
      workflowId: request.workflowId,
      deduplicationPeriodMs: request.deduplicationPeriodMs || 30000
    };
  }

  /**
   * Low-level HTTP / HTTPS request dispatcher with TLS, timeouts, and auth
   */
  public async request<R>(method: string, path: string, body?: unknown): Promise<R> {
    const url = new URL(path, this.baseUrl);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Canton-Participant-Id': this.config.participantId || 'participant1'
    };

    if (this.config.token) {
      headers['Authorization'] = `Bearer ${this.config.token}`;
    }

    const payload = body ? JSON.stringify(body) : undefined;
    if (payload) {
      headers['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    return new Promise<R>((resolve, reject) => {
      const req = client.request(
        url,
        {
          method,
          headers,
          agent: this.httpsAgent,
          timeout: this.config.timeoutMs
        },
        res => {
          let responseData = '';
          res.on('data', chunk => {
            responseData += chunk;
          });

          res.on('end', () => {
            const statusCode = res.statusCode || 500;
            if (statusCode >= 200 && statusCode < 300) {
              if (!responseData) return resolve({} as R);
              try {
                const parsed = JSON.parse(responseData);
                resolve(parsed as R);
              } catch (parseErr) {
                resolve(responseData as unknown as R);
              }
            } else {
              let errorMsg = `Canton Ledger API returned status ${statusCode}: ${responseData}`;
              try {
                const errObj = JSON.parse(responseData);
                if (errObj.message) errorMsg = errObj.message;
                if (errObj.error) errorMsg = `${errObj.error}: ${errObj.message || ''}`;
              } catch {
                // Keep raw response string
              }
              reject(new Error(errorMsg));
            }
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Canton Ledger API request timed out after ${this.config.timeoutMs}ms`));
      });

      req.on('error', err => {
        reject(err);
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }

  public getConfig(): CantonLedgerConfig {
    return { ...this.config };
  }
}
