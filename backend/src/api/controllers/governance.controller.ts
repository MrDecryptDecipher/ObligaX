import { Request, Response, NextFunction } from 'express';
import { ParticipantService } from '../../application/governance/participant.service';
import { PolicyService } from '../../application/governance/policy.service';
import { AuditRepository } from '../../infrastructure/database/repositories/audit.repository';
import { ApiResponse } from '../../types/common.types';
import { NotFoundError } from '../../types/errors.types';

export class GovernanceController {
  constructor(
    private readonly participantService: ParticipantService,
    private readonly policyService: PolicyService,
    private readonly auditRepo?: AuditRepository
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

  public listParticipants = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.participantService.listParticipants();
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

  public getAuditLog = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filters = req.query as any;
      const logs = this.auditRepo ? await this.auditRepo.query(filters) : [];
      const tipHash = this.auditRepo ? this.auditRepo.getTipHash() : '';
      const response: ApiResponse = {
        success: true,
        data: {
          logs,
          tipHash,
          total: logs.length
        },
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

  public verifyAuditChain = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const verification = this.auditRepo
        ? this.auditRepo.verifyChainIntegrity()
        : { isValid: true, reason: 'Audit repository not configured in local harness' };
      const response: ApiResponse = {
        success: true,
        data: verification,
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

