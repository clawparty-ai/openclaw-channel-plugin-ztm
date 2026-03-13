/**
 * Common request handling utilities for ZTM API Client
 * @module api/request
 * Provides HTTP request functionality with retry logic and timeout handling
 */

import { success, failure, type Result } from '../types/common.js';
import { ZTMApiError, ZTMTimeoutError } from '../types/errors.js';
import { defaultLogger } from '../utils/logger.js';
import { fetchWithRetry, type FetchWithRetry, type RetryOptions } from '../utils/retry.js';
import { API_TIMEOUT_MS } from '../constants.js';

/**
 * Logger interface for dependency injection
 */
export interface ZTMLogger {
  debug?: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

/**
 * Dependencies that can be injected into the API client
 */
export interface ZTMApiClientDeps {
  logger: ZTMLogger;
  fetch: typeof fetch;
  fetchWithRetry: FetchWithRetry;
}

/**
 * Default values for dependencies
 */
export const defaultDeps: ZTMApiClientDeps = {
  logger: defaultLogger as ZTMLogger,
  fetch,
  fetchWithRetry,
};

/**
 * Type alias for ZTM API operations that can fail with ZTMApiError
 */
export type ApiResult<T> = Promise<Result<T, ZTMApiError | ZTMTimeoutError>>;

// Default timeout for API requests (in milliseconds)
export const DEFAULT_TIMEOUT = API_TIMEOUT_MS;

/**
 * Request handler function type
 */
export interface RequestHandler {
  <T>(
    method: string,
    path: string,
    body?: unknown,
    additionalHeaders?: Record<string, string>,
    retryOverrides?: RetryOptions
  ): ApiResult<T>;
}

/**
 * Create a request handler for the ZTM API client
 *
 * Creates a configured request handler with retry logic, timeout handling,
 * and error wrapping for ZTM API operations.
 *
 * @param baseUrl - Base URL for all API requests
 * @param apiTimeout - Timeout in milliseconds for requests
 * @param deps - Injected dependencies (logger, fetch, fetchWithRetry)
 * @returns Configured request handler function
 *
 * @example
 * ```typescript
 * const handler = createRequestHandler('https://ztm.example.com', 5000, defaultDeps);
 * const result = await handler('GET', '/api/meshes/test/apps/ztm/chat/api/chats');
 * if (result.ok) {
 *   console.log('Chats:', result.value);
 * }
 * ```
 *
 * @complexity O(1) - Function creation, async operations depend on network
 * @performance Uses fetchWithRetry for automatic retry on transient failures
 * @since 2026.3.13
 * @see {@link ./ztm-api.ts} ZTM API client implementation
 * @see {@link ../utils/retry.ts#fetchWithRetry} Retry logic implementation
 */
export function createRequestHandler(
  baseUrl: string,
  apiTimeout: number,
  deps: ZTMApiClientDeps
): RequestHandler {
  const { fetchWithRetry: doFetchWithRetry } = deps;

  return async function <T>(
    method: string,
    path: string,
    body?: unknown,
    additionalHeaders?: Record<string, string>,
    retryOverrides?: RetryOptions
  ): ApiResult<T> {
    const url = `${baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...additionalHeaders,
    };

    try {
      const response = await doFetchWithRetry(
        url,
        {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        },
        { timeout: apiTimeout, ...retryOverrides }
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        return failure(
          new ZTMApiError({
            method,
            path,
            statusCode: response.status,
            statusText: response.statusText,
            responseBody: errorText,
          })
        );
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return success((await response.json()) as T);
      }

      const text = await response.text();
      try {
        return success(JSON.parse(text) as unknown as T);
      } catch {
        return success(text as unknown as T);
      }
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      // Check if it's a timeout by looking at the error message or type
      if (cause.name === 'AbortError' || cause.message.includes('timeout')) {
        return failure(
          new ZTMTimeoutError({
            method,
            path,
            timeoutMs: apiTimeout,
            cause,
          })
        );
      }
      return failure(
        new ZTMApiError({
          method,
          path,
          cause,
        })
      );
    }
  };
}
