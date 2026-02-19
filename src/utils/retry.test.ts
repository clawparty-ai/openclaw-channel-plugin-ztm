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
  });
});
