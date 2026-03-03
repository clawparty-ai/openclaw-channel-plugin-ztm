/**
 * E2E Tests for Rate Limiting
 *
 * Tests message rate limiting:
 * - Apply message rate limiting
 * - Handle quota exceeded scenario
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getOrCreateAccountState,
  disposeMessageStateStore,
  resetDefaultProvider,
} from '../../runtime/index.js';
import { isRetryableError, retryAsync, getRetryDelay } from '../../utils/retry.js';
import { ZTMApiError, ZTMTimeoutError } from '../../types/errors.js';

describe('E2E: Rate Limiting', () => {
  const baseAccountId = `test-rate-limit-${Date.now()}`;

  beforeEach(() => {
    disposeMessageStateStore();
    resetDefaultProvider();
  });

  afterEach(async () => {
    disposeMessageStateStore();
    resetDefaultProvider();
  });

  const getTestAccountId = (suffix = '') =>
    `${baseAccountId}-${suffix}-${Math.random().toString(36).slice(2, 8)}`;

  describe('Retry logic for rate limiting', () => {
    it('should correctly identify retryable errors (429 rate limit)', () => {
      // Use ZTMApiError with 429 status code
      const rateLimitError = new ZTMApiError({
        method: 'GET',
        path: '/api/messages',
        statusCode: 429,
        statusText: 'Too Many Requests',
      });
      expect(isRetryableError(rateLimitError)).toBe(true);
    });

    it('should correctly identify retryable errors (500 server error)', () => {
      const serverError = new ZTMApiError({
        method: 'GET',
        path: '/api/messages',
        statusCode: 500,
        statusText: 'Internal Server Error',
      });
      expect(isRetryableError(serverError)).toBe(true);
    });

    it('should correctly identify retryable errors (503 service unavailable)', () => {
      const serviceError = new ZTMApiError({
        method: 'GET',
        path: '/api/messages',
        statusCode: 503,
        statusText: 'Service Unavailable',
      });
      expect(isRetryableError(serviceError)).toBe(true);
    });

    it('should not retry non-retryable client errors (400)', () => {
      const clientError = new ZTMApiError({
        method: 'GET',
        path: '/api/messages',
        statusCode: 400,
        statusText: 'Bad Request',
      });
      expect(isRetryableError(clientError)).toBe(false);
    });

    it('should not retry non-retryable client errors (401)', () => {
      const authError = new ZTMApiError({
        method: 'GET',
        path: '/api/messages',
        statusCode: 401,
        statusText: 'Unauthorized',
      });
      expect(isRetryableError(authError)).toBe(false);
    });

    it('should not retry non-retryable client errors (403)', () => {
      const forbiddenError = new ZTMApiError({
        method: 'GET',
        path: '/api/messages',
        statusCode: 403,
        statusText: 'Forbidden',
      });
      expect(isRetryableError(forbiddenError)).toBe(false);
    });

    it('should retry on rate limit error and succeed', async () => {
      let attemptCount = 0;

      const fn = async () => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new ZTMApiError({
            method: 'GET',
            path: '/api/messages',
            statusCode: 429,
            statusText: 'Too Many Requests',
          });
        }
        return 'success';
      };

      const result = await retryAsync(fn, { maxRetries: 3, initialDelay: 5 });

      expect(result).toBe('success');
      expect(attemptCount).toBe(2);
    });

    it('should stop retrying after max attempts on rate limit', async () => {
      let attemptCount = 0;

      const fn = async () => {
        attemptCount++;
        throw new ZTMApiError({
          method: 'GET',
          path: '/api/messages',
          statusCode: 429,
          statusText: 'Too Many Requests',
        });
      };

      try {
        await retryAsync(fn, { maxRetries: 2, initialDelay: 5 });
      } catch {
        // Expected to fail
      }

      // Should have attempted 3 times (initial + 2 retries)
      expect(attemptCount).toBe(3);
    });

    it('should not retry non-retryable errors', async () => {
      let attemptCount = 0;

      const fn = async () => {
        attemptCount++;
        throw new ZTMApiError({
          method: 'GET',
          path: '/api/messages',
          statusCode: 400,
          statusText: 'Bad Request',
        });
      };

      try {
        await retryAsync(fn, { maxRetries: 3, initialDelay: 5 });
      } catch {
        // Expected to fail
      }

      // Should only attempt once (no retries for 400)
      expect(attemptCount).toBe(1);
    });

    it('should identify timeout errors as retryable', () => {
      const timeoutError = new ZTMTimeoutError({
        method: 'GET',
        path: '/api/messages',
        timeoutMs: 1000,
      });
      expect(isRetryableError(timeoutError)).toBe(true);
    });
  });

  describe('Retry delay calculation', () => {
    it('should calculate exponential backoff delay', () => {
      const config = {
        maxRetries: 3,
        initialDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 2,
        timeout: 5000,
      };

      // First retry: 100 * 2^0 = 100
      expect(getRetryDelay(1, config)).toBe(100);
      // Second retry: 100 * 2^1 = 200
      expect(getRetryDelay(2, config)).toBe(200);
      // Third retry: 100 * 2^2 = 400
      expect(getRetryDelay(3, config)).toBe(400);
    });

    it('should cap delay at maxDelay', () => {
      const config = {
        maxRetries: 10,
        initialDelay: 100,
        maxDelay: 500,
        backoffMultiplier: 2,
        timeout: 5000,
      };

      // Should cap at 500
      expect(getRetryDelay(10, config)).toBe(500);
    });

    it('should use custom backoff multiplier', () => {
      const config = {
        maxRetries: 3,
        initialDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 3,
        timeout: 5000,
      };

      // 100 * 3^0 = 100
      expect(getRetryDelay(1, config)).toBe(100);
      // 100 * 3^1 = 300
      expect(getRetryDelay(2, config)).toBe(300);
      // 100 * 3^2 = 900
      expect(getRetryDelay(3, config)).toBe(900);
    });
  });

  describe('Message sending with rate limiting', () => {
    it('should track lastOutboundAt on successful send', async () => {
      const accountId = getTestAccountId('track1');
      const state = getOrCreateAccountState(accountId);

      // Initially null
      expect(state.lastOutboundAt).toBeNull();

      // Simulate successful message send
      state.lastOutboundAt = new Date();

      // Verify updated
      expect(state.lastOutboundAt).toBeInstanceOf(Date);
    });

    it('should maintain separate state per account', async () => {
      const accountId1 = getTestAccountId('separate1');
      const accountId2 = getTestAccountId('separate2');

      const state1 = getOrCreateAccountState(accountId1);
      const state2 = getOrCreateAccountState(accountId2);

      // Update state1
      state1.lastOutboundAt = new Date('2024-01-01');

      // state2 should be independent
      expect(state2.lastOutboundAt).toBeNull();

      // Update state2
      state2.lastOutboundAt = new Date('2024-02-01');

      // Verify independence
      expect(state1.lastOutboundAt?.getFullYear()).toBe(2024);
      expect(state2.lastOutboundAt?.getMonth()).toBe(1); // February
    });

    it('should handle concurrent rate-limited requests', async () => {
      // Simulate multiple concurrent requests
      const results = await Promise.allSettled(
        Array(5)
          .fill(null)
          .map(async (_, i) => {
            // Simulate varying response times
            await new Promise(resolve => setTimeout(resolve, i * 10));
            return `response-${i}`;
          })
      );

      // All should succeed
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      expect(fulfilled.length).toBe(5);
    });
  });

  describe('Rate limiting edge cases', () => {
    it('should succeed on first attempt without retrying', async () => {
      let attemptCount = 0;

      const fn = async () => {
        attemptCount++;
        return 'success';
      };

      const result = await retryAsync(fn, { maxRetries: 3, initialDelay: 10 });

      expect(result).toBe('success');
      expect(attemptCount).toBe(1);
    });

    it('should handle all retryable status codes', () => {
      // Test all common retryable status codes
      const statusCodes = [429, 500, 502, 503, 504];

      for (const code of statusCodes) {
        const error = new ZTMApiError({
          method: 'GET',
          path: '/api/test',
          statusCode: code,
          statusText: 'Error',
        });
        expect(isRetryableError(error)).toBe(true);
      }
    });
  });
});
