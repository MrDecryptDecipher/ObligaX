import { Request, Response, NextFunction } from 'express';
import { SettlementService } from '../../application/settlement/settlement.service';
import { ApiResponse } from '../../types/common.types';

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
}
