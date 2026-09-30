import { AppError } from '../../types/errors.types';

export class CantonErrorNormalizer {
  /**
   * Normalizes DAML runtime/ledger errors into structured domain errors
   */
  public static normalize(error: unknown): AppError {
    if (error instanceof AppError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);

    // Look for DAML assertMsg codes like OBL-001, NET-023, SET-005, GOV-001
    const damlMatch = message.match(/([A-Z]+-[A-Z0-9]+):\s*(.*)/);
    if (damlMatch && damlMatch[1] && damlMatch[2]) {
      const code = damlMatch[1];
      const desc = damlMatch[2].trim();

      if (code.startsWith('OBL-')) {
        return new AppError(422, code, `Obligation Contract Rule Violated: ${desc}`);
      }
      if (code.startsWith('NET-')) {
        return new AppError(422, code, `Netting Contract Rule Violated: ${desc}`);
      }
      if (code.startsWith('SET-')) {
        return new AppError(422, code, `Settlement Contract Rule Violated: ${desc}`);
      }
      if (code.startsWith('GOV-')) {
        return new AppError(422, code, `Governance Rule Violated: ${desc}`);
      }
    }

    // gRPC / HTTP error mappings from real Canton Participant
    if (
      message.includes('missing authorization') ||
      message.includes('requires authorizers') ||
      message.includes('PERMISSION_DENIED') ||
      message.includes('not authorized')
    ) {
      return new AppError(403, 'ERR_CANTON_AUTHORIZATION', `Ledger authorization failure: ${message}`);
    }

    if (
      message.includes('ContractNotFound') ||
      message.includes('could not find contract') ||
      message.includes('NOT_FOUND')
    ) {
      return new AppError(404, 'ERR_CANTON_CONTRACT_NOT_FOUND', `Canton contract not found or already consumed: ${message}`);
    }

    if (
      message.includes('Contention') ||
      message.includes('concurrent modification') ||
      message.includes('ABORTED') ||
      message.includes('ALREADY_EXISTS') ||
      message.includes('RESOURCE_EXHAUSTED')
    ) {
      return new AppError(409, 'ERR_CANTON_CONTENTION', `Ledger contention detected on contract: ${message}`);
    }

    if (
      message.includes('UNAVAILABLE') ||
      message.includes('connection refused') ||
      message.includes('ECONNREFUSED') ||
      message.includes('ENOTFOUND')
    ) {
      return new AppError(503, 'ERR_CANTON_UNAVAILABLE', `Canton participant node unavailable: ${message}`);
    }

    if (message.includes('DEADLINE_EXCEEDED') || message.includes('timeout')) {
      return new AppError(504, 'ERR_CANTON_TIMEOUT', `Canton ledger command submission timed out: ${message}`);
    }

    if (message.includes('INVALID_ARGUMENT') || message.includes('MALFORMED')) {
      return new AppError(400, 'ERR_CANTON_INVALID_ARGUMENT', `Canton command payload malformed: ${message}`);
    }

    return new AppError(502, 'ERR_CANTON_GENERIC', `Canton ledger execution failure: ${message}`);
  }
}
