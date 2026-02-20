// Unit tests for Polling Configuration Edge Cases

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startPollingWatcher } from './polling.js';
import { testConfig, testAccountId } from '../test-utils/fixtures.js';
import { mockSuccess } from '../test-utils/mocks.js';
import type { AccountRuntimeState, MessageCallback } from '../types/runtime.js';
import type { ZTMApiClient } from '../types/api.js';
import type { MessagingContext } from './context.js';

// Helper to create a mock MessagingContext
function createMockMessagingContext(): MessagingContext {
  return {
    messageStateRepo: {
      getFileMetadata: vi.fn(() => ({})),
      setFileMetadataBulk: vi.fn(),
      getWatermark: vi.fn(() => 0),
      setWatermark: vi.fn(),
      flush: vi.fn(),
    },
    allowFromRepo: {
      getAllowFrom: vi.fn(() => Promise.resolve([])),
      clearCache: vi.fn(),
    },
  };
}

type ExtendedConfig = typeof testConfig & { pollingInterval?: number; [key: string]: unknown };

let createdIntervals: ReturnType<typeof setInterval>[] = [];
const originalSetInterval = global.setInterval;

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  defaultLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../runtime/index.js', () => ({
  getZTMRuntime: () => ({
    channel: {
      pairing: {
        readAllowFromStore: vi.fn(() => Promise.resolve([])),
      },
    },
  }),
}));

vi.mock('./processor.js', () => ({
  processIncomingMessage: vi.fn(() => null),
}));
vi.mock('./dispatcher.js', () => ({
  notifyMessageCallbacks: vi.fn(),
}));
vi.mock('../core/dm-policy.js', () => ({
  checkDmPolicy: vi.fn(() => ({ allowed: true, reason: 'allowed', action: 'process' })),
}));

vi.mock('../connectivity/permit.js', () => ({
  handlePairingRequest: vi.fn(() => Promise.resolve()),
}));

describe('Configuration Edge Cases', () => {
  const baseConfig = { ...testConfig, allowFrom: [] as string[], dmPolicy: 'pairing' as const };

  let mockState: ReturnType<typeof createMockState>;

  function createMockState(): AccountRuntimeState {
    return {
      accountId: testAccountId,
      config: baseConfig,
      apiClient: {
        getChats: mockSuccess([]),
      } as unknown as ZTMApiClient,
          lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
        messageCallbacks: new Set<MessageCallback>(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    createdIntervals = [];

    global.setInterval = vi.fn((callback: () => void, ms: number) => {
      const ref = originalSetInterval(callback, ms);
      createdIntervals.push(ref);
      return ref;
    }) as unknown as typeof setInterval;

    mockState = createMockState();
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const interval of createdIntervals) {
      clearInterval(interval);
    }
    createdIntervals = [];
    global.setInterval = originalSetInterval;
  });

  it('should handle undefined pollingInterval', async () => {
    mockState.config = { ...baseConfig };

    const mockContext = createMockMessagingContext();
    await startPollingWatcher(mockState, mockContext);

    expect(global.setInterval).toHaveBeenCalledWith(expect.any(Function), 2000);
  });

  it('should handle zero pollingInterval', async () => {
    mockState.config = { ...baseConfig, pollingInterval: 0 } as ExtendedConfig;

    const mockContext = createMockMessagingContext();
    await startPollingWatcher(mockState, mockContext);

    expect(global.setInterval).toHaveBeenCalledWith(expect.any(Function), 1000);
  });

  it('should handle negative pollingInterval', async () => {
    mockState.config = { ...baseConfig, pollingInterval: -1000 } as ExtendedConfig;

    const mockContext = createMockMessagingContext();
    await startPollingWatcher(mockState, mockContext);

    expect(global.setInterval).toHaveBeenCalledWith(expect.any(Function), 1000);
  });

  it('should handle very large pollingInterval', async () => {
    mockState.config = { ...baseConfig, pollingInterval: 60000 } as ExtendedConfig;

    const mockContext = createMockMessagingContext();
    await startPollingWatcher(mockState, mockContext);

    expect(global.setInterval).toHaveBeenCalledWith(expect.any(Function), 60000);
  });
});
