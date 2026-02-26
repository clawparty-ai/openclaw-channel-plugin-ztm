// src/channel/gateway-retry.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RETRY_POLICIES,
  isNetworkError,
  isApiError,
  isConfigError,
  isWatcherError,
  calculateBackoff,
} from './gateway-retry.js';

describe('RetryPolicies', () => {
  describe('NETWORK', () => {
    it('should retry on ECONNREFUSED', () => {
      const policy = RETRY_POLICIES.NETWORK;
      expect(policy.isRetryable(new Error('ECONNREFUSED'))).toBe(true);
    });

    it('should retry on ETIMEDOUT', () => {
      const policy = RETRY_POLICIES.NETWORK;
      expect(policy.isRetryable(new Error('connect ETIMEDOUT'))).toBe(true);
    });

    it('should not retry on validation error', () => {
      const policy = RETRY_POLICIES.NETWORK;
      expect(policy.isRetryable(new Error('Validation failed'))).toBe(false);
    });
  });

  describe('NO_RETRY', () => {
    it('should never retry', () => {
      const policy = RETRY_POLICIES.NO_RETRY;
      expect(policy.isRetryable(new Error('Any error'))).toBe(false);
    });
  });
});

describe('isNetworkError', () => {
  it('should detect ECONNREFUSED', () => {
    expect(isNetworkError(new Error('ECONNREFUSED'))).toBe(true);
  });

  it('should detect ETIMEDOUT', () => {
    expect(isNetworkError(new Error('ETIMEDOUT'))).toBe(true);
  });

  it('should detect connect timeout', () => {
    expect(isNetworkError(new Error('connect timeout'))).toBe(true);
  });

  it('should detect cannot connect', () => {
    expect(isNetworkError(new Error('cannot connect to server'))).toBe(true);
  });

  it('should detect generic network error', () => {
    expect(isNetworkError(new Error('network error'))).toBe(true);
  });

  it('should be case insensitive', () => {
    expect(isNetworkError(new Error('econnrefused'))).toBe(true);
    expect(isNetworkError(new Error('ETIMEDOUT'))).toBe(true);
  });

  it('should handle empty error message', () => {
    expect(isNetworkError(new Error(''))).toBe(false);
  });

  it('should handle error with context', () => {
    expect(isNetworkError(new Error('Failed to connect: ECONNREFUSED'))).toBe(true);
  });
});

describe('isApiError', () => {
  it('should detect API errors', () => {
    expect(isApiError(new Error('API request failed'))).toBe(true);
    expect(isApiError(new Error('api error'))).toBe(true);
  });

  it('should detect failed errors', () => {
    expect(isApiError(new Error('failed to connect'))).toBe(true);
    expect(isApiError(new Error('failed to process'))).toBe(true);
  });

  it('should be case insensitive', () => {
    expect(isApiError(new Error('API'))).toBe(true);
    expect(isApiError(new Error('api error'))).toBe(true);
  });

  it('should return false for non-API errors', () => {
    expect(isApiError(new Error('network error'))).toBe(false);
    expect(isApiError(new Error('timeout'))).toBe(false);
  });
});

describe('isConfigError', () => {
  it('should detect validation errors', () => {
    expect(isConfigError(new Error('validation failed'))).toBe(true);
    expect(isConfigError(new Error('Invalid configuration'))).toBe(true);
  });

  it('should be case insensitive', () => {
    expect(isConfigError(new Error('VALIDATION error'))).toBe(true);
    expect(isConfigError(new Error('invalid config'))).toBe(true);
  });

  it('should return false for non-config errors', () => {
    expect(isConfigError(new Error('network error'))).toBe(false);
    expect(isConfigError(new Error('api failed'))).toBe(false);
  });
});

