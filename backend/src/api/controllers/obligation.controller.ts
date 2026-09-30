import { Request, Response, NextFunction } from 'express';
import { ObligationService } from '../../application/obligations/obligation.service';
import { AmendmentService } from '../../application/obligations/amendment.service';
import { DisputeService } from '../../application/obligations/dispute.service';
import { ApiResponse } from '../../types/common.types';

export class ObligationController {
  constructor(
    private readonly obligationService: ObligationService,
    private readonly amendmentService: AmendmentService,
    private readonly disputeService: DisputeService
  ) {}

  public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.obligationService.createObligation(req.body, (req as any).context);
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
      const result = await this.obligationService.getObligation(req.params.id!, (req as any).context);
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
      const result = await this.obligationService.acceptObligation(req.params.id!, (req as any).context);
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

  public confirm = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.obligationService.confirmObligation(req.params.id!, (req as any).context);
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

  public cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.obligationService.cancelObligation(
        req.params.id!,
        req.body.cancellationReason || 'Cancelled by request',
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

  public proposeAmendment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.amendmentService.proposeAmendment(req.params.id!, req.body, (req as any).context);
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

  public raiseDispute = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.disputeService.raiseDispute(req.params.id!, req.body, (req as any).context);
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
      const result = await this.obligationService.queryObligations(req.query, (req as any).context);
      const response: ApiResponse = {
        success: true,
        data: result.data,
        meta: {
          pagination: result.pagination,
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
