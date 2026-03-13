/**
 * Gateway Retry Policies
 * @module channel/gateway-retry
 * @remarks
 * This module defines retry policies for gateway pipeline steps.
 * Each policy specifies the maximum attempts, initial delay, and backoff behavior
 * for different types of errors that may occur during account initialization.
 */
import type { RetryPolicy } from './gateway-pipeline.types.js';

/**
 * Predefined retry policies for different error types
 * @readonly
 * @remarks
 * - NO_RETRY: For steps that should not be retried (e.g., config validation)
 * - NETWORK: For network-related errors (3 attempts with exponential backoff)
 * - API: For API errors (2 attempts with linear backoff)
 * - WATCHER: For watcher-related errors (2 attempts with quick backoff)
 */
export const RETRY_POLICIES = {
  NO_RETRY: {
    maxAttempts: 1,
    initialDelayMs: 0,
    maxDelayMs: 0,
    backoffMultiplier: 1,
    isRetryable: (_error: Error) => false,
  },
  NETWORK: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    isRetryable: (error: Error) => isNetworkError(error),
  },
  API: {
    maxAttempts: 2,
    initialDelayMs: 1000,
    maxDelayMs: 2000,
    backoffMultiplier: 1,
    isRetryable: (error: Error) => isApiError(error),
  },
  WATCHER: {
    maxAttempts: 2,
    initialDelayMs: 500,
    maxDelayMs: 1000,
    backoffMultiplier: 1,
    isRetryable: (error: Error) => isWatcherError(error),
  },
} as const;

/**
 * Check if an error is a network-related error
 * @param error - The error to check
 * @returns true if the error is network-related
 *
 * @example
 * ```typescript
 * const error = new Error('connect ECONNREFUSED');
 * isNetworkError(error); // Returns: true
 *
 * const apiError = new Error('API failed');
 * isNetworkError(apiError); // Returns: false
 * ```
 */
export function isNetworkError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('cannot connect') ||
    msg.includes('connect timeout') ||
    msg.includes('network')
  );
}

/**
 * Check if an error is an API-related error
 * @param error - The error to check
 * @returns true if the error is API-related
 *
 * @example
 * ```typescript
 * const error = new Error('API request failed');
 * isApiError(error); // Returns: true
 *
 * const netError = new Error('connection refused');
 * isApiError(netError); // Returns: false
 * ```
 */
export function isApiError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return msg.includes('api') || msg.includes('failed to');
}

/**
 * Check if an error is a configuration error
 * @param error - The error to check
 * @returns true if the error is configuration-related
 *
 * @example
 * ```typescript
 * const error = new Error('config validation failed');
 * isConfigError(error); // Returns: true
 *
 * const netError = new Error('timeout');
 * isConfigError(netError); // Returns: false
 * ```
 */
export function isConfigError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return msg.includes('validation') || msg.includes('invalid');
}

/**
 * Check if an error is a watcher-related error
 * @param error - The error to check
 * @returns true if the error is watcher-related
 *
 * @example
 * ```typescript
 * const error = new Error('watch operation failed');
 * isWatcherError(error); // Returns: true
 *
 * const netError = new Error('timeout');
 * isWatcherError(netError); // Returns: false
 * ```
 */
export function isWatcherError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return msg.includes('watch');
}

/**
 * Calculate the backoff delay for a retry attempt
 * @param attempt - The current attempt number (1-based)
 * @param policy - The retry policy to use
 * @returns The calculated delay in milliseconds, capped at policy.maxDelayMs
 *
 * @example
 * ```typescript
 * const policy = { initialDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 10000 };
 *
 * calculateBackoff(1, policy); // Returns: 1000
 * calculateBackoff(2, policy); // Returns: 2000
 * calculateBackoff(3, policy); // Returns: 4000
 * calculateBackoff(10, policy); // Returns: 10000 (capped)
 * ```
 */
export function calculateBackoff(attempt: number, policy: RetryPolicy): number {
  const delay = policy.initialDelayMs * Math.pow(policy.backoffMultiplier, attempt - 1);
  return Math.min(delay, policy.maxDelayMs);
}
