/**
 * Tool Retry Logic
 *
 * Implements retry with exponential backoff for transient tool failures.
 */

// ============================================
// Types
// ============================================

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
  retryableErrors: string[];
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
}

// ============================================
// Default Config
// ============================================

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffFactor: 2,
  retryableErrors: [
    'ENOENT',
    'EACCES',
    'EBUSY',
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'rate_limit',
    'timeout',
    'network',
  ],
};

// ============================================
// Retry Logic
// ============================================

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const opts = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;
  let attempt = 0;

  while (attempt <= opts.maxRetries) {
    try {
      const result = await fn();
      return { success: true, result, attempts: attempt + 1 };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if error is retryable
      if (!isRetryable(lastError, opts.retryableErrors)) {
        return { success: false, error: lastError, attempts: attempt + 1 };
      }

      // Don't retry if we've exhausted attempts
      if (attempt >= opts.maxRetries) {
        break;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffFactor, attempt),
        opts.maxDelayMs
      );

      // Wait before retrying
      await sleep(delay);
      attempt++;
    }
  }

  return { success: false, error: lastError, attempts: attempt + 1 };
}

/**
 * Check if an error is retryable
 */
function isRetryable(error: Error, retryableErrors: string[]): boolean {
  const errorString = `${error.name} ${error.message}`.toLowerCase();
  
  for (const pattern of retryableErrors) {
    if (errorString.includes(pattern.toLowerCase())) {
      return true;
    }
  }

  // Check for common Node.js error codes
  if ('code' in error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code && retryableErrors.includes(code)) {
      return true;
    }
  }

  return false;
}

/**
 * Sleep for a given duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// Helpers
// ============================================

/**
 * Create a retry wrapper for a tool
 */
export function createRetryWrapper<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  config?: Partial<RetryConfig>
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    const result = await withRetry(() => fn(...args), config);
    if (result.success) {
      return result.result as ReturnType<T>;
    }
    throw result.error;
  }) as T;
}

/**
 * Check if we should retry based on error type
 */
export function shouldRetryError(error: Error): boolean {
  return isRetryable(error, DEFAULT_RETRY_CONFIG.retryableErrors);
}
