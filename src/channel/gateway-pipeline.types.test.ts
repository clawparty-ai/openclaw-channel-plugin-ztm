// src/channel/gateway-pipeline.types.test.ts
import { describe, it, expect } from 'vitest';
import type { RetryPolicy, PipelineStep, StepContext } from './gateway-pipeline.types.js';

describe('GatewayPipeline Types', () => {
  it('should export RetryPolicy interface', () => {
    const policy: RetryPolicy = {
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
      isRetryable: e => true,
    };
    expect(policy.maxAttempts).toBe(3);
  });
});
