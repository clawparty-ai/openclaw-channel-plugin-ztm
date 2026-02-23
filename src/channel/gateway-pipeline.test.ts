// src/channel/gateway-pipeline.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GatewayPipeline } from './gateway-pipeline.js';
import type { StepContext, PipelineStep } from './gateway-pipeline.types.js';

describe('GatewayPipeline', () => {
  let mockCtx: StepContext;

  beforeEach(() => {
    mockCtx = {
      account: { config: { agentUrl: 'http://localhost:8080' } as any, accountId: 'test' },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };
  });

  describe('execute', () => {
    it('should execute all steps in order', async () => {
      const calls: string[] = [];
      const steps: PipelineStep[] = [
        {
          name: 'step1',
          execute: vi.fn().mockResolvedValue(undefined),
          retryPolicy: {
            maxAttempts: 1,
            initialDelayMs: 0,
            maxDelayMs: 0,
            backoffMultiplier: 1,
            isRetryable: () => false,
          },
        },
        {
          name: 'step2',
          execute: vi.fn().mockResolvedValue(undefined),
          retryPolicy: {
            maxAttempts: 1,
            initialDelayMs: 0,
            maxDelayMs: 0,
            backoffMultiplier: 1,
            isRetryable: () => false,
          },
        },
      ];

      const pipeline = new GatewayPipeline(mockCtx, steps);
      await pipeline.execute();

      expect(steps[0].execute as any).toHaveBeenCalled();
      expect(steps[1].execute as any).toHaveBeenCalled();
    });

    it('should stop on non-retryable error', async () => {
      const steps: PipelineStep[] = [
        {
          name: 'step1',
          execute: vi.fn().mockRejectedValue(new Error('Config invalid')),
          retryPolicy: {
            maxAttempts: 1,
            initialDelayMs: 0,
            maxDelayMs: 0,
            backoffMultiplier: 1,
            isRetryable: () => false,
          },
        },
      ];

      const pipeline = new GatewayPipeline(mockCtx, steps);

      await expect(pipeline.execute()).rejects.toThrow('Config invalid');
      expect(steps[0].execute as any).toHaveBeenCalledTimes(1);
    });
  });

  describe('createCleanupFunction', () => {
    it('should create cleanup function', async () => {
      const steps: PipelineStep[] = [];
      const pipeline = new GatewayPipeline(mockCtx, steps);
      const cleanup = pipeline.createCleanupFunction();

      expect(cleanup).toBeDefined();
      expect(typeof cleanup).toBe('function');
    });
  });
});
