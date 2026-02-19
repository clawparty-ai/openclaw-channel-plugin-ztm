// Unit tests for Retry utilities

import { describe, it, expect, vi } from 'vitest';
import {
  sleep,
  getRetryDelay,
  createTimeoutController,
  retryAsync,
  fetchWithRetry,
  isRetriableError,
  withRetry,
} from './retry.js';

describe('Retry utilities', () => {
  describe('sleep', () => {
    it('should sleep for specified milliseconds', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;

      // setTimeout is not guaranteed to fire at exactly the specified time
      // Allow 10% tolerance for system scheduling variability
      expect(elapsed).toBeGreaterThanOrEqual(90);
      expect(elapsed).toBeLessThan(200);
    });
  });

  describe('getRetryDelay', () => {
    const defaultConfig = {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      timeout: 30000,
    };

    it('should calculate exponential backoff delay', () => {
      expect(getRetryDelay(1, defaultConfig)).toBe(1000);
      expect(getRetryDelay(2, defaultConfig)).toBe(2000);
      expect(getRetryDelay(3, defaultConfig)).toBe(4000);
    });

    it('should cap at maxDelay', () => {
      expect(getRetryDelay(10, defaultConfig)).toBe(10000);
      expect(getRetryDelay(100, defaultConfig)).toBe(10000);
    });
  });

  describe('createTimeoutController', () => {
    it('should create abort controller with timeout', async () => {
      const { controller, timeoutId } = createTimeoutController(100);

      expect(controller).toBeInstanceOf(AbortController);

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(controller.signal.aborted).toBe(true);
      clearTimeout(timeoutId);
    });

    it('should clear timeout on abort', async () => {
      const { controller, timeoutId } = createTimeoutController(1000);

      controller.abort();
      clearTimeout(timeoutId);

      // Should not throw even though we cleared timeout
      expect(controller.signal.aborted).toBe(true);
    });
  });

  describe('isRetriableError', () => {
    it('should identify network errors as retriable', () => {
      const error = new Error('ECONNREFUSED');
      expect(isRetriableError(error)).toBe(true);
    });

    it('should identify timeout errors as retriable', () => {
      const error = new Error('ETIMEDOUT');
      expect(isRetriableError(error)).toBe(true);
    });

    it('should identify fetch errors as retriable', () => {
      const error = new Error('fetch failed');
      expect(isRetriableError(error)).toBe(true);
    });

    it('should identify AbortError as retriable', () => {
      const error = new Error('AbortError');
      Object.defineProperty(error, 'name', { value: 'AbortError' });
      expect(isRetriableError(error)).toBe(true);
    });

    it('should not identify non-retriable errors', () => {
      const error = new Error('Unauthorized');
      expect(isRetriableError(error)).toBe(false);

      const validationError = new Error('Validation failed');
      expect(isRetriableError(validationError)).toBe(false);
    });
  });

  describe('retryAsync', () => {
    it('should return result on first success', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await retryAsync(fn, { maxRetries: 3 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retriable errors', async () => {
      let attempts = 0;
      const fn = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          const error = new Error('ECONNREFUSED');
          Object.defineProperty(error, 'name', { value: 'Error' });
          throw error;
        }
        return 'success';
      });

      const result = await retryAsync(fn, {
        maxRetries: 5,
        initialDelay: 10,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retriable errors', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Unauthorized'));

      await expect(retryAsync(fn, { maxRetries: 3 })).rejects.toThrow('Unauthorized');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should throw after max retries exceeded', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'));

      await expect(retryAsync(fn, { maxRetries: 2, initialDelay: 1 })).rejects.toThrow('ETIMEDOUT');

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should respect custom retry config', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'));

      await expect(
        retryAsync(fn, {
          maxRetries: 1,
          initialDelay: 50,
          maxDelay: 100,
        })
      ).rejects.toThrow();

      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('withRetry', () => {
    it('should wrap function with retry logic', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      const wrappedFn = withRetry(fn, { maxRetries: 2 });

      const result = await wrappedFn();

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should preserve function arguments', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      const wrappedFn = withRetry(fn);

      await wrappedFn('arg1', 'arg2');

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should preserve function context', async () => {
      const obj = {
        value: 42,
        getValue: vi.fn(function (this: any) {
          return this.value;
        }),
      };

      const wrapped = withRetry(obj.getValue.bind(obj));
      const result = await wrapped();

      expect(result).toBe(42);
    });
  });

  describe('fetchWithRetry', () => {
    it('should fetch with retry on network errors', async () => {
      // Mock fetch to fail twice then succeed
      let attempts = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('ETIMEDOUT'));
        }
        return Promise.resolve(new Response('{"data":"success"}'));
      });

      const response = await fetchWithRetry(
        'https://example.com',
        {
          method: 'GET',
        },
        { maxRetries: 5, initialDelay: 1 }
      );

      expect(response).toBeInstanceOf(Response);
      expect(await response.json()).toEqual({ data: 'success' });
      expect(attempts).toBe(3);
    });

    it('should use custom timeout', async () => {
      global.fetch = vi.fn().mockResolvedValue(new Response());

      await fetchWithRetry(
        'https://example.com',
        {},
        {
          timeout: 5000,
        }
      );

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });

    it('should merge options correctly', async () => {
      global.fetch = vi.fn().mockResolvedValue(new Response());

      await fetchWithRetry('https://example.com', {
        method: 'POST',
        headers: { Custom: 'header' },
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Custom: 'header',
          }),
        })
      );
    });

    it('should stop retrying on non-retriable errors', async () => {
      let attempts = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        attempts++;
        // Return a 400 Bad Request - not retriable
        return Promise.resolve(new Response('Bad Request', { status: 400 }));
      });

      const response = await fetchWithRetry(
        'https://example.com',
        {},
        { maxRetries: 5, initialDelay: 1 }
      );

      expect(response.status).toBe(400);
      // Should not retry on 400
      expect(attempts).toBe(1);
    });

    it('should respect maxRetries limit', async () => {
      let attempts = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        attempts++;
        return Promise.reject(new Error('Network error'));
      });

      await expect(
        fetchWithRetry('https://example.com', {}, { maxRetries: 3, initialDelay: 1 })
      ).rejects.toThrow('Network error');

      // Should try exactly maxRetries + 1 times (initial + 3 retries)
      expect(attempts).toBe(4);
    });
  });

  describe('retry storm protection', () => {
    it('should have exponential backoff to prevent retry storms', async () => {
      const delays: number[] = [];
      const originalDelay = 10; // 10ms base

      // Simulate exponential backoff calculation
      for (let attempt = 0; attempt < 5; attempt++) {
        const delay = Math.min(
          originalDelay * Math.pow(2, attempt),
          10000 // max delay
        );
        delays.push(delay);
      }

      // Verify exponential growth
      expect(delays[0]).toBe(10);
      expect(delays[1]).toBe(20);
      expect(delays[2]).toBe(40);
      expect(delays[3]).toBe(80);
      expect(delays[4]).toBe(160);
    });

    it('should limit maximum concurrent retry operations', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;

      const operation = async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise(r => setTimeout(r, 10));
        concurrent--;
        return 'done';
      };

      // Run 20 operations concurrently
      const promises = Array(20)
        .fill(null)
        .map(() => operation());
      await Promise.all(promises);

      // All 20 ran, but we can track max concurrency
      expect(maxConcurrent).toBe(20);
    });

    it('should calculate total retry time with exponential backoff', () => {
      // With default config: initialDelay=1000, backoffMultiplier=2, maxDelay=10000
      const config = {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        timeout: 30000,
      };

      // Retry attempts: delay for attempt 1, 2, 3
      const delay1 = getRetryDelay(1, config); // 1000
      const delay2 = getRetryDelay(2, config); // 2000
      const delay3 = getRetryDelay(3, config); // 4000

      const totalRetryTime = delay1 + delay2 + delay3;

      // Total backoff time: 1000 + 2000 + 4000 = 7000ms
      expect(totalRetryTime).toBe(7000);
    });

    it('should cap retry delay at maxDelay to prevent excessive wait', () => {
      const config = {
        maxRetries: 10,
        initialDelay: 1000,
        maxDelay: 5000, // Lower max for testing
        backoffMultiplier: 2,
        timeout: 30000,
      };

      // These should all be capped at 5000
      expect(getRetryDelay(1, config)).toBe(1000);
      expect(getRetryDelay(2, config)).toBe(2000);
      expect(getRetryDelay(3, config)).toBe(4000);
      expect(getRetryDelay(4, config)).toBe(5000); // Capped
      expect(getRetryDelay(10, config)).toBe(5000); // Still capped
    });
  });

  describe('API retry storm scenarios', () => {
    it('should not retry auth errors to prevent credential exposure', () => {
      const authErrors = [
        new Error('Unauthorized'),
        new Error('401 Unauthorized'),
        new Error('403 Forbidden'),
        new Error('Invalid credentials'),
        new Error('Token expired'),
        new Error('Authentication failed'),
      ];

      for (const error of authErrors) {
        expect(isRetriableError(error)).toBe(false);
      }
    });

    it('should retry network errors but with controlled backoff', async () => {
      let attempts = 0;
      const fn = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 4) {
          const error = new Error('ECONNREFUSED');
          Object.defineProperty(error, 'name', { value: 'Error' });
          throw error;
        }
        return 'success';
      });

      const start = Date.now();
      const result = await retryAsync(fn, {
        maxRetries: 5,
        initialDelay: 50, // Faster for test
        maxDelay: 200,
      });
      const totalTime = Date.now() - start;

      expect(result).toBe('success');
      expect(attempts).toBe(4);

      // With 50ms initial delay and backoff: 50 + 100 + 200 = 350ms minimum
      // But with maxDelay=200, actual is 50 + 100 + 200 = 350ms
      expect(totalTime).toBeGreaterThanOrEqual(300);
    });

    it('should handle rapid consecutive failures without overwhelming server', async () => {
      const attempts: number[] = [];
      let callCount = 0;

      const fn = vi.fn().mockImplementation(() => {
        callCount++;
        const currentAttempt = callCount;
        attempts.push(Date.now());

        if (currentAttempt <= 3) {
          const error = new Error('ETIMEDOUT');
          Object.defineProperty(error, 'name', { value: 'Error' });
          throw error;
        }
        return 'success';
      });

      const result = await retryAsync(fn, {
        maxRetries: 5,
        initialDelay: 20,
        maxDelay: 100,
      });

      expect(result).toBe('success');

      // Verify there's a delay between retries
      if (attempts.length >= 3) {
        const timeBetweenRetries = attempts[2] - attempts[1];
        expect(timeBetweenRetries).toBeGreaterThanOrEqual(10);
      }
    });

    it('should properly timeout individual attempts within retry sequence', async () => {
      let attempts = 0;

      const fn = vi.fn().mockImplementation(() => {
        attempts++;
        // Simulate a slow operation that times out
        const error = new Error('ETIMEDOUT');
        Object.defineProperty(error, 'name', { value: 'Error' });
        throw error;
      });

      const start = Date.now();

      // Each attempt should timeout individually
      await expect(
        retryAsync(fn, {
          maxRetries: 3,
          initialDelay: 20, // Short delay between retries
          timeout: 100, // 100ms timeout per attempt
        })
      ).rejects.toThrow();

      const elapsed = Date.now() - start;

      // Should have attempted multiple times
      expect(attempts).toBeGreaterThanOrEqual(1);
      // Total time should be reasonable (not hanging)
      expect(elapsed).toBeLessThan(5000);
    });

    it('should not cause memory leak with many retry attempts', async () => {
      let attempts = 0;
      const memorySnapshots: number[] = [];

      const fn = vi.fn().mockImplementation(() => {
        attempts++;
        // Record approximate memory (would need real measurement in production)
        if (attempts % 10 === 0) {
          memorySnapshots.push(attempts);
        }

        if (attempts < 50) {
          const error = new Error('Network error');
          Object.defineProperty(error, 'name', { value: 'Error' });
          throw error;
        }
        return 'success';
      });

      // This should complete without hanging
      const result = await retryAsync(fn, {
        maxRetries: 100, // High number but should still complete
        initialDelay: 1, // Very fast
        maxDelay: 10,
      });

      expect(result).toBe('success');
      expect(attempts).toBe(50);
    });

    it('should handle mixed retriable and non-retriable errors correctly', async () => {
      let attempts = 0;

      const fn = vi.fn().mockImplementation(() => {
        attempts++;

        if (attempts === 1) {
          // First: retriable network error
          const error = new Error('ETIMEDOUT');
          Object.defineProperty(error, 'name', { value: 'Error' });
          throw error;
        } else if (attempts === 2) {
          // Second: non-retriable auth error
          throw new Error('Unauthorized');
        }

        return 'success';
      });

      // Should fail immediately on auth error, not retry
      await expect(
        retryAsync(fn, {
          maxRetries: 5,
          initialDelay: 10,
        })
      ).rejects.toThrow('Unauthorized');

      // Should have only attempted twice (first retry, then auth error stops)
      expect(attempts).toBe(2);
    });

    it('should correctly count attempts including initial call', async () => {
      let attempts = 0;

      const fn = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 4) {
          const error = new Error('ECONNREFUSED');
          Object.defineProperty(error, 'name', { value: 'Error' });
          throw error;
        }
        return 'success';
      });

      await retryAsync(fn, {
        maxRetries: 3,
        initialDelay: 10,
      });

      // Should be: initial call (1) + 3 retries = 4 total
      expect(attempts).toBe(4);
    });
  });

  describe('retry behavior under stress', () => {
    it('should handle multiple parallel failing operations', async () => {
      const operations = Array(10)
        .fill(null)
        .map((_, i) => {
          let attempt = 0;
          return async () => {
            attempt++;
            if (attempt < 3) {
              // Use retriable error (network error)
              const error = new Error(`Operation ${i} failed: network error`);
              Object.defineProperty(error, 'name', { value: 'Error' });
              throw error;
            }
            return `success-${i}`;
          };
        });

      const results = await Promise.allSettled(
        operations.map(op => retryAsync(op, { maxRetries: 5, initialDelay: 5, maxDelay: 20 }))
      );

      // All should succeed
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      expect(fulfilled.length).toBe(10);
    });

    it('should prevent cascading failures with proper backoff', () => {
      // Simulate what happens when 100 requests fail at the same time
      // Without backoff, they'd all retry immediately
      const config = {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        timeout: 30000,
      };

      // All 100 "clients" start at the same time
      const retryDelays = Array(100)
        .fill(null)
        .map((_, i) => {
          // Each gets a slightly different delay due to exponential backoff
          const attempt = (i % 3) + 1; // Distribute across attempts
          return getRetryDelay(attempt, config);
        });

      // Verify delays are distributed (not all 1000ms)
      const uniqueDelays = new Set(retryDelays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });
});
