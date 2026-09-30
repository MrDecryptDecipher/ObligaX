export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  retryableErrors?: string[];
}

export class CantonRetryPolicy {
  public static async execute<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const maxRetries = options.maxRetries ?? 3;
    const initialDelayMs = options.initialDelayMs ?? 200;
    const maxDelayMs = options.maxDelayMs ?? 2000;
    const factor = options.factor ?? 2;

    let attempt = 0;
    let currentDelay = initialDelayMs;

    while (attempt <= maxRetries) {
      try {
        return await operation();
      } catch (err: unknown) {
        attempt++;
        const errMsg = err instanceof Error ? err.message : String(err);
        const isRetryable =
          errMsg.includes('Contention') ||
          errMsg.includes('timeout') ||
          errMsg.includes('UNAVAILABLE') ||
          errMsg.includes('connection refused') ||
          errMsg.includes('retryable');

        if (attempt > maxRetries || !isRetryable) {
          throw err;
        }

        // Add full jitter
        const jitter = Math.random() * currentDelay;
        const sleepMs = Math.min(currentDelay + jitter, maxDelayMs);
        await new Promise(resolve => setTimeout(resolve, sleepMs));

        currentDelay = Math.min(currentDelay * factor, maxDelayMs);
      }
    }

    throw new Error('RETRY-001: Maximum retry attempts exceeded.');
  }
}
