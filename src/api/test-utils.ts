// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Test Utilities - Dependency Injection for Easy Testing
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import type { ZTMChatConfig } from '../types/config.js';
import type { ZTMApiClient } from '../types/api.js';
import { createZTMApiClient } from './ztm-api.js';
import { fetchWithRetry } from '../utils/retry.js';

/**
 * Mock logger interface for testing
 */
export interface MockLogger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/**
 * Create a mock logger that tracks all calls
 *
 * @example
 * ```typescript
 * const logger = createMockLogger();
 * logger.info('test', { key: 'value' });
 * console.log(logger.calls);
 * // [{ level: 'info', args: [['test', { key: 'value' }]] }]
 * ```
 */
export function createMockLogger(): MockLogger & {
  calls: { level: string; args: unknown[][] }[];
} {
  const calls: { level: string; args: unknown[][] }[] = [];

  const log =
    (level: string) =>
    (...args: unknown[]) => {
      calls.push({
        level,
        args: args.map(a => (typeof a === 'object' ? JSON.parse(JSON.stringify(a)) : a)),
      });
    };

  return {
    debug: log('debug'),
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
    calls,
  };
}

/**
 * Mock fetch response for testing
 *
 * @example
 * ```typescript
 * const response: MockFetchResponse = {
 *   data: { success: true, chats: [] },
 *   status: 200
 * };
 * ```
 */
export interface MockFetchResponse {
  data: unknown;
  status: number;
}

/**
 * Create a mock fetch function for testing
 *
 * @example
 * ```typescript
 * const { fetch, mockResponse, calls } = createMockFetch();
 * mockResponse({ success: true });
 * const res = await fetch('https://api.example.com/data');
 * console.log(calls);
 * // [{ url: 'https://api.example.com/data', options: {} }]
 * ```
 */
export function createMockFetch(): {
  fetch: typeof fetch;
  mockResponse: (response: unknown, status?: number) => void;
  mockError: (error: Error) => void;
  mockNetworkError: () => void;
  calls: { url: string; options: RequestInit }[];
} {
  const calls: { url: string; options: RequestInit }[] = [];
  let response: unknown = null;
  let error: Error | null = null;
  let status = 200;

  const mockFn = async (url: string, options?: RequestInit): Promise<Response> => {
    calls.push({ url, options: options || {} });

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify(response), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  return {
    fetch: mockFn as typeof fetch,
    mockResponse: (res: unknown, st = 200) => {
      response = res;
      status = st;
      error = null;
    },
    mockError: (err: Error) => {
      error = err;
    },
    mockNetworkError: () => {
      error = new Error('Network error');
    },
    calls,
  };
}

/**
 * Create a mock fetchWithRetry for testing
 * Uses the same underlying mock logic as createMockFetch
 *
 * @example
 * ```typescript
 * const { fetchWithRetry, calls } = createMockFetchWithRetry();
 * // Uses the same mock logic as createMockFetch
 * ```
 */
export function createMockFetchWithRetry(): {
  fetchWithRetry: typeof fetchWithRetry;
  calls: { url: string; options: RequestInit }[];
} {
  const { fetch } = createMockFetch();
  const calls: { url: string; options: RequestInit }[] = [];

  const mockFn: typeof fetchWithRetry = async (
    url: string,
    options?: RequestInit,
    _opts?: { timeout?: number }
  ): Promise<Response> => {
    calls.push({ url, options: options || {} });
    return fetch(url, options);
  };

  return {
    fetchWithRetry: mockFn as typeof fetchWithRetry,
    calls,
  };
}

/**
 * Test dependencies for creating API clients
 */
export interface ZTMApiTestDeps {
  logger: MockLogger;
  fetch: ReturnType<typeof createMockFetch>['fetch'];
  fetchWithRetry: ReturnType<typeof createMockFetchWithRetry>['fetchWithRetry'];
}

/**
 * Create a test client with injected dependencies
 * All dependencies are optional - defaults will be used if not provided
 *
 * @example
 * ```typescript
 * const client = createTestClient({ username: 'test', agentUrl: 'http://localhost:7777' });
 * // Creates a test client with mock logger and fetch
 * ```
 */
export function createTestClient(
  config: ZTMChatConfig,
  deps?: Partial<ZTMApiTestDeps>
): ZTMApiClient {
  // Create mock dependencies only if not provided
  const mockLogger = deps?.logger ?? createMockLogger();
  const mockFetch = deps?.fetch ?? createMockFetch().fetch;
  // Ensure fetchWithRetry uses the same mockFetch for consistency
  const mockFetchWithRetry: typeof fetchWithRetry = async (url, options, _opts) => {
    return mockFetch(url, options);
  };

  return createZTMApiClient(config, {
    logger: mockLogger,
    fetch: mockFetch,
    fetchWithRetry: mockFetchWithRetry,
  });
}
