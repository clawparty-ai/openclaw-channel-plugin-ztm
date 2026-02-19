// Unit tests for API request handler

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequestHandler, defaultDeps } from './request.js';
import type { ZTMApiClientDeps } from './request.js';
import { ZTMApiError } from '../types/errors.js';
import { API_TIMEOUT_MS } from '../constants.js';

describe('createRequestHandler', () => {
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

  it('should handle non-ok response with error text', async () => {
    mockFetchWithRetry.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: vi.fn().mockResolvedValue('Server error occurred'),
    });

    const deps: ZTMApiClientDeps = {
      ...defaultDeps,
      fetch: mockFetch as ZTMApiClientDeps['fetch'],
      fetchWithRetry: mockFetchWithRetry as ZTMApiClientDeps['fetchWithRetry'],
    };
    const handler = createRequestHandler('http://localhost:7777', API_TIMEOUT_MS, deps);

    const result = await handler('GET', '/api/test');

    expect(result.ok).toBe(false);
    if (!result.ok && result.error) {
      expect(result.error).toBeInstanceOf(ZTMApiError);
      expect(result.error.context.statusCode).toBe(500);
    }
  });

  it('should handle non-ok response with JSON error body', async () => {
    mockFetchWithRetry.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: vi.fn().mockResolvedValue({ error: 'Invalid request' }),
    });

    const deps: ZTMApiClientDeps = {
      ...defaultDeps,
      fetch: mockFetch as ZTMApiClientDeps['fetch'],
      fetchWithRetry: mockFetchWithRetry as ZTMApiClientDeps['fetchWithRetry'],
    };
    const handler = createRequestHandler('http://localhost:7777', API_TIMEOUT_MS, deps);

    const result = await handler('POST', '/api/test', { foo: 'bar' });

    expect(result.ok).toBe(false);
    if (!result.ok && result.error) {
      expect(result.error).toBeInstanceOf(ZTMApiError);
    }
  });

  it('should parse text response when not JSON', async () => {
    mockFetchWithRetry.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: vi.fn().mockResolvedValue('plain text response'),
    });

    const deps: ZTMApiClientDeps = {
      ...defaultDeps,
      fetch: mockFetch as ZTMApiClientDeps['fetch'],
      fetchWithRetry: mockFetchWithRetry as ZTMApiClientDeps['fetchWithRetry'],
    };
    const handler = createRequestHandler('http://localhost:7777', API_TIMEOUT_MS, deps);

    const result = await handler('GET', '/api/text');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('plain text response');
    }
  });

  it('should handle network error', async () => {
    mockFetchWithRetry.mockRejectedValue(new Error('Network request failed'));

    const deps: ZTMApiClientDeps = {
      ...defaultDeps,
      fetch: mockFetch as ZTMApiClientDeps['fetch'],
      fetchWithRetry: mockFetchWithRetry as ZTMApiClientDeps['fetchWithRetry'],
    };
    const handler = createRequestHandler('http://localhost:7777', API_TIMEOUT_MS, deps);

    const result = await handler('GET', '/api/test');

    expect(result.ok).toBe(false);
  });
});
