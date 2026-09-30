export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    timestamp: string;
    traceId: string;
    path?: string;
  };
}

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, 'ERR_VALIDATION_FAILED', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required.') {
    super(401, 'ERR_UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied for requested operation.') {
    super(403, 'ERR_FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier: string) {
    super(404, 'ERR_RESOURCE_NOT_FOUND', `${resource} with identifier '${identifier}' was not found.`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(409, 'ERR_RESOURCE_CONFLICT', message, details);
  }
}

export class UnprocessableError extends AppError {
  constructor(message: string, details?: unknown) {
    super(422, 'ERR_UNPROCESSABLE_STATE', message, details);
  }
}

export class LedgerCommunicationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(502, 'ERR_CANTON_LEDGER_FAILED', message, details);
  }
}

export class SettlementRailError extends AppError {
  constructor(message: string, details?: unknown) {
    super(502, 'ERR_SETTLEMENT_RAIL_FAILED', message, details);
  }
}
