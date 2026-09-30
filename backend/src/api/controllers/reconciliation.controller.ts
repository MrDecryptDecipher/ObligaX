import { Request, Response, NextFunction } from 'express';
import { ReconciliationService } from '../../application/reconciliation/reconciliation.service';
import { ApiResponse } from '../../types/common.types';

export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  public runReconciliation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const operatorParty = (req as any).context.partyId || 'NetworkOperator';
      const result = await this.reconciliationService.runObligationReconciliation(operatorParty);
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
