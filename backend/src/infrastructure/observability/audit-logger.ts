import winston from 'winston';

const { combine, timestamp, printf, json } = winston.format;

export type DataClassification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';

export interface SecurityLogEvent {
  actor: string;
  organization?: string;
  party?: string;
  role?: string;
  operation: string;
  resource: string;
  contractId?: string;
  transactionId?: string;
  traceId: string;
  sourceIp?: string;
  authenticationMethod: 'JWT_BEARER' | 'MTLS' | 'SYSTEM';
  authorizationResult: 'ALLOWED' | 'DENIED';
  classification?: DataClassification;
  details?: Record<string, unknown>;
  timestamp?: Date;
}

const maskSensitiveData = (obj: any): any => {
  if (!obj || typeof obj !== 'object') return obj;
  const sensitiveKeys = ['secret', 'password', 'token', 'privatekey', 'key', 'seed', 'signature'];
  const masked: any = Array.isArray(obj) ? [] : {};

  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      masked[key] = '***REDACTED***';
    } else if (typeof value === 'object' && value !== null) {
      masked[key] = maskSensitiveData(value);
    } else {
      masked[key] = value;
    }
  }
  return masked;
};

const customFormat = printf(({ level, message, timestamp, traceId, ...meta }) => {
  const trace = traceId ? `[Trace: ${String(traceId)}] ` : '';
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(maskSensitiveData(meta))}` : '';
  return `${String(timestamp)} ${String(level)}: ${trace}${String(message)}${metaStr}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    process.env.NODE_ENV === 'production' ? json() : customFormat
  ),
  transports: [new winston.transports.Console()]
});

export class AuditLogger {
  public static info(message: string, meta?: Record<string, unknown>): void {
    logger.info(message, meta ? maskSensitiveData(meta) : undefined);
  }

  public static warn(message: string, meta?: Record<string, unknown>): void {
    logger.warn(message, meta ? maskSensitiveData(meta) : undefined);
  }

  public static error(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    const errorDetails =
      error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { raw: error };
    logger.error(message, { ...(meta ? maskSensitiveData(meta) : {}), error: errorDetails });
  }

  /**
   * Enterprise structured security event logging
   */
  public static logSecurityEvent(event: SecurityLogEvent): void {
    const classification = event.classification || 'CONFIDENTIAL';
    const level = event.authorizationResult === 'DENIED' ? 'warn' : 'info';

    logger.log(level, `[SECURITY_${event.authorizationResult}] ${event.operation} on ${event.resource}`, {
      actor: event.actor,
      organization: event.organization || 'UNKNOWN_ORG',
      party: event.party || 'UNKNOWN_PARTY',
      role: event.role || 'STANDARD_USER',
      operation: event.operation,
      resource: event.resource,
      contractId: event.contractId,
      transactionId: event.transactionId,
      traceId: event.traceId,
      sourceIp: event.sourceIp || '127.0.0.1',
      authMethod: event.authenticationMethod,
      authResult: event.authorizationResult,
      classification,
      details: event.details ? maskSensitiveData(event.details) : undefined,
      securityTimestamp: (event.timestamp || new Date()).toISOString()
    });
  }
}
