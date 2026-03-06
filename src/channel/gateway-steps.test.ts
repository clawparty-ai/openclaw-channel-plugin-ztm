// src/channel/gateway-steps.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGatewaySteps } from './gateway-steps.js';
import type { StepContext } from './gateway-pipeline.types.js';

// Mock dependencies
vi.mock('../config/index.js', () => ({
  resolveZTMChatConfig: vi.fn(config => config),
  validateZTMChatConfig: vi.fn(() => ({ valid: true, errors: [] })),
}));

vi.mock('../runtime/state.js', () => ({
  initializeRuntime: vi.fn().mockResolvedValue(true),
  getAllAccountStates: vi.fn().mockReturnValue(new Map()),
}));

vi.mock('./connectivity-manager.js', () => ({
  validateAgentConnectivity: vi.fn().mockResolvedValue(undefined),
  loadOrRequestPermit: vi.fn().mockResolvedValue({ token: 'test-token' }),
  joinMeshIfNeeded: vi.fn().mockResolvedValue(undefined),
  resolveAccountPermitPath: vi.fn().mockReturnValue('/path/to/permit'),
}));

vi.mock('./gateway.js', () => ({
  setupAccountCallbacks: vi.fn().mockResolvedValue({
    messageCallback: vi.fn(),
    cleanupInterval: null,
  }),
}));

vi.mock('./gateway-callbacks.js', () => ({
  setupAccountCallbacks: vi.fn().mockResolvedValue({
    messageCallback: vi.fn(),
    cleanupInterval: null,
  }),
}));

