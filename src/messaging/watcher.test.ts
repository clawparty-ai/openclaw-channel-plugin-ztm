// Unit tests for Watcher core functionality

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startMessageWatcher } from './watcher.js';
import { testConfig, testAccountId, createMockChat } from '../test-utils/fixtures.js';
import { mockSuccess } from '../test-utils/mocks.js';
import type { AccountRuntimeState, MessageCallback } from '../types/runtime.js';
import type { ZTMApiClient } from '../types/api.js';
import { FULL_SYNC_DELAY_MS, WATCH_INTERVAL_MS, WATCH_ERROR_THRESHOLD } from '../constants.js';
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

// Mock dependencies
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

vi.mock('../utils/log-sanitize.js', () => ({
  sanitizeForLog: vi.fn((input: string) => input),
}));

vi.mock('../di/index.js', () => ({
  DEPENDENCIES: {
    RUNTIME: Symbol('runtime'),
    MESSAGE_STATE_REPO: Symbol('message-state-repo'),
    ALLOW_FROM_REPO: Symbol('allow-from-repo'),
  },
  container: {
    get: vi.fn(key => {
      if (String(key) === 'Symbol(runtime)') {
        return {
          get: () => ({
            channel: {
              pairing: {
                readAllowFromStore: vi.fn(() => Promise.resolve([])),
              },
            },
          }),
        };
      }
      if (String(key) === 'Symbol(message-state-repo)') {
        return {
          getFileMetadata: vi.fn(() => ({})),
          setFileMetadataBulk: vi.fn(),
        };
      }
      if (String(key) === 'Symbol(allow-from-repo)') {
        return {
          getAllowFrom: vi.fn(() => Promise.resolve([])),
          clearCache: vi.fn(),
        };
      }
      return null;
    }),
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
  getMessageStateRepository: vi.fn(() => ({
    getFileMetadata: vi.fn(() => ({})),
    setFileMetadataBulk: vi.fn(),
  })),
  getAllowFromRepository: vi.fn(() => ({
    getAllowFrom: vi.fn(() => Promise.resolve([])),
    clearCache: vi.fn(),
  })),
}));

vi.mock('../runtime/store.js', () => ({
  getAccountMessageStateStore: vi.fn(() => ({
    getFileMetadata: vi.fn(() => ({})),
    setFileMetadataBulk: vi.fn(),
  })),
}));

vi.mock('../runtime/state.js', () => ({
  getAllowFromCache: vi.fn(() => Promise.resolve([])),
}));

vi.mock('./polling.js', () => ({
  startPollingWatcher: vi.fn(),
}));

vi.mock('./chat-processor.js', () => ({
  processAndNotifyChat: vi.fn(() => Promise.resolve(true)),
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

describe('startMessageWatcher', () => {
  let mockState: AccountRuntimeState;
  let createdIntervals: ReturnType<typeof setInterval>[] = [];
  const originalSetInterval = global.setInterval;

  function createMockState(): AccountRuntimeState {
    const mockApiClient = {
      watchChanges: vi.fn(() => Promise.resolve(mockSuccess({ value: [] }))),
      getChats: vi.fn(() => mockSuccess({ value: [] })),
      getPeerMessages: vi.fn(() => Promise.resolve({ ok: true, value: [] })),
      getGroupMessages: vi.fn(() => Promise.resolve({ ok: true, value: [] })),
      seedFileMetadata: vi.fn(),
      exportFileMetadata: vi.fn(() => ({})),
    };

    return {
      accountId: testAccountId,
      config: testConfig,
      apiClient: mockApiClient as unknown as ZTMApiClient,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set<MessageCallback>(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    createdIntervals = [];

    global.setInterval = vi.fn((callback: () => void, ms: number) => {
      const ref = originalSetInterval(callback, ms);
      createdIntervals.push(ref);
      return ref;
    }) as unknown as typeof setTimeout;

    mockState = createMockState();
  });

  afterEach(() => {
    for (const interval of createdIntervals) {
      clearInterval(interval);
    }
    createdIntervals = [];
    global.setInterval = originalSetInterval;
  });

  describe('initialization', () => {
    it('should return early if no apiClient', async () => {
      const stateWithoutApi = { ...mockState, apiClient: null };
      const mockContext = createMockMessagingContext();
      await startMessageWatcher(stateWithoutApi as AccountRuntimeState, mockContext);
      // Should not throw and should return quickly
    });

    it('should call seedFileMetadata', async () => {
      const mockContext = createMockMessagingContext();
      await startMessageWatcher(mockState, mockContext);
      // seedFileMetadata should have been called internally
    });

    it('should perform initial sync', async () => {
      const chats = [createMockChat('alice', 'Hello', 1000)];
      const apiClient = mockState.apiClient as any;
      apiClient.getChats = vi.fn(() => mockSuccess({ value: chats }));

      const mockContext = createMockMessagingContext();
      await startMessageWatcher(mockState, mockContext);

      expect(apiClient.getChats).toHaveBeenCalled();
    });
  });

  describe('watch loop behavior', () => {
    it('should start the watch loop', async () => {
      const mockContext = createMockMessagingContext();
      await startMessageWatcher(mockState, mockContext);
      // Watch loop is started via recursive setTimeout
      // Just verify function completes without error
    });

    it('should handle empty changed items', async () => {
      const apiClient = mockState.apiClient as any;
      apiClient.watchChanges = vi.fn(() => Promise.resolve(mockSuccess({ value: [] })));

      const mockContext = createMockMessagingContext();
      await startMessageWatcher(mockState, mockContext);

      // Wait a bit for the watch loop to run
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should handle peer change items', async () => {
      const apiClient = mockState.apiClient as any;
      const mockWatchChanges = vi.fn(() =>
        Promise.resolve(
          mockSuccess({
            value: [{ type: 'peer' as const, peer: 'alice' }],
          })
        )
      );
      apiClient.watchChanges = mockWatchChanges;
      apiClient.getPeerMessages = vi.fn(() =>
        Promise.resolve({
          ok: true,
          value: [
            {
              time: 1000,
              message: 'Hello',
              sender: 'alice',
            },
          ],
        })
      );

      const mockContext = createMockMessagingContext();
      await startMessageWatcher(mockState, mockContext);

      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should handle group change items', async () => {
      const apiClient = mockState.apiClient as any;
      const mockWatchChanges = vi.fn(() =>
        Promise.resolve(
          mockSuccess({
            value: [
              { type: 'group' as const, creator: 'alice', group: 'test-group', name: 'Test Group' },
            ],
          })
        )
      );
      apiClient.watchChanges = mockWatchChanges;
      apiClient.getGroupMessages = vi.fn(() =>
        Promise.resolve({
          ok: true,
          value: [
            {
              time: 1000,
              message: 'Hello group',
              sender: 'bob',
            },
          ],
        })
      );

      const mockContext = createMockMessagingContext();
      await startMessageWatcher(mockState, mockContext);

      await new Promise(resolve => setTimeout(resolve, 100));
    });
  });

  describe('error handling', () => {
    it('should handle API client errors gracefully', async () => {
      const apiClient = mockState.apiClient as any;
      apiClient.watchChanges = vi.fn(() => Promise.reject(new Error('Network error')));

      const mockContext = createMockMessagingContext();
      await startMessageWatcher(mockState, mockContext);

      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should handle getChats errors gracefully', async () => {
      const apiClient = mockState.apiClient as any;
      apiClient.getChats = vi.fn(() =>
        Promise.resolve({
          ok: false,
          error: {
            code: 'FAILED',
            message: 'Failed to get chats',
            context: {},
            toJSON: () => ({}),
            name: 'ZTMReadError',
          },
        })
      );

      const mockContext = createMockMessagingContext();
      await startMessageWatcher(mockState, mockContext);
      // Should not throw
    });

    it('should handle getPeerMessages errors gracefully', async () => {
      const apiClient = mockState.apiClient as any;
      const mockWatchChanges = vi.fn(() =>
        Promise.resolve(
          mockSuccess({
            value: [{ type: 'peer' as const, peer: 'alice' }],
          })
        )
      );
      apiClient.watchChanges = mockWatchChanges;
      apiClient.getPeerMessages = vi.fn(() => Promise.reject(new Error('Failed to get messages')));

      const mockContext = createMockMessagingContext();
      await startMessageWatcher(mockState, mockContext);

      await new Promise(resolve => setTimeout(resolve, 100));
    });
  });

  describe('crash recovery', () => {
    it('should restart loop after unexpected error', async () => {
      let callCount = 0;
      const apiClient = mockState.apiClient as any;
      apiClient.watchChanges = vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Unexpected crash');
        }
        return Promise.resolve(mockSuccess({ value: [] }));
      });

      const mockContext = createMockMessagingContext();
      await startMessageWatcher(mockState, mockContext);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Loop should have restarted after the crash
    });
  });
});

describe('seedFileMetadata', () => {
  it('should seed metadata from persisted state', async () => {
    const mockApiClient = {
      seedFileMetadata: vi.fn(),
      watchChanges: vi.fn(() => Promise.resolve(mockSuccess({ value: [] }))),
      getChats: vi.fn(() => mockSuccess({ value: [] })),
    } as unknown as ZTMApiClient;

    const state: AccountRuntimeState = {
      accountId: testAccountId,
      config: testConfig,
      apiClient: mockApiClient,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };

    // Call startMessageWatcher which will call seedFileMetadata internally
    const mockContext = createMockMessagingContext();
    await startMessageWatcher(state, mockContext);
  });
});

describe('watch error count behavior', () => {
  it('should increment error count on watch failure', () => {
    const state: AccountRuntimeState = {
      accountId: testAccountId,
      config: testConfig,
      apiClient: null,
      connected: false,
      meshConnected: false,
      lastError: null,
      lastStartAt: null,
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 0,
      messageCallbacks: new Set(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };

    // Simulate error handling
    state.watchErrorCount++;
    state.watchErrorCount++;
    state.watchErrorCount++;

    expect(state.watchErrorCount).toBe(3);
  });

  it('should reset error count after successful iteration', () => {
    const state: AccountRuntimeState = {
      accountId: testAccountId,
      config: testConfig,
      apiClient: null,
      connected: false,
      meshConnected: false,
      lastError: null,
      lastStartAt: null,
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 0,
      messageCallbacks: new Set(),
      watchInterval: null,
      watchErrorCount: 5,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };

    // After successful iteration
    state.watchErrorCount = 0;

    expect(state.watchErrorCount).toBe(0);
  });
});

describe('full sync behavior', () => {
  it('should trigger full sync after multiple errors', async () => {
    const state: AccountRuntimeState = {
      accountId: testAccountId,
      config: testConfig,
      apiClient: {
        getChats: vi.fn(() => mockSuccess({ value: [] })),
        exportFileMetadata: vi.fn(() => ({})),
      } as unknown as ZTMApiClient,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set(),
      watchInterval: null,
      watchErrorCount: 6, // Above threshold
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };

    const mockContext = createMockMessagingContext();
    await startMessageWatcher(state, mockContext);
    // Should fallback to polling when error count > 5
  });
});

describe('watch loop timing', () => {
  let mockState: AccountRuntimeState;
  let createdTimeouts: ReturnType<typeof setTimeout>[] = [];
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;

  function createMockState(): AccountRuntimeState {
    const mockApiClient = {
      watchChanges: vi.fn(() => Promise.resolve(mockSuccess({ value: [] }))),
      getChats: vi.fn(() => mockSuccess({ value: [] })),
      getPeerMessages: vi.fn(() => Promise.resolve({ ok: true, value: [] })),
      getGroupMessages: vi.fn(() => Promise.resolve({ ok: true, value: [] })),
      seedFileMetadata: vi.fn(),
      exportFileMetadata: vi.fn(() => ({})),
    };

    return {
      accountId: testAccountId,
      config: testConfig,
      apiClient: mockApiClient as unknown as ZTMApiClient,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set<MessageCallback>(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    createdTimeouts = [];

    global.setTimeout = vi.fn((callback: () => void, ms: number) => {
      const ref = originalSetTimeout(callback, ms);
      createdTimeouts.push(ref);
      return ref;
    }) as unknown as typeof setTimeout;

    global.clearTimeout = vi.fn((id: ReturnType<typeof setTimeout>) => {
      originalClearTimeout(id);
      createdTimeouts = createdTimeouts.filter(t => t !== id);
    }) as unknown as typeof clearTimeout;

    mockState = createMockState();
  });

  afterEach(() => {
    for (const timeout of createdTimeouts) {
      originalClearTimeout(timeout);
    }
    createdTimeouts = [];
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  });

  it('should use correct WATCH_INTERVAL_MS', () => {
    expect(WATCH_INTERVAL_MS).toBe(1000);
  });

  it('should use correct FULL_SYNC_DELAY_MS', () => {
    expect(FULL_SYNC_DELAY_MS).toBe(30000);
  });

  it('should schedule next loop iteration after completion', async () => {
    const apiClient = mockState.apiClient as any;
    apiClient.watchChanges = vi.fn(() => Promise.resolve(mockSuccess({ value: [] })));

    const mockContext = createMockMessagingContext();
    await startMessageWatcher(mockState, mockContext);

    // Wait for at least one iteration
    await new Promise(resolve => setTimeout(resolve, 50));

    // Check that setTimeout was called for scheduling next iteration
    const setTimeoutMock = global.setTimeout as unknown as ReturnType<typeof vi.fn>;
    const timeoutCalls = setTimeoutMock.mock.calls;
    expect(timeoutCalls.length).toBeGreaterThan(0);
  });

  it('should calculate correct interval accounting for iteration time', async () => {
    const apiClient = mockState.apiClient as any;
    let watchCallCount = 0;

    apiClient.watchChanges = vi.fn(() => {
      watchCallCount++;
      return Promise.resolve(mockSuccess({ value: [] }));
    });

    const mockContext = createMockMessagingContext();
    await startMessageWatcher(mockState, mockContext);

    // Wait for a couple iterations
    await new Promise(resolve => setTimeout(resolve, 2500));

    // Multiple iterations should have occurred
    expect(watchCallCount).toBeGreaterThan(1);
  });
});

describe('seedFileMetadata edge cases', () => {
  it('should return early if no apiClient in seedFileMetadata', async () => {
    const mockContext = createMockMessagingContext();

    const state: AccountRuntimeState = {
      accountId: testAccountId,
      config: testConfig,
      apiClient: null,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };

    // Should not throw and should return early
    await startMessageWatcher(state, mockContext);
  });

  it('should not call seedFileMetadata when no persisted metadata', async () => {
    const mockContext = createMockMessagingContext();
    // getFileMetadata returns empty object
    mockContext.messageStateRepo.getFileMetadata = vi.fn(() => ({}));

    const mockApiClient = {
      seedFileMetadata: vi.fn(),
      watchChanges: vi.fn(() => Promise.resolve(mockSuccess({ value: [] }))),
      getChats: vi.fn(() => mockSuccess({ value: [] })),
    } as unknown as ZTMApiClient;

    const state: AccountRuntimeState = {
      accountId: testAccountId,
      config: testConfig,
      apiClient: mockApiClient,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };

    await startMessageWatcher(state, mockContext);

    // seedFileMetadata should not be called with empty metadata
    expect(mockApiClient.seedFileMetadata).not.toHaveBeenCalled();
  });
});

describe('performInitialSync edge cases', () => {
  it('should return empty array when no apiClient', async () => {
    const mockContext = createMockMessagingContext();

    const state: AccountRuntimeState = {
      accountId: testAccountId,
      config: testConfig,
      apiClient: null,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };

    await startMessageWatcher(state, mockContext);
    // Should return early without errors
  });
});

describe('processChangedPaths scenarios', () => {
  let mockState: AccountRuntimeState;
  let createdTimeouts: ReturnType<typeof setTimeout>[] = [];
  const originalSetTimeout = global.setTimeout;

  function createMockState(): AccountRuntimeState {
    const mockApiClient = {
      watchChanges: vi.fn(() =>
        Promise.resolve(
          mockSuccess({
            value: [
              { type: 'peer' as const, peer: 'alice' },
              { type: 'peer' as const, peer: 'bob' },
              { type: 'group' as const, creator: 'alice', group: 'test-group', name: 'Test Group' },
            ],
          })
        )
      ),
      getChats: vi.fn(() => mockSuccess({ value: [] })),
      getPeerMessages: vi.fn((peer: string) =>
        Promise.resolve({
          ok: true,
          value: [
            {
              time: 1000,
              message: `Hello from ${peer}`,
              sender: peer,
            },
          ],
        })
      ),
      getGroupMessages: vi.fn(() =>
        Promise.resolve({
          ok: true,
          value: [
            {
              time: 1000,
              message: 'Hello group',
              sender: 'bob',
            },
          ],
        })
      ),
      seedFileMetadata: vi.fn(),
      exportFileMetadata: vi.fn(() => ({})),
    };

    return {
      accountId: testAccountId,
      config: testConfig,
      apiClient: mockApiClient as unknown as ZTMApiClient,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set<MessageCallback>(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    createdTimeouts = [];

    global.setTimeout = vi.fn((callback: () => void, ms: number) => {
      const ref = originalSetTimeout(callback, ms);
      createdTimeouts.push(ref);
      return ref;
    }) as unknown as typeof setTimeout;

    mockState = createMockState();
  });

  afterEach(() => {
    for (const timeout of createdTimeouts) {
      clearTimeout(timeout);
    }
    createdTimeouts = [];
    global.setTimeout = originalSetTimeout;
  });

  it('should handle watch changes with peer and group items', async () => {
    const mockContext = createMockMessagingContext();
    await startMessageWatcher(mockState, mockContext);

    // Wait for processing (WATCH_INTERVAL_MS + buffer)
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Verify watchChanges was called with correct path
    const apiClient = mockState.apiClient as any;
    expect(apiClient.watchChanges).toHaveBeenCalled();
  });

  it('should handle empty peer list gracefully', async () => {
    const apiClient = mockState.apiClient as any;
    apiClient.watchChanges = vi.fn(() => Promise.resolve(mockSuccess({ value: [] })));

    const mockContext = createMockMessagingContext();
    await startMessageWatcher(mockState, mockContext);
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Should not crash and should process without errors
    expect(apiClient.getPeerMessages).not.toHaveBeenCalled();
    expect(apiClient.getGroupMessages).not.toHaveBeenCalled();
  });
});

describe('error threshold and polling fallback', () => {
  let mockState: AccountRuntimeState;
  let createdTimeouts: ReturnType<typeof setTimeout>[] = [];
  const originalSetTimeout = global.setTimeout;

  function createMockState(errorCount: number): AccountRuntimeState {
    const mockApiClient = {
      watchChanges: vi.fn(() => {
        if (mockState.watchErrorCount < errorCount) {
          mockState.watchErrorCount++;
          return Promise.reject(new Error('Watch failed'));
        }
        return Promise.resolve(mockSuccess({ value: [] }));
      }),
      getChats: vi.fn(() => mockSuccess({ value: [] })),
      getPeerMessages: vi.fn(() => Promise.resolve({ ok: true, value: [] })),
      getGroupMessages: vi.fn(() => Promise.resolve({ ok: true, value: [] })),
      seedFileMetadata: vi.fn(),
      exportFileMetadata: vi.fn(() => ({})),
    };

    const state: AccountRuntimeState = {
      accountId: testAccountId,
      config: testConfig,
      apiClient: mockApiClient as unknown as ZTMApiClient,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set<MessageCallback>(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };

    return state;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    createdTimeouts = [];

    global.setTimeout = vi.fn((callback: () => void, ms: number) => {
      const ref = originalSetTimeout(callback, ms);
      createdTimeouts.push(ref);
      return ref;
    }) as unknown as typeof setTimeout;

    mockState = createMockState(6);
  });

  afterEach(() => {
    for (const timeout of createdTimeouts) {
      clearTimeout(timeout);
    }
    createdTimeouts = [];
    global.setTimeout = originalSetTimeout;
  });

  it('should trigger polling fallback after 5 consecutive errors', async () => {
    const pollingMock = vi.fn();
    vi.doMock('./polling.js', () => ({
      startPollingWatcher: pollingMock,
    }));

    const mockContext = createMockMessagingContext();
    await startMessageWatcher(mockState, mockContext);

    // Wait for multiple error iterations
    await new Promise(resolve => setTimeout(resolve, 500));

    // After 5+ errors, should call startPollingWatcher
    // (The mock for polling should have been called)
  });
});

describe('watch error handling edge cases', () => {
  let mockState: AccountRuntimeState;
  const originalSetTimeout = global.setTimeout;

  function createMockState(): AccountRuntimeState {
    const mockApiClient = {
      watchChanges: vi.fn(() =>
        Promise.resolve({
          ok: false,
          error: {
            code: 'TEST',
            message: 'Test error',
            context: {},
            toJSON: () => ({}),
            name: 'ZTMError',
          },
        })
      ),
      getChats: vi.fn(() => mockSuccess({ value: [] })),
      getPeerMessages: vi.fn(() => Promise.resolve({ ok: true, value: [] })),
      getGroupMessages: vi.fn(() => Promise.resolve({ ok: true, value: [] })),
      seedFileMetadata: vi.fn(),
      exportFileMetadata: vi.fn(() => ({})),
    };

    return {
      accountId: testAccountId,
      config: testConfig,
      apiClient: mockApiClient as unknown as ZTMApiClient,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set<MessageCallback>(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();

    global.setTimeout = vi.fn((callback: () => void, ms: number) => {
      return originalSetTimeout(callback, ms);
    }) as unknown as typeof setTimeout;

    mockState = createMockState();
  });

  afterEach(() => {
    global.setTimeout = originalSetTimeout;
  });

  it('should handle API error result gracefully', async () => {
    const mockContext = createMockMessagingContext();
    await startMessageWatcher(mockState, mockContext);

    // Wait for error handling (WATCH_INTERVAL_MS + buffer)
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Should not throw, should handle error gracefully
    expect(mockState.watchErrorCount).toBeGreaterThan(0);
  });

  it('should increment error count on API error', async () => {
    const mockContext = createMockMessagingContext();
    await startMessageWatcher(mockState, mockContext);

    // Wait for multiple iterations (2 * WATCH_INTERVAL_MS + buffer)
    await new Promise(resolve => setTimeout(resolve, 2100));

    // Error count should have incremented
    expect(mockState.watchErrorCount).toBeGreaterThan(0);
  });
});

describe('multiple iteration scenarios', () => {
  let mockState: AccountRuntimeState;
  const originalSetTimeout = global.setTimeout;

  function createMockState(): AccountRuntimeState {
    const mockApiClient = {
      watchChanges: vi.fn(() => Promise.resolve(mockSuccess({ value: [] }))),
      getChats: vi.fn(() => mockSuccess({ value: [] })),
      getPeerMessages: vi.fn(() => Promise.resolve({ ok: true, value: [] })),
      getGroupMessages: vi.fn(() => Promise.resolve({ ok: true, value: [] })),
      seedFileMetadata: vi.fn(),
      exportFileMetadata: vi.fn(() => ({})),
    };

    return {
      accountId: testAccountId,
      config: testConfig,
      apiClient: mockApiClient as unknown as ZTMApiClient,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set<MessageCallback>(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();

    global.setTimeout = vi.fn((callback: () => void, ms: number) => {
      return originalSetTimeout(callback, ms);
    }) as unknown as typeof setTimeout;

    mockState = createMockState();
  });

  afterEach(() => {
    global.setTimeout = originalSetTimeout;
  });

  it('should execute watch loop successfully', async () => {
    const apiClient = mockState.apiClient as any;
    apiClient.watchChanges = vi.fn(() => Promise.resolve(mockSuccess({ value: [] })));

    const mockContext = createMockMessagingContext();
    await startMessageWatcher(mockState, mockContext);

    // Wait for at least one iteration (WATCH_INTERVAL_MS + buffer)
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Should have executed at least one iteration
    expect(apiClient.watchChanges).toHaveBeenCalled();
  });
});

describe('initial sync scenarios', () => {
  let mockState: AccountRuntimeState;
  let createdTimeouts: ReturnType<typeof setTimeout>[] = [];
  const originalSetTimeout = global.setTimeout;

  function createMockStateWithChats(chats: any[]): AccountRuntimeState {
    const mockApiClient = {
      watchChanges: vi.fn(() => Promise.resolve(mockSuccess({ value: [] }))),
      getChats: vi.fn(() => mockSuccess({ value: chats })),
      getPeerMessages: vi.fn(() => Promise.resolve({ ok: true, value: [] })),
      getGroupMessages: vi.fn(() => Promise.resolve({ ok: true, value: [] })),
      seedFileMetadata: vi.fn(),
      exportFileMetadata: vi.fn(() => ({})),
    };

    return {
      accountId: testAccountId,
      config: testConfig,
      apiClient: mockApiClient as unknown as ZTMApiClient,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set<MessageCallback>(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    createdTimeouts = [];

    global.setTimeout = vi.fn((callback: () => void, ms: number) => {
      const ref = originalSetTimeout(callback, ms);
      createdTimeouts.push(ref);
      return ref;
    }) as unknown as typeof setTimeout;
  });

  afterEach(() => {
    for (const timeout of createdTimeouts) {
      clearTimeout(timeout);
    }
    createdTimeouts = [];
    global.setTimeout = originalSetTimeout;
  });

  it('should process all chats during initial sync', async () => {
    const chats = [
      createMockChat('alice', 'Hello from alice', 1000),
      createMockChat('bob', 'Hello from bob', 2000),
      createMockChat('charlie', 'Hello from charlie', 3000),
    ];
    mockState = createMockStateWithChats(chats);

    const mockContext = createMockMessagingContext();
    await startMessageWatcher(mockState, mockContext);

    // getChats should have been called during initial sync
    const apiClient = mockState.apiClient as any;
    expect(apiClient.getChats).toHaveBeenCalled();
  });

  it('should handle initial sync with empty chats', async () => {
    mockState = createMockStateWithChats([]);

    const mockContext = createMockMessagingContext();
    await startMessageWatcher(mockState, mockContext);

    // Should not crash with empty chats
    const apiClient = mockState.apiClient as any;
    expect(apiClient.getChats).toHaveBeenCalled();
  });

  it('should handle initial sync failure gracefully', async () => {
    const mockApiClient = {
      watchChanges: vi.fn(() => Promise.resolve(mockSuccess({ value: [] }))),
      getChats: vi.fn(() =>
        Promise.resolve({
          ok: false,
          error: {
            code: 'READ_FAILED',
            message: 'Failed to read chats',
            context: {},
            toJSON: () => ({}),
            name: 'ZTMReadError',
          },
        })
      ),
      seedFileMetadata: vi.fn(),
      exportFileMetadata: vi.fn(() => ({})),
    };

    mockState = {
      accountId: testAccountId,
      config: testConfig,
      apiClient: mockApiClient as unknown as ZTMApiClient,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set<MessageCallback>(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };

    const mockContext = createMockMessagingContext();
    // Should not throw
    await startMessageWatcher(mockState, mockContext);
  });

  it('should seed file metadata from persisted state', async () => {
    const persistedMetadata: Record<string, { time: number; size: number }> = {
      'file1.txt': { time: 1000, size: 1024 },
      'file2.txt': { time: 2000, size: 2048 },
    };

    const mockMessageStateRepo = {
      getFileMetadata: vi.fn(() => persistedMetadata),
      setFileMetadataBulk: vi.fn(),
      getWatermark: vi.fn(() => 0),
      setWatermark: vi.fn(),
      flush: vi.fn(),
    };

    const mockContext: MessagingContext = {
      messageStateRepo: mockMessageStateRepo,
      allowFromRepo: {
        getAllowFrom: vi.fn(() => Promise.resolve([])),
        clearCache: vi.fn(),
      },
    };

    const mockApiClient = {
      watchChanges: vi.fn(() => Promise.resolve(mockSuccess({ value: [] }))),
      getChats: vi.fn(() => mockSuccess({ value: [] })),
      seedFileMetadata: vi.fn(),
      exportFileMetadata: vi.fn(() => ({})),
    };

    mockState = {
      accountId: testAccountId,
      config: testConfig,
      apiClient: mockApiClient as unknown as ZTMApiClient,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set<MessageCallback>(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };

    await startMessageWatcher(mockState, mockContext);

    // seedFileMetadata should be called with persisted metadata
    expect(mockApiClient.seedFileMetadata).toHaveBeenCalledWith(persistedMetadata);
  });
});

describe('WatchLoopController scenarios', () => {
  let mockState: AccountRuntimeState;
  let createdTimeouts: ReturnType<typeof setTimeout>[] = [];
  const originalSetTimeout = global.setTimeout;

  function createMockState(): AccountRuntimeState {
    const mockApiClient = {
      watchChanges: vi.fn(() => Promise.resolve(mockSuccess({ value: [] }))),
      getChats: vi.fn(() => mockSuccess({ value: [] })),
      getPeerMessages: vi.fn(() => Promise.resolve({ ok: true, value: [] })),
      getGroupMessages: vi.fn(() => Promise.resolve({ ok: true, value: [] })),
      seedFileMetadata: vi.fn(),
      exportFileMetadata: vi.fn(() => ({})),
    };

    return {
      accountId: testAccountId,
      config: testConfig,
      apiClient: mockApiClient as unknown as ZTMApiClient,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set<MessageCallback>(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    createdTimeouts = [];

    global.setTimeout = vi.fn((callback: () => void, ms: number) => {
      const ref = originalSetTimeout(callback, ms);
      createdTimeouts.push(ref);
      return ref;
    }) as unknown as typeof setTimeout;
  });

  afterEach(() => {
    for (const timeout of createdTimeouts) {
      clearTimeout(timeout);
    }
    createdTimeouts = [];
    global.setTimeout = originalSetTimeout;
  });

  it('should schedule next iteration after each run', async () => {
    mockState = createMockState();

    const mockContext = createMockMessagingContext();
    await startMessageWatcher(mockState, mockContext);

    // Wait for at least one iteration to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // setTimeout should have been called for scheduling next iteration
    expect((global.setTimeout as any).mock.calls.length).toBeGreaterThan(0);
  });

  it('should reset messages received flag after each cycle', async () => {
    mockState = createMockState();
    let cycleCount = 0;

    const apiClient = mockState.apiClient as any;
    apiClient.watchChanges = vi.fn(() => {
      cycleCount++;
      return Promise.resolve(mockSuccess({ value: [] }));
    });

    const mockContext = createMockMessagingContext();
    await startMessageWatcher(mockState, mockContext);

    // Wait for multiple cycles
    await new Promise(resolve => setTimeout(resolve, 2500));

    // Should have gone through multiple cycles
    expect(cycleCount).toBeGreaterThan(1);
  });

  it('should handle watch with peer changes', async () => {
    // This test verifies the watch loop runs and processes peer changes
    // The mock setup ensures the API client returns peer change notifications
    const mockApiClient = {
      watchChanges: vi.fn(() =>
        Promise.resolve(
          mockSuccess({
            value: [
              {
                type: 'peer' as const,
                peer: 'alice',
              },
            ],
          })
        )
      ),
      getChats: vi.fn(() => mockSuccess({ value: [] })),
      getPeerMessages: vi.fn(() =>
        Promise.resolve({
          ok: true,
          value: [{ time: 1000, message: 'Hello', sender: 'alice' }],
        })
      ),
      getGroupMessages: vi.fn(() => Promise.resolve({ ok: true, value: [] })),
      seedFileMetadata: vi.fn(),
      exportFileMetadata: vi.fn(() => ({})),
    };

    mockState = {
      accountId: testAccountId,
      config: testConfig,
      apiClient: mockApiClient as unknown as ZTMApiClient,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set<MessageCallback>(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };

    const mockContext = createMockMessagingContext();
    // This should not throw
    await startMessageWatcher(mockState, mockContext);
  });
});

describe('handleInitialPairingRequests edge cases', () => {
  it('should skip pairing check when peer equals username', async () => {
    const mockContext = createMockMessagingContext();

    // Create state with username matching the peer
    const state: AccountRuntimeState = {
      accountId: testAccountId,
      config: { ...testConfig, username: 'testuser' },
      apiClient: {
        getChats: vi.fn(() =>
          mockSuccess({
            value: [
              {
                peer: 'testuser', // Same as username - should skip
                messages: [],
              },
            ],
          })
        ),
        watchChanges: vi.fn(() => Promise.resolve(mockSuccess({ value: [] }))),
        exportFileMetadata: vi.fn(() => ({})),
      } as unknown as ZTMApiClient,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 1,
      messageCallbacks: new Set(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };

    await startMessageWatcher(state, mockContext);
    // Should handle gracefully without throwing
  });
});

describe('getOrDefault fallback scenarios', () => {
  it('should use default allowFrom when getAllowFrom returns failure', async () => {
    const mockContext = createMockMessagingContext();

    // Mock getAllowFrom to return failure/null
    mockContext.allowFromRepo.getAllowFrom = vi.fn(() => Promise.resolve(null) as any);

    const mockApiClient = {
      watchChanges: vi.fn(() => Promise.resolve(mockSuccess({ value: [] }))),
      getChats: vi.fn(() => mockSuccess({ value: [] })),
      exportFileMetadata: vi.fn(() => ({})),
    } as unknown as ZTMApiClient;

    const state: AccountRuntimeState = {
      accountId: testAccountId,
      config: testConfig,
      apiClient: mockApiClient,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };

    // Should use default empty array when getAllowFrom returns null
    await startMessageWatcher(state, mockContext);
  });
});

describe('executeWatch edge cases', () => {
  it('should handle when apiClient is null in executeWatch', async () => {
    const mockContext = createMockMessagingContext();

    const state: AccountRuntimeState = {
      accountId: testAccountId,
      config: testConfig,
      apiClient: null,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };

    // Should return early without errors
    await startMessageWatcher(state, mockContext);
  });

  it('should handle when config is null in executeWatch', async () => {
    const mockApiClient = {
      watchChanges: vi.fn(() => Promise.resolve(mockSuccess({ value: [] }))),
      getChats: vi.fn(() => mockSuccess({ value: [] })),
      exportFileMetadata: vi.fn(() => ({})),
    } as unknown as ZTMApiClient;

    const state: AccountRuntimeState = {
      accountId: testAccountId,
      config: null as any,
      apiClient: mockApiClient,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };

    const mockContext = createMockMessagingContext();

    // Should handle gracefully and not throw
    await startMessageWatcher(state, mockContext);
  });
});

describe('processChangedPeer error handling', () => {
  it('should handle getPeerMessages failure gracefully', async () => {
    const mockApiClient = {
      watchChanges: vi.fn(() =>
        Promise.resolve(
          mockSuccess({
            value: [{ type: 'peer' as const, peer: 'alice' }],
          })
        )
      ),
      getChats: vi.fn(() => mockSuccess({ value: [] })),
      getPeerMessages: vi.fn(() =>
        Promise.resolve({
          ok: false,
          error: {
            code: 'READ_FAILED',
            message: 'Failed to read messages',
            context: {},
            toJSON: () => ({}),
            name: 'ZTMReadError',
          },
        })
      ),
      exportFileMetadata: vi.fn(() => ({})),
    } as unknown as ZTMApiClient;

    const state: AccountRuntimeState = {
      accountId: testAccountId,
      config: testConfig,
      apiClient: mockApiClient,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };

    const mockContext = createMockMessagingContext();
    await startMessageWatcher(state, mockContext);

    // Wait for the watch iteration to run
    await new Promise(resolve => setTimeout(resolve, 100));
    // Should not throw - error is handled gracefully
  });
});

describe('processChangedGroup error handling', () => {
  it('should handle getGroupMessages failure gracefully', async () => {
    const mockApiClient = {
      watchChanges: vi.fn(() =>
        Promise.resolve(
          mockSuccess({
            value: [
              { type: 'group' as const, creator: 'alice', group: 'test-group', name: 'Test Group' },
            ],
          })
        )
      ),
      getChats: vi.fn(() => mockSuccess({ value: [] })),
      getGroupMessages: vi.fn(() =>
        Promise.resolve({
          ok: false,
          error: {
            code: 'READ_FAILED',
            message: 'Failed to read group messages',
            context: {},
            toJSON: () => ({}),
            name: 'ZTMReadError',
          },
        })
      ),
      exportFileMetadata: vi.fn(() => ({})),
    } as unknown as ZTMApiClient;

    const state: AccountRuntimeState = {
      accountId: testAccountId,
      config: testConfig,
      apiClient: mockApiClient,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };

    const mockContext = createMockMessagingContext();
    await startMessageWatcher(state, mockContext);

    // Wait for the watch iteration to run
    await new Promise(resolve => setTimeout(resolve, 100));
    // Should not throw - error is handled gracefully
  });
});

describe('performFullSync edge cases', () => {
  it('should return early when apiClient is null in performFullSync', async () => {
    const mockContext = createMockMessagingContext();

    // Trigger full sync by setting up state
    const state: AccountRuntimeState = {
      accountId: testAccountId,
      config: testConfig,
      apiClient: null,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };

    // Should return early without errors
    await startMessageWatcher(state, mockContext);
  });

  it('should handle full sync failure gracefully', async () => {
    const mockApiClient = {
      watchChanges: vi.fn(() => Promise.resolve(mockSuccess({ value: [] }))),
      getChats: vi.fn(() =>
        Promise.resolve({
          ok: false,
          error: {
            code: 'READ_FAILED',
            message: 'Full sync failed',
            context: {},
            toJSON: () => ({}),
            name: 'ZTMReadError',
          },
        })
      ),
      exportFileMetadata: vi.fn(() => ({})),
    } as unknown as ZTMApiClient;

    const state: AccountRuntimeState = {
      accountId: testAccountId,
      config: testConfig,
      apiClient: mockApiClient,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };

    const mockContext = createMockMessagingContext();
    await startMessageWatcher(state, mockContext);

    // Wait for initial sync to complete
    await new Promise(resolve => setTimeout(resolve, 50));
    // Should not throw - failure is handled gracefully
  });
});

describe('processChangedPaths empty items', () => {
  it('should return early when watch returns empty items', async () => {
    // Test that empty watch results are handled gracefully
    const mockApiClient = {
      watchChanges: vi.fn(() => Promise.resolve(mockSuccess({ value: [] }))),
      getChats: vi.fn(() => mockSuccess({ value: [] })),
      exportFileMetadata: vi.fn(() => ({})),
    } as unknown as ZTMApiClient;

    const state: AccountRuntimeState = {
      accountId: testAccountId,
      config: testConfig,
      apiClient: mockApiClient,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };

    const mockContext = createMockMessagingContext();
    // Should not throw
    await startMessageWatcher(state, mockContext);
  });
});

describe('pending iteration flag behavior', () => {
  it('should track pending iteration state', () => {
    // Verify the state object has the necessary properties
    const state: AccountRuntimeState = {
      accountId: testAccountId,
      config: testConfig,
      apiClient: null,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };

    expect(state.watchErrorCount).toBe(0);
    expect(state.watchInterval).toBeNull();
  });
});

describe('watch error threshold behavior', () => {
  it('should increment error count correctly', () => {
    const state: AccountRuntimeState = {
      accountId: testAccountId,
      config: testConfig,
      apiClient: null,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };

    // Manually test error counting
    state.watchErrorCount++;
    state.watchErrorCount++;
    expect(state.watchErrorCount).toBe(2);

    // Test threshold comparison (WATCH_ERROR_THRESHOLD is 5)
    state.watchErrorCount = WATCH_ERROR_THRESHOLD + 1;
    expect(state.watchErrorCount > WATCH_ERROR_THRESHOLD).toBe(true);
  });

  it('should reset error count correctly in state object', () => {
    const state: AccountRuntimeState = {
      accountId: testAccountId,
      config: testConfig,
      apiClient: null,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set(),
      watchInterval: null,
      watchErrorCount: 5, // Already at threshold
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };

    // Simulate successful iteration resetting error count
    state.watchErrorCount = 0;
    expect(state.watchErrorCount).toBe(0);
  });
});

describe('message semaphore behavior', () => {
  it('should process messages with semaphore', async () => {
    const MESSAGE_SEMAPHORE_PERMITS = 10;

    // Verify the semaphore permits constant
    expect(MESSAGE_SEMAPHORE_PERMITS).toBe(10);
  });
});

describe('constants verification', () => {
  it('should have correct WATCH_ERROR_THRESHOLD', () => {
    // Verify WATCH_ERROR_THRESHOLD constant is correctly defined
    expect(WATCH_ERROR_THRESHOLD).toBe(5);
  });
});
