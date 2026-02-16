// Common request handling utilities for ZTM API Client

import type { ZTMChatConfig } from "../types/config.js";
import type { ZTMApiClient } from "../types/api.js";
import { success, failure, type Result } from "../types/common.js";
import {
  ZTMApiError,
  ZTMTimeoutError,
} from "../types/errors.js";
import { defaultLogger, type Logger } from "../utils/logger.js";
import { fetchWithRetry, type FetchWithRetry, type RetryOptions } from "../utils/retry.js";
import { API_TIMEOUT_MS } from "../constants.js";

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
      "Content-Type": "application/json",
      ...additionalHeaders,
    };

    try {
      const response = await doFetchWithRetry(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      }, { timeout: apiTimeout, ...retryOverrides });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        return failure(new ZTMApiError({
          method,
          path,
          statusCode: response.status,
          statusText: response.statusText,
          responseBody: errorText,
        }));
      }

      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
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
      if (cause.name === "AbortError" || cause.message.includes("timeout")) {
        return failure(new ZTMTimeoutError({
          method,
          path,
          timeoutMs: apiTimeout,
          cause,
        }));
      }
      return failure(new ZTMApiError({
        method,
        path,
        cause,
      }));
    }
  };
}
