export class HttpRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "HttpRequestError";
  }
}

export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
};

const defaultRetryOptions = {
  attempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 2000,
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableError(error: unknown) {
  if (error instanceof HttpRequestError) {
    return error.status === 429 || error.status >= 500;
  }

  return error instanceof TypeError;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = options.attempts ?? defaultRetryOptions.attempts;
  const baseDelayMs = options.baseDelayMs ?? defaultRetryOptions.baseDelayMs;
  const maxDelayMs = options.maxDelayMs ?? defaultRetryOptions.maxDelayMs;
  const shouldRetry = options.shouldRetry ?? isRetryableError;
  let lastError: unknown;
  let attemptsUsed = 0;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    attemptsUsed = attempt;
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= attempts || !shouldRetry(error)) {
        break;
      }

      const exponentialDelay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jitter = Math.floor(Math.random() * Math.min(100, exponentialDelay));
      await sleep(exponentialDelay + jitter);
    }
  }

  throw new Error(`Operation failed after ${attemptsUsed} attempt(s): ${getErrorMessage(lastError)}`);
}
