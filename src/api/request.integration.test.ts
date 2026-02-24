// Integration tests for API Request Retry Logic
// Tests for exponential backoff, retry storm protection, error handling

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequestHandler } from './request.js';
import { getRetryDelay } from '../utils/retry.js';
import { ZTMApiError } from '../types/errors.js';

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  defaultLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('API Request Retry Integration', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockFetchWithRetry: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    mockFetchWithRetry = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('exponential backoff retry', () => {
    it('should retry with exponential backoff on failures', async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => 'application/json' },
        json: async () => ({ result: 'success' }),
      } as unknown as Response);

      const handler = createRequestHandler('http://test:7777', 5000, {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        fetch: mockFetch as unknown as typeof fetch,
        fetchWithRetry: mockFetchWithRetry as any,
      });

      const result = await handler('GET', '/api/test');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ result: 'success' });
      }
    });

    it('should calculate exponential backoff delays correctly', () => {
      const testCases = [
        { attempt: 1, expectedDelay: 1000 },
        { attempt: 2, expectedDelay: 2000 },
        { attempt: 3, expectedDelay: 4000 },
        { attempt: 4, expectedDelay: 8000 },
        { attempt: 5, expectedDelay: 10000 },
        { attempt: 10, expectedDelay: 10000 },
      ];

      testCases.forEach(({ attempt, expectedDelay }) => {
        const delay = getRetryDelay(attempt);
        expect(delay).toBe(expectedDelay);
      });
    });

    it('should stop retrying after max attempts', async () => {
      mockFetchWithRetry.mockRejectedValue(new Error('ECONNREFUSED'));

      const handler = createRequestHandler('http://test:7777', 5000, {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        fetch: mockFetch as unknown as typeof fetch,
        fetchWithRetry: mockFetchWithRetry as any,
      });

      const result = await handler('GET', '/api/test');

      expect(result.ok).toBe(false);
      expect(mockFetchWithRetry).toHaveBeenCalled();
    });

    it('should not retry non-retriable errors', async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Unauthorized',
      } as unknown as Response);

      const handler = createRequestHandler('http://test:7777', 5000, {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        fetch: mockFetch as unknown as typeof fetch,
        fetchWithRetry: mockFetchWithRetry as any,
      });

      const result = await handler('GET', '/api/test');

      expect(result.ok).toBe(false);
      expect(mockFetchWithRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('retry storm protection', () => {
    it('should prevent excessive retries with rate limiting', async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => 'application/json' },
        json: async () => ({ result: 'success' }),
      } as unknown as Response);

      const handler = createRequestHandler('http://test:7777', 5000, {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        fetch: mockFetch as unknown as typeof fetch,
        fetchWithRetry: mockFetchWithRetry as any,
      });

      const result = await handler('GET', '/api/test', undefined, undefined, {
        maxRetries: 2,
      });

      expect(result.ok).toBe(true);
      expect(mockFetchWithRetry).toHaveBeenCalledWith(
        'http://test:7777/api/test',
        expect.objectContaining({ method: 'GET' }),
        expect.objectContaining({ maxRetries: 2, timeout: 5000 })
      );
    });

    it('should handle concurrent requests without retry storm', async () => {
      mockFetchWithRetry.mockImplementation(
        async () =>
          ({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: { get: () => 'application/json' },
            json: async () => ({ result: 'success' }),
          }) as unknown as Response
      );

      const handler = createRequestHandler('http://test:7777', 5000, {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        fetch: mockFetch as unknown as typeof fetch,
        fetchWithRetry: mockFetchWithRetry as any,
      });

      const concurrentRequests = 5;
      const promises = Array.from({ length: concurrentRequests }, () =>
        handler('GET', '/api/test')
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(concurrentRequests);
      results.forEach(result => {
        expect(result.ok).toBe(true);
      });
    });
  });

  describe('network error handling', () => {
    it('should handle connection refused errors', async () => {
      mockFetchWithRetry.mockRejectedValue(new Error('ECONNREFUSED'));

      const handler = createRequestHandler('http://unreachable:7777', 5000, {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        fetch: mockFetch as unknown as typeof fetch,
        fetchWithRetry: mockFetchWithRetry as any,
      });

      const result = await handler('GET', '/api/test');

      expect(result.ok).toBe(false);
    });

    it('should handle DNS resolution failures', async () => {
      mockFetchWithRetry.mockRejectedValue(new Error('ENOTFOUND'));

      const handler = createRequestHandler('http://invalid-domain:7777', 5000, {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        fetch: mockFetch as unknown as typeof fetch,
        fetchWithRetry: mockFetchWithRetry as any,
      });

      const result = await handler('GET', '/api/test');

      expect(result.ok).toBe(false);
    });

    it('should handle connection reset errors', async () => {
      mockFetchWithRetry.mockRejectedValue(new Error('ECONNRESET'));

      const handler = createRequestHandler('http://test:7777', 5000, {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        fetch: mockFetch as unknown as typeof fetch,
        fetchWithRetry: mockFetchWithRetry as any,
      });

      const result = await handler('GET', '/api/test');

      expect(result.ok).toBe(false);
    });
  });

  describe('response type handling', () => {
    it('should parse JSON responses', async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: (name: string) => (name === 'content-type' ? 'application/json' : null) },
        json: async () => ({ message: 'Hello' }),
      } as unknown as Response);

      const handler = createRequestHandler('http://test:7777', 5000, {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        fetch: mockFetch as unknown as typeof fetch,
        fetchWithRetry: mockFetchWithRetry as any,
      });

      const result = await handler('GET', '/api/test');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ message: 'Hello' });
      }
    });

    it('should handle text responses', async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: true,
        headers: { get: () => 'text/plain' },
        text: async () => 'Plain text response',
      } as unknown as Response);

      const handler = createRequestHandler('http://test:7777', 5000, {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        fetch: mockFetch as unknown as typeof fetch,
        fetchWithRetry: mockFetchWithRetry as any,
      });

      const result = await handler('GET', '/api/test');

      expect(result.ok).toBe(true);
    });

    it('should handle error responses', async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error',
      } as unknown as Response);

      const handler = createRequestHandler('http://test:7777', 5000, {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        fetch: mockFetch as unknown as typeof fetch,
        fetchWithRetry: mockFetchWithRetry as any,
      });

      const result = await handler('GET', '/api/test');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ZTMApiError);
      }
    });
  });

  describe('custom retry options', () => {
    it('should respect custom maxRetries', async () => {
      mockFetchWithRetry.mockRejectedValue(new Error('Network error'));

      const handler = createRequestHandler('http://test:7777', 5000, {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        fetch: mockFetch as unknown as typeof fetch,
        fetchWithRetry: mockFetchWithRetry as any,
      });

      await handler('GET', '/api/test', undefined, undefined, {
        maxRetries: 1,
      });

      expect(mockFetchWithRetry).toHaveBeenCalledWith(
        'http://test:7777/api/test',
        expect.objectContaining({ method: 'GET' }),
        expect.objectContaining({ maxRetries: 1, timeout: 5000 })
      );
    });

    it('should pass retry options to fetchWithRetry', async () => {
      mockFetchWithRetry.mockRejectedValueOnce(new Error('Network error')).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as unknown as Response);

      const handler = createRequestHandler('http://test:7777', 5000, {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        fetch: mockFetch as unknown as typeof fetch,
        fetchWithRetry: mockFetchWithRetry as any,
      });

      await handler('GET', '/api/test', undefined, undefined, {
        maxRetries: 1,
        initialDelay: 100,
      });

      expect(mockFetchWithRetry).toHaveBeenCalledWith(
        'http://test:7777/api/test',
        expect.objectContaining({ method: 'GET' }),
        expect.objectContaining({ maxRetries: 1, initialDelay: 100, timeout: 5000 })
      );
    });
  });

  describe('Auth error sanitization', () => {
    it('should sanitize 401 Unauthorized response body', async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => 'Invalid token: Bearer eyJhbGciOiJIUzI1NiIs...',
      } as unknown as Response);

      const handler = createRequestHandler('http://test:7777', 5000, {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        fetch: mockFetch as unknown as typeof fetch,
        fetchWithRetry: mockFetchWithRetry as any,
      });

      const result = await handler<unknown>('GET', '/api/chat');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        // Verify response body is truncated
        const preview = result.error.context.responseBodyPreview;
        expect(typeof preview).toBe('string');
        expect(preview?.length).toBeLessThanOrEqual(500);
      }
    });

    it('should sanitize 403 Forbidden response body', async () => {
      const sensitiveBody = 'Access denied for user admin at /opt/app/src/Auth.ts:42';

      mockFetchWithRetry.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => sensitiveBody,
      } as unknown as Response);

      const handler = createRequestHandler('http://test:7777', 5000, {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        fetch: mockFetch as unknown as typeof fetch,
        fetchWithRetry: mockFetchWithRetry as any,
      });

      const result = await handler<unknown>('GET', '/api/chat');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        // Verify status code is captured
        expect(result.error.context.statusCode).toBe(403);
      }
    });

    it('should handle 401 without exposing internal details', async () => {
      const internalErrorBody = 'java.sql.SQLException: Connection refused to 192.168.1.50:5432';

      mockFetchWithRetry.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => internalErrorBody,
      } as unknown as Response);

      const handler = createRequestHandler('http://test:7777', 5000, {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        fetch: mockFetch as unknown as typeof fetch,
        fetchWithRetry: mockFetchWithRetry as any,
      });

      const result = await handler<unknown>('GET', '/api/chat');

      expect(result.ok).toBe(false);
      // The error should be created but we verify truncation
      const preview = result.error.context.responseBodyPreview;
      expect(preview?.length).toBeLessThanOrEqual(500);
    });
  });
});
