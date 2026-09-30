import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { Request } from 'express';

export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const TRACE_ID_HEADER = 'x-trace-id';

export class CorrelationIdHelper {
  public static generate(): string {
    return uuidv4();
  }

  public static getOrGenerate(req: Request): string {
    const headerVal = req.headers[CORRELATION_ID_HEADER] || req.headers[TRACE_ID_HEADER] || req.headers['x-request-id'];
    if (typeof headerVal === 'string' && headerVal.trim() !== '') {
      return headerVal.trim();
    }
    if (Array.isArray(headerVal) && headerVal.length > 0 && headerVal[0]) {
      return headerVal[0].trim();
    }
    return CorrelationIdHelper.generate();
  }

  public static isValid(id: string): boolean {
    return typeof id === 'string' && id.trim().length >= 8 && id.trim().length <= 128;
  }
}
