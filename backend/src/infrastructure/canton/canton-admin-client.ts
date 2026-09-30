import http from 'http';
import https from 'https';
import fs from 'fs';
import {
  CantonLedgerConfig,
  CantonPartyDetails,
  CantonPackageDetails
} from '../../types/canton.types';
import { CantonErrorNormalizer } from './canton-errors';

export class CantonAdminClient {
  private readonly baseUrl: string;
  private readonly httpsAgent?: https.Agent;

  constructor(private readonly config: CantonLedgerConfig) {
    const protocol = config.useTls ? 'https' : 'http';
    this.baseUrl = `${protocol}://${config.host}:${config.adminPort}`;

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
   * Allocate party in Canton participant node topology
   */
  public async allocateParty(partyHint: string, displayName?: string): Promise<CantonPartyDetails> {
    try {
      const res = await this.request<{ partyDetails: CantonPartyDetails }>('POST', '/api/v1/admin/parties', {
        partyIdHint: partyHint,
        displayName: displayName || partyHint
      });
      return res.partyDetails;
    } catch (err: unknown) {
      throw CantonErrorNormalizer.normalize(err);
    }
  }

  /**
   * List parties hosted on this participant node
   */
  public async listParties(): Promise<CantonPartyDetails[]> {
    try {
      const res = await this.request<{ parties: CantonPartyDetails[] }>('GET', '/api/v1/admin/parties');
      return res.parties || [];
    } catch (err: unknown) {
      throw CantonErrorNormalizer.normalize(err);
    }
  }

  /**
   * Upload compiled DAML DAR to participant node
   */
  public async uploadPackage(darBuffer: Buffer, description?: string): Promise<{ packageId: string }> {
    try {
      const res = await this.request<{ packageId: string }>('POST', '/api/v1/admin/packages', {
        darBase64: darBuffer.toString('base64'),
        description: description || 'ObligaX DAR Package'
      });
      return res;
    } catch (err: unknown) {
      throw CantonErrorNormalizer.normalize(err);
    }
  }

  /**
   * List vetted packages on this participant
   */
  public async listPackages(): Promise<CantonPackageDetails[]> {
    try {
      const res = await this.request<{ packages: CantonPackageDetails[] }>('GET', '/api/v1/admin/packages');
      return res.packages || [];
    } catch (err: unknown) {
      throw CantonErrorNormalizer.normalize(err);
    }
  }

  /**
   * Vet package for synchronizer connectivity
   */
  public async vetPackage(packageId: string, synchronizerId?: string): Promise<{ vetted: boolean }> {
    try {
      const targetSync = synchronizerId || this.config.synchronizerId || 'synchronizer1';
      return await this.request<{ vetted: boolean }>('POST', `/api/v1/admin/topology/vetted-packages`, {
        packageId,
        synchronizerId: targetSync
      });
    } catch (err: unknown) {
      throw CantonErrorNormalizer.normalize(err);
    }
  }

  /**
   * Low-level Admin API HTTP request dispatcher
   */
  private async request<R>(method: string, path: string, body?: unknown): Promise<R> {
    const url = new URL(path, this.baseUrl);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Canton-Admin': 'true'
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
                resolve(JSON.parse(responseData) as R);
              } catch {
                resolve(responseData as unknown as R);
              }
            } else {
              reject(new Error(`Canton Admin API status ${statusCode}: ${responseData}`));
            }
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Canton Admin API request timed out after ${this.config.timeoutMs}ms`));
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
}
