import winston from 'winston';

const { combine, timestamp, printf, json, colorize } = winston.format;

const customFormat = printf(({ level, message, timestamp, traceId, ...meta }) => {
  const trace = traceId ? `[Trace: ${String(traceId)}] ` : '';
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${String(timestamp)} ${String(level)}: ${trace}${String(message)}${metaStr}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    process.env.NODE_ENV === 'production' ? json() : customFormat
  ),
  transports: [
    new winston.transports.Console()
  ]
});

export class AuditLogger {
  public static info(message: string, meta?: Record<string, unknown>): void {
    logger.info(message, meta);
  }

  public static warn(message: string, meta?: Record<string, unknown>): void {
    logger.warn(message, meta);
  }

  public static error(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    const errorDetails = error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { raw: error };
    logger.error(message, { ...meta, error: errorDetails });
  }
}
