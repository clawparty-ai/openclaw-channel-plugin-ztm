// src/channel/gateway-steps.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGatewaySteps } from './gateway-steps.js';
import type { StepContext } from './gateway-pipeline.types.js';

describe('GatewaySteps', () => {
  let mockCtx: StepContext;

  beforeEach(() => {
    mockCtx = {
      account: {
        config: { agentUrl: 'http://localhost:8080', meshName: 'test', username: 'user' } as any,
        accountId: 'test',
      },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };
  });

  it('should create 7 steps', () => {
    const steps = createGatewaySteps(mockCtx);
    expect(steps).toHaveLength(7);
  });

  it('should have correct step names', () => {
    const steps = createGatewaySteps(mockCtx);
    expect(steps[0].name).toBe('validate_config');
    expect(steps[1].name).toBe('validate_connectivity');
    expect(steps[2].name).toBe('load_permit');
    expect(steps[3].name).toBe('join_mesh');
    expect(steps[4].name).toBe('initialize_runtime');
    expect(steps[5].name).toBe('preload_message_state');
    expect(steps[6].name).toBe('setup_callbacks');
  });
});
