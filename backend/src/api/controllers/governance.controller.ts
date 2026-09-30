import { Request, Response, NextFunction } from 'express';
import { ParticipantService } from '../../application/governance/participant.service';
import { PolicyService } from '../../application/governance/policy.service';
import { ApiResponse } from '../../types/common.types';
import { NotFoundError } from '../../types/errors.types';

export class GovernanceController {
  constructor(
    private readonly participantService: ParticipantService,
    private readonly policyService: PolicyService
  ) {}

  public registerParticipant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.participantService.registerParticipant(req.body, (req as any).context);
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

  public activateParticipant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.participantService.activateParticipant(req.params.id!, (req as any).context);
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

  public getParticipant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.participantService.getParticipant(req.params.id!);
      if (!result) {
        throw new NotFoundError('Participant', req.params.id!);
      }
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

  public setPolicy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.policyService.setPolicy(req.body, (req as any).context);
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

  public getPolicy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = this.policyService.getPolicy();
      if (!result) {
        throw new NotFoundError('Policy', 'ACTIVE');
      }
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
