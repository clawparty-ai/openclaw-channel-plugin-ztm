// Retry utilities for ZTM Chat
// Provides retry logic with exponential backoff for network operations

import { logger } from './logger.js';
import { RETRY_INITIAL_DELAY_MS, RETRY_MAX_DELAY_MS, RETRY_TIMEOUT_MS } from '../constants.js';

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
      const isRetriable = isRetriableError(lastError);
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
 * Check if an error is an authentication/authorization error
 * These errors should NOT be retried as they indicate invalid credentials
 */
function isAuthError(error: Error): boolean {
  const errorMessage = error.message.toLowerCase();
  const errorName = error.name.toLowerCase();

  // Check for auth-related keywords
  const authKeywords = [
    'unauthorized',
    'forbidden',
    'authentication',
    'auth',
    'credential',
    'token',
    'jwt',
    'bearer',
    'api key',
    'apikey',
    'invalid token',
    'expired token',
    'invalid credentials',
    'access denied',
  ];

  return errorName.includes('auth') || authKeywords.some(keyword => errorMessage.includes(keyword));
}

/**
 * Check if an error is retriable
 */
export function isRetriableError(error: Error): boolean {
  const errorMessage = error.message.toLowerCase();
  const errorName = error.name.toLowerCase();

  // Authentication errors should never be retried
  if (isAuthError(error)) {
    return false;
  }

  return (
    errorName.includes('aborterror') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('fetch') ||
    errorMessage.includes('network') ||
    errorMessage.includes('econnrefused') ||
    errorMessage.includes('enotfound') ||
    errorMessage.includes('etimedout') ||
    errorMessage.includes('econnreset')
  );
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
export function withRetry<T extends (...args: unknown[]) => Promise<unknown>>(fn: T, options: RetryOptions = {}): T {
  return (async (...args: Parameters<T>): Promise<unknown> => {
    return retryAsync(() => fn(...args) as Promise<unknown>, options);
  }) as T;
}
