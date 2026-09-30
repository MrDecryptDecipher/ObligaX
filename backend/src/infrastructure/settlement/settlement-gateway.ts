import express, { Request, Response } from 'express';
import crypto from 'crypto';
import http from 'http';

export interface WebhookCallbackPayload {
  settlementId: string;
  externalTransactionId: string;
  amount: string;
  currency: string;
  payer: string;
  payee: string;
  reference: string;
  status: 'COMPLETED' | 'FAILED';
  failureReason?: string;
  failureDetails?: string;
  timestamp: string;
}

export class SettlementGatewayServer {
  private app: express.Express;
  private server?: http.Server;
  private readonly secret: string;

  constructor(secret?: string) {
    this.secret = secret || process.env.SETTLEMENT_WEBHOOK_SECRET || 'obligax-institutional-settlement-hmac-secret-2026';
    this.app = express();
    this.app.use(express.json());
    this.setupRoutes();
  }

  private verifySignature(req: Request): boolean {
    const timestamp = req.headers['x-timestamp'] as string;
    const nonce = req.headers['x-nonce'] as string;
    const signature = req.headers['x-signature'] as string;

    if (!timestamp || !nonce || !signature) return false;

    // Check freshness: 5 min window
    const now = Date.now();
    if (Math.abs(now - parseInt(timestamp, 10)) > 300000) return false;

    const bodyStr = req.body ? JSON.stringify(req.body) : '';
    const expected = crypto
      .createHmac('sha256', this.secret)
      .update(`${timestamp}:${nonce}:${bodyStr}`)
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'));
  }

  private setupRoutes(): void {
    this.app.post('/api/v1/rail/initiate', (req: Request, res: Response): void => {
      if (!this.verifySignature(req)) {
        res.status(401).json({ error: 'ERR_GATEWAY_INVALID_SIGNATURE', message: 'HMAC signature verification failed.' });
        return;
      }

      const { rail, settlementId, payer, payee, amount, currency, reference } = req.body;
      const hex = crypto.randomBytes(4).toString('hex');
      const externalTxId = `TX-${rail}-${hex}`;

      // Simulate async settlement callback after 200ms
      setTimeout(async () => {
        await this.dispatchCallback({
          settlementId,
          externalTransactionId: externalTxId,
          amount,
          currency,
          payer,
          payee,
          reference,
          status: reference.includes('TRIGGER_FAIL') ? 'FAILED' : 'COMPLETED',
          failureReason: reference.includes('TRIGGER_FAIL') ? 'InsufficientLiquidity' : undefined,
          timestamp: new Date().toISOString()
        });
      }, 200);

      res.status(200).json({
        rail,
        settlementId,
        externalTransactionId: externalTxId,
        status: 'SUBMITTED',
        acknowledgementReference: `ACK-${rail}-${hex}`,
        initiatedAt: new Date().toISOString()
      });
    });

    this.app.get('/api/v1/rail/status/:id', (req: Request, res: Response) => {
      res.status(200).json({
        externalTransactionId: req.params.id,
        settlementId: req.query.settlementId,
        status: 'COMPLETED',
        completedAt: new Date().toISOString()
      });
    });

    this.app.post('/api/v1/rail/cancel', (req: Request, res: Response) => {
      res.status(200).json({
        cancelled: true,
        cancelledAt: new Date().toISOString()
      });
    });
  }

  public async dispatchCallback(payload: WebhookCallbackPayload, targetUrl = 'http://localhost:3000/api/v1/settlement/callback'): Promise<void> {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomBytes(12).toString('hex');
    const bodyStr = JSON.stringify(payload);

    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(`${timestamp}:${nonce}:${bodyStr}`)
      .digest('hex');

    const parsed = new URL(targetUrl);
    return new Promise((resolve, reject) => {
      const req = http.request(
        parsed,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyStr).toString(),
            'X-Request-ID': crypto.randomUUID(),
            'X-Timestamp': timestamp,
            'X-Nonce': nonce,
            'X-Signature': signature
          }
        },
        res => {
          res.on('data', () => {});
          res.on('end', () => resolve());
        }
      );

      req.on('error', err => {
        // Non-blocking in tests
        resolve();
      });

      req.write(bodyStr);
      req.end();
    });
  }

  public listen(port = 5020): Promise<void> {
    return new Promise(resolve => {
      this.server = this.app.listen(port, () => {
        resolve();
      });
    });
  }

  public close(): Promise<void> {
    return new Promise(resolve => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
