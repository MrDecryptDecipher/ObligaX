import { Request, Response, NextFunction } from 'express';
import { TokenVerifier, TokenPayload } from '../../infrastructure/security/token-verifier';
import { UnauthorizedError, ForbiddenError } from '../../types/errors.types';
import { RequestContext } from '../../types/common.types';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
  context: RequestContext;
}

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const devPartyHeader = req.headers['x-party-id'] as string;

  let payload: TokenPayload;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    payload = TokenVerifier.verify(token);
  } else if (devPartyHeader) {
    // Development / test convenience header
    payload = {
      sub: devPartyHeader,
      party: devPartyHeader,
      roles: ['Operator', 'Participant', 'SettlementParticipant', 'NettingParticipant']
    };
  } else if (process.env.NODE_ENV === 'test') {
    // Test environment fallback
    payload = {
      sub: 'test-user',
      party: 'NetworkOperator',
      roles: ['Operator', 'Participant']
    };
  } else {
    return next(new UnauthorizedError('Missing or malformed Authorization header.'));
  }

  (req as any).user = payload;
  (req as any).context = {
    traceId: (req as any).traceId || 'trace-default',
    actor: payload.party,
    partyId: payload.party,
    roles: payload.roles,
    ipAddress: req.ip,
    idempotencyKey: req.headers['x-idempotency-key'] as string
  };

  next();
};

export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as TokenPayload;
    if (!user) {
      return next(new UnauthorizedError());
    }

    const hasRole = roles.some(r => user.roles.includes(r));
    if (!hasRole) {
      return next(new ForbiddenError(`Required role(s): ${roles.join(', ')}`));
    }

    next();
  };
};
