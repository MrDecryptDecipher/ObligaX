import { Request, Response, NextFunction } from 'express';
import { NettingService } from '../../application/netting/netting.service';
import { ApiResponse } from '../../types/common.types';

export class NettingController {
  constructor(private readonly nettingService: NettingService) {}

  public propose = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.nettingService.proposeNetting(
        {
          ...req.body,
          initiator: (req as any).context.partyId
        },
        (req as any).context
      );
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
      const result = await this.nettingService.getNetting(req.params.id!, (req as any).context);
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

  public accept = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.nettingService.acceptNetting(req.params.id!, (req as any).context);
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

  public reject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.nettingService.rejectNetting(
        req.params.id!,
        req.body.reason || 'Rejected by counterparty',
        (req as any).context
      );
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

  public execute = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.nettingService.executeNetting(req.params.id!, (req as any).context);
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

  public getSettlement = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.nettingService.getSettlement(req.params.id!, (req as any).context);
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