vi.mock('../runtime/store.js', () => ({
  getAccountMessageStateStore: vi.fn().mockReturnValue({
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('GatewaySteps', () => {
  let mockCtx: StepContext;

  beforeEach(() => {
    vi.clearAllMocks();
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

  it('should have correct retry policies', () => {
    const steps = createGatewaySteps(mockCtx);
    expect(steps[0].retryPolicy.maxAttempts).toBe(1); // NO_RETRY
    expect(steps[1].retryPolicy.maxAttempts).toBe(3); // NETWORK
    expect(steps[2].retryPolicy.maxAttempts).toBe(2); // API
    expect(steps[3].retryPolicy.maxAttempts).toBe(3); // NETWORK
    expect(steps[4].retryPolicy.maxAttempts).toBe(2); // API
    expect(steps[5].retryPolicy.maxAttempts).toBe(1); // NO_RETRY
    expect(steps[6].retryPolicy.maxAttempts).toBe(2); // WATCHER
  });
});

describe('Step execution - validate_config', () => {
  it('should execute validate_config step successfully', async () => {
    const mockCtx = {
      account: {
        config: { agentUrl: 'http://localhost:8080', meshName: 'test', username: 'user' },
        accountId: 'test',
      },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as any;

    const steps = createGatewaySteps(mockCtx);
    const step = steps[0]; // validate_config

    // stepCtx needs account property as per gateway-steps.ts line 76
    const stepCtx: any = {
      account: { config: mockCtx.account.config, accountId: 'test' },
    };
    await step.execute(stepCtx);

    expect(stepCtx.config).toBeDefined();
    expect(stepCtx.endpointName).toBe('user-ep');
    expect(stepCtx.permitPath).toBe('/path/to/permit');
  });

  it('should validate config structure', () => {
    const mockCtx = {
      account: {
        config: { agentUrl: 'http://localhost:8080', meshName: 'test', username: 'user' },
        accountId: 'test',
      },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as any;

    const steps = createGatewaySteps(mockCtx);
    expect(steps[0].name).toBe('validate_config');
  });
});

describe('Step execution - validate_connectivity', () => {
  it('should execute validate_connectivity step successfully', async () => {
    const { validateAgentConnectivity } = await import('./connectivity-manager.js');

    const mockCtx = {
      account: {
        config: { agentUrl: 'http://localhost:8080', meshName: 'test', username: 'user' },
        accountId: 'test',
      },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as any;
    const steps = createGatewaySteps(mockCtx);
    const step = steps[1]; // validate_connectivity

    const stepCtx: any = { config: { agentUrl: 'http://localhost:8080' } };
    await step.execute(stepCtx);

    expect(validateAgentConnectivity).toHaveBeenCalled();
  });
});

describe('Step execution - load_permit', () => {
  it('should execute load_permit step successfully', async () => {
    const { loadOrRequestPermit } = await import('./connectivity-manager.js');

    const mockCtx = {
      account: {
        config: { agentUrl: 'http://localhost:8080', meshName: 'test', username: 'user' },
        accountId: 'test',
      },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as any;

    const steps = createGatewaySteps(mockCtx);
    const step = steps[2]; // load_permit

    const stepCtx: any = {
      config: { agentUrl: 'http://localhost:8080' },
      permitPath: '/path/to/permit',
    };
    await step.execute(stepCtx);

    expect(loadOrRequestPermit).toHaveBeenCalled();
    expect(stepCtx.permitData).toEqual({ token: 'test-token' });
  });
});

describe('Step execution - setup_callbacks', () => {
  it('should have setup_callbacks step defined', () => {
    // This step requires complex state setup, testing definition only
    const mockCtx = {
      account: {
        config: { agentUrl: 'http://localhost:8080', meshName: 'test', username: 'user' },
        accountId: 'test',
      },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as any;

    const steps = createGatewaySteps(mockCtx);
    expect(steps[6].name).toBe('setup_callbacks');
    expect(typeof steps[6].execute).toBe('function');
  });
});

// Step 7: Full pipeline integration tests
describe('Full pipeline integration', () => {
  let mockCtx: StepContext;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCtx = {
      account: {
        config: {
          agentUrl: 'http://localhost:8080',
          meshName: 'testmesh',
          username: 'testuser',
        } as any,
        accountId: 'test',
      },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      setStatus: vi.fn(),
    } as any;
  });

  it('should execute full pipeline sequentially', async () => {
    const { getAllAccountStates } = await import('../runtime/state.js');
    const mockAccountStates = new Map();
    mockAccountStates.set('test', {
      lastStartAt: null,
      lastError: null,
    });
    vi.mocked(getAllAccountStates).mockReturnValue(mockAccountStates);

    const steps = createGatewaySteps(mockCtx);
    const stepCtx: any = {
      account: mockCtx.account,
      log: mockCtx.log,
    };

    // Execute all 7 steps sequentially
    for (const step of steps) {
      await step.execute(stepCtx);
    }

    // Verify final state
    expect(stepCtx.config).toBeDefined();
    expect(stepCtx.endpointName).toBe('testuser-ep');
    expect(stepCtx.permitPath).toBe('/path/to/permit');
    expect(stepCtx.permitData).toEqual({ token: 'test-token' });
    expect(stepCtx.state).toBeDefined();
    expect(stepCtx.messageCallback).toBeDefined();
  });

  it('should transfer state between steps', async () => {
    const { getAllAccountStates } = await import('../runtime/state.js');
    const mockAccountStates = new Map();
    mockAccountStates.set('test', {
      lastStartAt: null,
      lastError: null,
    });
    vi.mocked(getAllAccountStates).mockReturnValue(mockAccountStates);

    const steps = createGatewaySteps(mockCtx);
    const stepCtx: any = {
      account: mockCtx.account,
      log: mockCtx.log,
    };

    // Step 1: validate_config
    await steps[0].execute(stepCtx);
    expect(stepCtx.config).toBeDefined();
    expect(stepCtx.endpointName).toBeDefined();

    // Step 2: validate_connectivity
    await steps[1].execute(stepCtx);
    // Should use config from previous step

    // Step 3: load_permit
    await steps[2].execute(stepCtx);
    expect(stepCtx.permitData).toBeDefined();

    // Step 4: join_mesh
    await steps[3].execute(stepCtx);
    // Should use permitData from previous step

    // Step 5: initialize_runtime
    await steps[4].execute(stepCtx);

    // Step 6: preload_message_state
    await steps[5].execute(stepCtx);

    // Step 7: setup_callbacks
    await steps[6].execute(stepCtx);
    expect(stepCtx.messageCallback).toBeDefined();
  });

  it('should handle step failure at validate_config', async () => {
    const { validateZTMChatConfig } = await import('../config/index.js');
    vi.mocked(validateZTMChatConfig).mockReturnValueOnce({
      valid: false,
      errors: [{ field: 'agentUrl', reason: 'required' as any, value: null, message: 'Required' }],
    });

    const steps = createGatewaySteps(mockCtx);
    const stepCtx: any = {
      account: mockCtx.account,
      log: mockCtx.log,
    };

    await expect(steps[0].execute(stepCtx)).rejects.toThrow();
  });

  it('should handle step failure at validate_connectivity', async () => {
    const { validateAgentConnectivity } = await import('./connectivity-manager.js');
    vi.mocked(validateAgentConnectivity).mockRejectedValueOnce(new Error('Connection refused'));

    const steps = createGatewaySteps(mockCtx);
    const stepCtx: any = {
      account: mockCtx.account,
      config: { agentUrl: 'http://localhost:8080' },
      log: mockCtx.log,
    };

    await expect(steps[1].execute(stepCtx)).rejects.toThrow('Connection refused');
  });

  it('should handle step failure at load_permit', async () => {
    const { loadOrRequestPermit } = await import('./connectivity-manager.js');
    vi.mocked(loadOrRequestPermit).mockRejectedValueOnce(new Error('Permit server unavailable'));

    const steps = createGatewaySteps(mockCtx);
    const stepCtx: any = {
      account: mockCtx.account,
      config: { agentUrl: 'http://localhost:8080' },
      permitPath: '/path/to/permit',
      log: mockCtx.log,
    };

    await expect(steps[2].execute(stepCtx)).rejects.toThrow('Permit server unavailable');
  });

  it('should use correct retry policies per step', () => {
    const steps = createGatewaySteps(mockCtx);

    // validate_config: NO_RETRY
    expect(steps[0].retryPolicy.maxAttempts).toBe(1);
    expect(steps[0].retryPolicy.isRetryable(new Error('any'))).toBe(false);

    // validate_connectivity: NETWORK (retryable)
    expect(steps[1].retryPolicy.maxAttempts).toBe(3);

    // load_permit: API (retryable)
    expect(steps[2].retryPolicy.maxAttempts).toBe(2);

    // join_mesh: NETWORK (retryable)
    expect(steps[3].retryPolicy.maxAttempts).toBe(3);

    // initialize_runtime: API (retryable)
    expect(steps[4].retryPolicy.maxAttempts).toBe(2);

    // preload_message_state: NO_RETRY
    expect(steps[5].retryPolicy.maxAttempts).toBe(1);

    // setup_callbacks: WATCHER (retryable)
    expect(steps[6].retryPolicy.maxAttempts).toBe(2);
  });

  it('should maintain step order', () => {
    const steps = createGatewaySteps(mockCtx);
    const expectedOrder = [
      'validate_config',
      'validate_connectivity',
      'load_permit',
      'join_mesh',
      'initialize_runtime',
      'preload_message_state',
      'setup_callbacks',
    ];

    steps.forEach((step, index) => {
      expect(step.name).toBe(expectedOrder[index]);
    });
  });
});
