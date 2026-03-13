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
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the specified delay
 *
 * @example
 * ```typescript
 * await sleep(1000); // Sleep for 1 second
 * ```
 *
 * @complexity O(1) - Constant time operation
 * @since 2026.3.13
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay for a given retry attempt using exponential backoff
 *
 * @param attempt - The retry attempt number (1-indexed)
 * @param config - Retry configuration options
 * @returns Delay in milliseconds for this retry attempt
 *
 * @example
 * ```typescript
 * const delay = getRetryDelay(3, { maxRetries: 3, initialDelay: 1000, maxDelay: 30000, backoffMultiplier: 2, timeout: 5000 });
 * // Returns: 4000 (1000 * 2^2)
 * ```
 *
 * @complexity O(1) - Constant time calculation
 * @performance Uses exponential backoff formula with max delay cap
 * @since 2026.3.13
 * @see {@link retryAsync} For retry logic that uses this delay calculation
 */
export function getRetryDelay(attempt: number, config: RetryConfig = DEFAULT_RETRY_CONFIG): number {
  const delay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1);
  return Math.min(delay, config.maxDelay);
}

/**
 * Create an abort controller with automatic timeout
 *
 * Creates an AbortController that automatically aborts after the specified timeout.
 * Useful for implementing timeout behavior in async operations.
 *
 * @param timeoutMs - Timeout in milliseconds
 * @returns Object containing the AbortController and timeout ID
 *
 * @example
 * ```typescript
 * const { controller, timeoutId } = createTimeoutController(5000);
 * try {
 *   const response = await fetch(url, { signal: controller.signal });
 * } finally {
 *   clearTimeout(timeoutId);
 * }
 * ```
 *
 * @complexity O(1) - Constant time operation
 * @since 2026.3.13
 * @see {@link fetchWithRetry} For fetch with timeout support
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
 * Execute a function with retry logic and exponential backoff
 *
 * Retries the function on failure with exponential backoff delay between attempts.
 * Only retries errors classified as retryable by isRetryableError().
 *
 * @param fn - Async function to execute
 * @param options - Retry configuration options
 * @returns Result of the function call
 * @throws Last error if all retries are exhausted or error is non-retryable
 *
 * @example
 * ```typescript
 * const result = await retryAsync(async () => {
 *   return await api.getData();
 * }, { maxRetries: 3, initialDelay: 1000 });
 * ```
 *
 * @complexity O(n * m) - Where n is maxRetries, m is function execution time
 * @performance Exponential backoff prevents request storms during failures
 * @since 2026.3.13
 * @see {@link isRetryableError} For error classification logic
 * @see {@link getRetryDelay} For delay calculation
 * @see {@link fetchWithRetry} For fetch-specific retry wrapper
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
 *
 * Wraps the native fetch API with automatic retry on failure and timeout support.
 * Combines AbortController timeout with retryAsync for robust network requests.
 *
 * @param url - URL to fetch
 * @param options - Fetch API options
 * @param retryOptions - Retry configuration options
 * @returns Fetch Response object
 * @throws Last error if all retries are exhausted or timeout occurs
 *
 * @example
 * ```typescript
 * const response = await fetchWithRetry('https://api.example.com/data', {
 *   method: 'GET',
 *   headers: { 'Content-Type': 'application/json' }
 * }, { maxRetries: 3, timeout: 5000 });
 * ```
 *
 * @complexity O(n * t) - Where n is maxRetries, t is network timeout
 * @performance Uses AbortController for timeout, exponential backoff for retries
 * @since 2026.3.13
 * @see {@link retryAsync} For underlying retry logic
 * @see {@link createTimeoutController} For timeout implementation
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
 * Wrap any async function with retry logic
 *
 * Higher-order function that adds retry capability to any async function.
 * Returns a new function with the same signature that retries on failure.
 *
 * @param fn - Async function to wrap
 * @param options - Retry configuration options
 * @returns Wrapped function with retry capability
 *
 * @example
 * ```typescript
 * const apiWithRetry = withRetry(api.getData, { maxRetries: 3 });
 * const result = await apiWithRetry(); // Automatically retries on failure
 * ```
 *
 * @complexity O(n * m) - Where n is maxRetries, m is wrapped function execution time
 * @performance Creates closure over original function with retry logic
 * @since 2026.3.13
 * @see {@link retryAsync} For direct retry execution without wrapper
 */
export function withRetry<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: RetryOptions = {}
): T {
  return (async (...args: Parameters<T>): Promise<unknown> => {
    return retryAsync(() => fn(...args) as Promise<unknown>, options);
  }) as T;
}
