// src/channel/gateway-retry.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RETRY_POLICIES, isNetworkError, isApiError, isConfigError } from './gateway-retry.js';

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
