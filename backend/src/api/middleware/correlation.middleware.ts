import { Request, Response, NextFunction } from 'express';
import { CorrelationIdHelper, CORRELATION_ID_HEADER, TRACE_ID_HEADER } from '../../utils/correlation-id';
import { TracingHelper } from '../../infrastructure/observability/tracing';

export const correlationMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const correlationId = CorrelationIdHelper.getOrGenerate(req);
  (req as any).traceId = correlationId;
  res.setHeader(CORRELATION_ID_HEADER, correlationId);
  res.setHeader(TRACE_ID_HEADER, correlationId);

  TracingHelper.runWithTrace(
    {
      traceId: correlationId,
      actor: (req as any).user?.party || 'anonymous',
      startTime: Date.now()
    },
    () => next()
  );
};