describe('isWatcherError', () => {
  it('should detect watcher errors', () => {
    expect(isWatcherError(new Error('watch failed'))).toBe(true);
    expect(isWatcherError(new Error('watcher error'))).toBe(true);
  });

  it('should be case insensitive', () => {
    expect(isWatcherError(new Error('WATCH error'))).toBe(true);
  });

  it('should return false for non-watcher errors', () => {
    expect(isWatcherError(new Error('network error'))).toBe(false);
    expect(isWatcherError(new Error('api failed'))).toBe(false);
  });
});

describe('calculateBackoff', () => {
  it('should calculate exponential backoff correctly', () => {
    const policy = {
      initialDelayMs: 1000,
      backoffMultiplier: 2,
      maxDelayMs: 10000,
      maxAttempts: 3,
      isRetryable: () => true,
    };

    expect(calculateBackoff(1, policy)).toBe(1000); // 1000 * 2^0 = 1000
    expect(calculateBackoff(2, policy)).toBe(2000); // 1000 * 2^1 = 2000
    expect(calculateBackoff(3, policy)).toBe(4000); // 1000 * 2^2 = 4000
  });

  it('should cap delay at maxDelayMs', () => {
    const policy = {
      initialDelayMs: 5000,
      backoffMultiplier: 2,
      maxDelayMs: 10000,
      maxAttempts: 3,
      isRetryable: () => true,
    };

    expect(calculateBackoff(1, policy)).toBe(5000);
    expect(calculateBackoff(2, policy)).toBe(10000); // capped
    expect(calculateBackoff(3, policy)).toBe(10000); // capped
  });

  it('should handle linear backoff (multiplier = 1)', () => {
    const policy = {
      initialDelayMs: 1000,
      backoffMultiplier: 1,
      maxDelayMs: 5000,
      maxAttempts: 3,
      isRetryable: () => true,
    };

    expect(calculateBackoff(1, policy)).toBe(1000);
    expect(calculateBackoff(2, policy)).toBe(1000);
    expect(calculateBackoff(3, policy)).toBe(1000);
  });

  it('should handle attempt = 0', () => {
    const policy = {
      initialDelayMs: 1000,
      backoffMultiplier: 2,
      maxDelayMs: 10000,
      maxAttempts: 3,
      isRetryable: () => true,
    };

    expect(calculateBackoff(0, policy)).toBe(500); // 1000 * 2^(-1) = 500
  });

  it('should handle attempt = -1', () => {
    const policy = {
      initialDelayMs: 1000,
      backoffMultiplier: 2,
      maxDelayMs: 10000,
      maxAttempts: 3,
      isRetryable: () => true,
    };

    expect(calculateBackoff(-1, policy)).toBe(250); // 1000 * 2^(-2) = 250
  });

  it('should handle initialDelayMs = 0', () => {
    const policy = {
      initialDelayMs: 0,
      backoffMultiplier: 2,
      maxDelayMs: 10000,
      maxAttempts: 3,
      isRetryable: () => true,
    };

    expect(calculateBackoff(1, policy)).toBe(0);
    expect(calculateBackoff(2, policy)).toBe(0);
  });
});

describe('RETRY_POLICIES API', () => {
  it('should have all required policies', () => {
    expect(RETRY_POLICIES.NO_RETRY).toBeDefined();
    expect(RETRY_POLICIES.NETWORK).toBeDefined();
    expect(RETRY_POLICIES.API).toBeDefined();
    expect(RETRY_POLICIES.WATCHER).toBeDefined();
  });

  describe('API policy', () => {
    it('should retry on API errors', () => {
      const policy = RETRY_POLICIES.API;
      expect(policy.isRetryable(new Error('API request failed'))).toBe(true);
    });

    it('should retry on failed errors', () => {
      const policy = RETRY_POLICIES.API;
      expect(policy.isRetryable(new Error('failed to connect'))).toBe(true);
    });
  });

  describe('WATCHER policy', () => {
    it('should retry on watcher errors', () => {
      const policy = RETRY_POLICIES.WATCHER;
      expect(policy.isRetryable(new Error('watch failed'))).toBe(true);
    });
  });
});
