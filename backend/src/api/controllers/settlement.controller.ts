import { Request, Response, NextFunction } from 'express';
import { SettlementService } from '../../application/settlement/settlement.service';
import { ApiResponse } from '../../types/common.types';
import { AntiReplayStore } from '../middleware/anti-replay.middleware';
import crypto from 'crypto';

export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  public initiate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.settlementService.initiateSettlement(req.body, (req as any).context);
      const response: ApiResponse = {
        success: true,
        data: result,
        meta: {
          traceId: (req as any).traceId,
          timestamp: new Date().toISOString()
        }
      };
      res.status(201).json(response);
    } catch (err: unknown) {
      next(err);
    }
  };

  public getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.settlementService.getSettlement(req.params.id!, (req as any).context);
      const response: ApiResponse = {
        success: true,
        data: result,
        meta: {
          traceId: (req as any).traceId,
          timestamp: new Date().toISOString()
        }
      };
      res.status(200).json(response);
    } catch (err: unknown) {
      next(err);
    }
  };

  public query = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.settlementService.querySettlements(req.query, (req as any).context);
      const response: ApiResponse = {
        success: true,
        data: result,
        meta: {
          traceId: (req as any).traceId,
          timestamp: new Date().toISOString()
        }
      };
      res.status(200).json(response);
    } catch (err: unknown) {
      next(err);
    }
  };


  public process = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.settlementService.processSettlement(req.params.id!, (req as any).context);
      const response: ApiResponse = {
        success: true,
        data: result,
        meta: {
          traceId: (req as any).traceId,
          timestamp: new Date().toISOString()
        }
      };
      res.status(200).json(response);
    } catch (err: unknown) {
      next(err);
    }
  };

  public retry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.settlementService.retrySettlement(req.body, (req as any).context);
      const response: ApiResponse = {
        success: true,
        data: result,
        meta: {
          traceId: (req as any).traceId,
          timestamp: new Date().toISOString()
        }
      };
      res.status(200).json(response);
    } catch (err: unknown) {
      next(err);
    }
  };

  /**
   * Cryptographically authentic webhook callback from external settlement rail
   */
  public handleCallback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const timestamp = req.headers['x-timestamp'] as string;
      const nonce = req.headers['x-nonce'] as string;
      const signature = req.headers['x-signature'] as string;

      if (!timestamp || !nonce || !signature) {
        res.status(401).json({
          error: 'ERR_CALLBACK_AUTH',
          message: 'Missing required webhook authentication headers (X-Timestamp, X-Nonce, X-Signature).'
        });
        return;
      }

      // 1. Cryptographic signature check (nonce/timestamp verified by anti-replay middleware)
      const secret = process.env.SETTLEMENT_WEBHOOK_SECRET || 'obligax-institutional-settlement-hmac-secret-2026';
      const bodyStr = JSON.stringify(req.body);
      const expected = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}:${nonce}:${bodyStr}`)
        .digest('hex');

      if (!crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'))) {
        res.status(401).json({
          error: 'ERR_CALLBACK_INVALID_SIGNATURE',
          message: 'HMAC-SHA256 signature verification failed for settlement callback.'
        });
        return;
      }

      // 3. Process asynchronous completion / failure
      const result = await this.settlementService.handleExternalCallback(req.body, {
        traceId: (req as any).traceId || crypto.randomUUID(),
        actor: 'ExternalSettlementRail',
        partyId: 'NetworkOperator',
        roles: ['SettlementOperator']
      });

      res.status(200).json({
        success: true,
        data: result,
        message: 'Settlement callback processed and reconciled.'
      });
    } catch (err: unknown) {
      next(err);
    }
  };
}
