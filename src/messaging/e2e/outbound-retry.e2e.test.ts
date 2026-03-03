/**
 * E2E Tests for Outbound Retry Logic
 *
 * Tests the retry logic with exponential backoff:
 * - Retry on transient failure
 * - Stop retrying after max attempts
 * - Exponential backoff between retries
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sendZTMMessage } from '../outbound.js';
import { retryAsync, getRetryDelay, isRetryableError } from '../../utils/retry.js';
import {
  testConfigOpenDM,
  testAccountId,
  e2eBeforeEach,
  e2eAfterEach,
  getOrCreateAccountState,
} from '../../test-utils/index.js';
import { isSuccess } from '../../types/common.js';
import { ZTMTimeoutError } from '../../types/errors.js';

describe('E2E: Outbound Retry Logic', () => {
  beforeEach(() => {
    e2eBeforeEach();
  });

  afterEach(async () => {
    await e2eAfterEach();
  });

  describe('Retry on Transient Failure', () => {
    it('should succeed after transient ZTMTimeoutError using retryAsync', async () => {
      let attemptCount = 0;

      const fn = async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new ZTMTimeoutError({ method: 'GET', path: '/test', timeoutMs: 1000 });
        }
        return 'success';
      };

      const result = await retryAsync(fn, { maxRetries: 3, initialDelay: 5 });

      expect(result).toBe('success');
      expect(attemptCount).toBe(3); // Initial + 2 retries
    });

    it('should handle transient timeout errors', async () => {
      let attemptCount = 0;

      const fn = async () => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new ZTMTimeoutError({ method: 'GET', path: '/test', timeoutMs: 100 });
        }
        return 'success';
      };

      const result = await retryAsync(fn, { maxRetries: 3, initialDelay: 5 });

      expect(result).toBe('success');
      expect(attemptCount).toBe(2);
    });
  });

  describe('Stop Retrying After Max Attempts', () => {
    it('should stop retrying after max attempts for timeout errors', async () => {
      let attemptCount = 0;
      const fn = async () => {
        attemptCount++;
        throw new ZTMTimeoutError({ method: 'GET', path: '/test', timeoutMs: 1000 });
      };

      try {
        await retryAsync(fn, { maxRetries: 2, initialDelay: 5 });
      } catch {
        // Expected to fail
      }

      // maxRetries=2 means initial + 2 retries = 3 total attempts
      expect(attemptCount).toBe(3);
    });

    it('should throw after exhausting retries', async () => {
      const fn = async () => {
        throw new ZTMTimeoutError({ method: 'GET', path: '/test', timeoutMs: 1000 });
      };

      await expect(retryAsync(fn, { maxRetries: 1, initialDelay: 5 })).rejects.toThrow();
    });
  });

  describe('Exponential Backoff', () => {
    it('should calculate correct delay values', () => {
      // Initial delay 100, multiplier 2: 100, 200, 400, 800
      expect(
        getRetryDelay(1, {
          maxRetries: 3,
          initialDelay: 100,
          maxDelay: 1000,
          backoffMultiplier: 2,
          timeout: 5000,
        })
      ).toBe(100);
      expect(
        getRetryDelay(2, {
          maxRetries: 3,
          initialDelay: 100,
          maxDelay: 1000,
          backoffMultiplier: 2,
          timeout: 5000,
        })
      ).toBe(200);
      expect(
        getRetryDelay(3, {
          maxRetries: 3,
          initialDelay: 100,
          maxDelay: 1000,
          backoffMultiplier: 2,
          timeout: 5000,
        })
      ).toBe(400);
    });

    it('should cap delay at maxDelay', () => {
      // With maxDelay of 500, even high attempts should be capped
      const config = {
        maxRetries: 10,
        initialDelay: 100,
        maxDelay: 500,
        backoffMultiplier: 2,
        timeout: 5000,
      };
      expect(getRetryDelay(10, config)).toBe(500);
    });

    it('should respect custom backoff multiplier', () => {
      const config = {
        maxRetries: 3,
        initialDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 3,
        timeout: 5000,
      };
      // 100 * 3^0 = 100, 100 * 3^1 = 300, 100 * 3^2 = 900
      expect(getRetryDelay(1, config)).toBe(100);
      expect(getRetryDelay(2, config)).toBe(300);
      expect(getRetryDelay(3, config)).toBe(900);
    });
  });

  describe('Retry with Success on First Attempt', () => {
    it('should not retry when first attempt succeeds', async () => {
      const state = getOrCreateAccountState(testAccountId);

      const mockChatSender = {
        sendPeerMessage: vi.fn().mockResolvedValue({
          ok: true,
          value: true,
        }),
      } as any;

      state.config = testConfigOpenDM;
      state.chatSender = mockChatSender;

      const result = await sendZTMMessage(state, 'alice', 'Test message');

      expect(isSuccess(result)).toBe(true);
      expect(mockChatSender.sendPeerMessage).toHaveBeenCalledTimes(1);
    });

    it('should succeed on first try with retryAsync', async () => {
      let attemptCount = 0;
      const fn = async () => {
        attemptCount++;
        return 'success';
      };

      const result = await retryAsync(fn, { maxRetries: 3, initialDelay: 10 });

      expect(result).toBe('success');
      expect(attemptCount).toBe(1);
    });
  });

  describe('Error Classification', () => {
    it('should identify ZTMTimeoutError as retryable', () => {
      const error = new ZTMTimeoutError({ method: 'GET', path: '/test', timeoutMs: 1000 });
      expect(isRetryableError(error)).toBe(true);
    });

    it('should identify generic timeout errors as retryable', () => {
      const error = new Error('timeout error');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should identify network errors as retryable', () => {
      const error = new Error('network error');
      expect(isRetryableError(error)).toBe(true);
    });
  });
});
