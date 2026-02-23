// src/channel/gateway-retry.ts
import type { RetryPolicy } from './gateway-pipeline.types.js';

export const RETRY_POLICIES = {
  NO_RETRY: {
    maxAttempts: 1,
    initialDelayMs: 0,
    maxDelayMs: 0,
    backoffMultiplier: 1,
    isRetryable: (_error: Error) => false,
  },
  NETWORK: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    isRetryable: (error: Error) => isNetworkError(error),
  },
  API: {
    maxAttempts: 2,
    initialDelayMs: 1000,
    maxDelayMs: 2000,
    backoffMultiplier: 1,
    isRetryable: (error: Error) => isApiError(error),
  },
  WATCHER: {
    maxAttempts: 2,
    initialDelayMs: 500,
    maxDelayMs: 1000,
    backoffMultiplier: 1,
    isRetryable: (error: Error) => isWatcherError(error),
  },
} as const;

export function isNetworkError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('cannot connect') ||
    msg.includes('connect timeout') ||
    msg.includes('network')
  );
}

export function isApiError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return msg.includes('api') || msg.includes('failed to');
}

export function isConfigError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return msg.includes('validation') || msg.includes('invalid');
}

export function isWatcherError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return msg.includes('watch');
}

export function calculateBackoff(attempt: number, policy: RetryPolicy): number {
  const delay = policy.initialDelayMs * Math.pow(policy.backoffMultiplier, attempt - 1);
  return Math.min(delay, policy.maxDelayMs);
}
