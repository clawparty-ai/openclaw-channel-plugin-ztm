/**
 * Retry utilities for ZTM Chat
 * @module utils/retry
 *
 * Provides retry logic with exponential backoff for network operations.
 * Supports timeout, configurable retries, and error classification.
 *
 * Features:
 * - Exponential backoff with configurable multiplier
 * - Timeout support via AbortController
 * - Retriable error classification (network, timeout, etc.)
 * - Non-retriable error detection (auth errors)
 * - Fetch wrapper with retry support
 *
 * @example
 * import { retryAsync, fetchWithRetry, withRetry } from './utils/retry.js';
 *
 * // Retry a function
 * const result = await retryAsync(async () => {
 *   return await api.getData();
 * }, { maxRetries: 3, initialDelay: 1000 });
 *
 * // Retry a fetch request
 * const response = await fetchWithRetry(url, options, { maxRetries: 3 });
 *
 * // Wrap any async function
 * const getDataWithRetry = withRetry(api.getData);
 */

// Retry utilities for ZTM Chat

import { logger } from './logger.js';
import { RETRY_INITIAL_DELAY_MS, RETRY_MAX_DELAY_MS, RETRY_TIMEOUT_MS } from '../constants.js';
import { ZTMTimeoutError, ZTMApiError } from '../types/errors.js';

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  timeout?: number;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  timeout: number;
}

/**
 * Type for error class constructors
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ErrorConstructor = new (...args: any[]) => Error;

/**
 * Configuration for RetryableErrorChecker
 */
export interface RetryableErrorConfig {
  /** HTTP status codes that indicate retryable errors (e.g., 429, 500-599) */
  retryableStatusCodes: number[];

  /** Regex patterns to match retryable error messages */
  retryableErrorPatterns: RegExp[];

  /** Error types that should never be retried */
  nonRetryableErrorTypes: ErrorConstructor[];

  /** Error types that are always retryable */
  retryableErrorTypes: ErrorConstructor[];
}

/**
 * Default retryable error configuration
 */
export const DEFAULT_RETRYABLE_ERROR_CONFIG: RetryableErrorConfig = {
  retryableStatusCodes: [429, 500, 502, 503, 504],
  retryableErrorPatterns: [
    /timeout/i,
    /network/i,
    /econnrefused/i,
    /etimedout/i,
    /enotfound/i,
    /econnreset/i,
    /aborterror/i,
    /fetch/i,
  ],
  nonRetryableErrorTypes: [],
  retryableErrorTypes: [ZTMTimeoutError, ZTMApiError],
};

/**
 * Class to determine if an error is retryable
 */
export class RetryableErrorChecker {
  constructor(private config: RetryableErrorConfig) {}

  /**
   * Check if an error is retryable
   * @param error - The error to check
   * @returns true if the error should be retried
   */
  isRetryable(error: unknown): boolean {
    // Handle non-Error objects
    if (!(error instanceof Error)) {
      return false;
    }

    // Check non-retryable types first
    for (const Type of this.config.nonRetryableErrorTypes) {
      if (error instanceof Type) {
        return false;
      }
    }

    // Check explicitly retryable types from config
    for (const Type of this.config.retryableErrorTypes) {
      if (error instanceof Type) {
        return this.checkRetryableSubconditions(error);
      }
    }

    // Check ZTM-specific error types
    if (error instanceof ZTMTimeoutError) {
      return true;
    }

    if (error instanceof ZTMApiError) {
      const statusCode = error.context.statusCode as number | undefined;
      if (statusCode !== undefined) {
        return this.config.retryableStatusCodes.includes(statusCode);
      }
      // If no status code, be conservative and allow retry
      return true;
    }

    // Check error message patterns for standard errors
    const message = error.message.toLowerCase();
    for (const pattern of this.config.retryableErrorPatterns) {
      if (pattern.test(message)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check subconditions for retryable error types (e.g., status codes)
   */
  private checkRetryableSubconditions(error: Error): boolean {
    // For ZTMApiError, check status code
    if (error instanceof ZTMApiError) {
      const statusCode = error.context.statusCode as number | undefined;
      if (statusCode !== undefined) {
        return this.config.retryableStatusCodes.includes(statusCode);
      }
      // If no status code, be conservative and allow retry
      return true;
    }

    // For ZTMTimeoutError, always retry
    if (error instanceof ZTMTimeoutError) {
      return true;
    }

    // For other types in retryableErrorTypes, allow retry
    return true;
  }
}

/**
 * Default retryable error checker instance
 */
export const defaultRetryChecker = new RetryableErrorChecker(DEFAULT_RETRYABLE_ERROR_CONFIG);

/**
 * Unified function to check if an error is retryable
 * @param error - The error to check
 * @returns true if the error should be retried
 */
export function isRetryableError(error: unknown): boolean {
  return defaultRetryChecker.isRetryable(error);
}

/**
 * Type for fetchWithRetry function - used for dependency injection
 */
export type FetchWithRetry = typeof fetchWithRetry;

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: RETRY_INITIAL_DELAY_MS,
  maxDelay: RETRY_MAX_DELAY_MS,
  backoffMultiplier: 2,
  timeout: RETRY_TIMEOUT_MS,
};

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay for a given retry attempt
 */
export function getRetryDelay(attempt: number, config: RetryConfig = DEFAULT_RETRY_CONFIG): number {
  const delay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1);
  return Math.min(delay, config.maxDelay);
}

/**
 * Create an abort controller with timeout
 */
export function createTimeoutController(timeoutMs: number): {
  controller: AbortController;
  timeoutId: ReturnType<typeof setTimeout>;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timeoutId };
}

/**
 * Execute a function with retry logic
 */
export async function retryAsync<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const config: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...options,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retriable
      const isRetriable = isRetryableError(lastError);
      if (!isRetriable || attempt >= config.maxRetries) {
        throw lastError;
      }

      // Wait before retry
      if (attempt < config.maxRetries) {
        const delay = getRetryDelay(attempt + 1, config);
        logger.debug?.(
          `[Retry] Attempt ${attempt + 1}/${config.maxRetries + 1} failed, retrying in ${delay}ms: ${lastError.message}`
        );
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Retry failed');
}

/**
 * Fetch with timeout and retry support
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<Response> {
  const config: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...retryOptions,
  };

  return retryAsync(async () => {
    const { controller, timeoutId } = createTimeoutController(config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }, config);
}

/**
 * Wrap any function with retry logic
 */
export function withRetry<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: RetryOptions = {}
): T {
  return (async (...args: Parameters<T>): Promise<unknown> => {
    return retryAsync(() => fn(...args) as Promise<unknown>, options);
  }) as T;
}
