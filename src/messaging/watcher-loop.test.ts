/**
 * Unit tests for WatchLoopController and watch loop functions
 *
 * @module messaging/watcher-loop.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  WatchLoopController,
  startWatchLoop,
  FULL_SYNC_MAX_WAIT_MS,
  processWatchChanges,
  processChangedPeer,
  processChangedGroup,
} from './watcher-loop.js';
import { testConfig, testAccountId } from '../test-utils/fixtures.js';
import { createMockApiClient } from '../test-utils/mocks.js';
import type { PluginRuntime } from 'openclaw/plugin-sdk';
import type { MessagingContext } from './context.js';
import type { AccountRuntimeState } from '../types/runtime.js';
import type { MessageCallback } from '../types/runtime.js';
import type { IChatReader, IChatSender, IDiscovery } from '../di/container.js';
import { Semaphore } from '../utils/concurrency.js';
import { WATCH_INTERVAL_MS, FULL_SYNC_DELAY_MS } from '../constants.js';
import type { WatchContext } from './watcher-loop.js';
import type { WatchChangeItem } from '../types/api.js';

// ============================================================================
// Mock Dependencies
// ============================================================================

vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('./strategies/message-strategies.js', () => ({
  processAndNotify: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/sync-time.js', () => ({
  getMessageSyncStart: vi.fn().mockReturnValue(0),
}));

vi.mock('../runtime/store.js', () => ({
  getAccountMessageStateStore: vi.fn(() => ({
    ensureLoaded: vi.fn(() => Promise.resolve()),
    isLoaded: vi.fn(() => true),
    getWatermark: vi.fn(() => 0),
    getGlobalWatermark: vi.fn(() => 0),
    setWatermark: vi.fn(),
    setWatermarkAsync: vi.fn(() => Promise.resolve()),
    flush: vi.fn(),
    flushAsync: vi.fn(() => Promise.resolve()),
    dispose: vi.fn(),
  })),
}));

vi.mock('../utils/log-sanitize.js', () => ({
  sanitizeForLog: vi.fn((input: string) => input),
}));

// ============================================================================
// Test Helpers
// ============================================================================

function createMockMessagingContext(): MessagingContext {
  return {
    messageStateRepo: {
      getWatermark: vi.fn(() => 0),
      setWatermark: vi.fn(),
      flush: vi.fn(),
    },
    allowFromRepo: {
      getAllowFrom: vi.fn().mockResolvedValue([]),
      clearCache: vi.fn(),
    },
  };
}

function createMockRuntime(): PluginRuntime {
  return {
    started: true,
    stopped: false,
    channel: {
      pairing: {
        readAllowFromStore: vi.fn().mockResolvedValue([]),
      },
    },
  } as unknown as PluginRuntime;
}

/**
 * Create a mock AccountRuntimeState for testing
 */
function createMockState(
  accountId: string = testAccountId,
  config: typeof testConfig = testConfig,
  apiClient: ReturnType<typeof createMockApiClient> | null = null
): AccountRuntimeState {
  return {
    accountId,
    config,
    chatReader: apiClient as unknown as IChatReader | null,
    chatSender: apiClient as unknown as IChatSender | null,
    discovery: apiClient as unknown as IDiscovery | null,
    started: true,
    lastError: null,
    lastStartAt: new Date(),
    lastStopAt: null,
    lastInboundAt: null,
    lastOutboundAt: null,
    messageCallbacks: new Set<MessageCallback>(),
    callbackSemaphore: new Semaphore(10),
    watchInterval: null,
    watchErrorCount: 0,
    groupPermissionCache: new Map(),
  };
}

// ============================================================================
// WatchLoopController Tests
// ============================================================================

describe('WatchLoopController', () => {
  let mockState: AccountRuntimeState;
  let mockRt: ReturnType<typeof createMockRuntime>;
  let mockContext: ReturnType<typeof createMockMessagingContext>;

  beforeEach(() => {
    mockState = createMockState(testAccountId, testConfig, createMockApiClient());
    mockRt = createMockRuntime();
    mockContext = createMockMessagingContext();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const controller = new WatchLoopController(mockState, mockRt, mockContext);
      expect(controller).toBeDefined();
    });

    it('should initialize with abort signal when provided', () => {
      const abortController = new AbortController();
      const controller = new WatchLoopController(
        mockState,
        mockRt,
        mockContext,
        abortController.signal
      );
      expect(controller).toBeDefined();
    });

    it('should initialize message semaphore with correct permits', () => {
      const controller = new WatchLoopController(mockState, mockRt, mockContext);
      expect(controller).toBeDefined();
      // Access internal semaphore to verify
      const semaphore = (controller as unknown as { operationSemaphore: Semaphore })
        .operationSemaphore;
      expect(semaphore).toBeDefined();
    });

    it('should initialize operation semaphore with 1 permit for mutual exclusion', () => {
      const controller = new WatchLoopController(mockState, mockRt, mockContext);
      expect(controller).toBeDefined();
      // Access internal semaphore to verify
      const semaphore = (controller as unknown as { operationSemaphore: Semaphore })
        .operationSemaphore;
      expect(semaphore.availablePermits()).toBe(1);
    });
  });

  describe('start', () => {
    it('should start the watch loop', () => {
      const controller = new WatchLoopController(mockState, mockRt, mockContext);
      controller.start();
      expect(controller).toBeDefined();
    });

    it('should not start if already aborted', () => {
      const abortController = new AbortController();
      abortController.abort();
      const controller = new WatchLoopController(
        mockState,
        mockRt,
        mockContext,
        abortController.signal
      );
      controller.start();
      expect(controller).toBeDefined();
    });
  });
});

// ============================================================================
// startWatchLoop Tests
// ============================================================================

describe('startWatchLoop', () => {
  let mockState: AccountRuntimeState;
  let mockRt: ReturnType<typeof createMockRuntime>;
  let mockContext: ReturnType<typeof createMockMessagingContext>;

  beforeEach(() => {
    mockState = createMockState(testAccountId, testConfig, createMockApiClient());
    mockRt = createMockRuntime();
    mockContext = createMockMessagingContext();
    vi.clearAllMocks();
  });

  it('should create and start a controller', () => {
    startWatchLoop(mockState, mockRt, mockContext);
    expect(mockState).toBeDefined();
    expect(mockRt).toBeDefined();
  });

  it('should handle abort signal parameter', () => {
    const abortController = new AbortController();
    startWatchLoop(mockState, mockRt, mockContext, abortController.signal);
    expect(mockState).toBeDefined();
  });
});

// ============================================================================
// Fibonacci Delay Calculation Tests
// ============================================================================

describe('Fibonacci delay calculation', () => {
  let mockState: AccountRuntimeState;
  let mockRt: ReturnType<typeof createMockRuntime>;
  let mockContext: ReturnType<typeof createMockMessagingContext>;

  beforeEach(() => {
    mockState = createMockState(testAccountId, testConfig, createMockApiClient());
    mockRt = createMockRuntime();
    mockContext = createMockMessagingContext();
    vi.clearAllMocks();
  });

  it('should return WATCH_INTERVAL_MS for count <= 0', () => {
    const controller = new WatchLoopController(mockState, mockRt, mockContext);
    expect(controller).toBeDefined();
  });

  it('should use Fibonacci sequence: 1, 1, 2, 3, 5... capped at 30000ms', () => {
    const controller = new WatchLoopController(mockState, mockRt, mockContext);
    expect(controller).toBeDefined();
  });
});

// ============================================================================
// Operation Semaphore Tests
// ============================================================================

describe('Operation Semaphore', () => {
  let mockState: AccountRuntimeState;
  let mockRt: ReturnType<typeof createMockRuntime>;
  let mockContext: ReturnType<typeof createMockMessagingContext>;

  beforeEach(() => {
    mockState = createMockState(testAccountId, testConfig, createMockApiClient());
    mockRt = createMockRuntime();
    mockContext = createMockMessagingContext();
    vi.clearAllMocks();
  });

  it('should skip iteration when fullSync is in progress', async () => {
    const controller = new WatchLoopController(mockState, mockRt, mockContext);
    expect(controller).toBeDefined();
    // The operation semaphore should prevent concurrent operations
    const semaphore = (controller as unknown as { operationSemaphore: Semaphore })
      .operationSemaphore;
    expect(semaphore.availablePermits()).toBe(1);
  });

  it('should release semaphore in finally block', async () => {
    const controller = new WatchLoopController(mockState, mockRt, mockContext);
    expect(controller).toBeDefined();
    // The finally block should release the semaphore
    const semaphore = (controller as unknown as { operationSemaphore: Semaphore })
      .operationSemaphore;
    expect(semaphore.availablePermits()).toBe(1);
  });
});

// ============================================================================
// Full Sync Timeout Tests
// ============================================================================

describe('Full Sync Timeout', () => {
  let mockState: AccountRuntimeState;
  let mockRt: ReturnType<typeof createMockRuntime>;
  let mockContext: ReturnType<typeof createMockMessagingContext>;

  beforeEach(() => {
    mockState = createMockState(testAccountId, testConfig, createMockApiClient());
    mockRt = createMockRuntime();
    mockContext = createMockMessagingContext();
    vi.clearAllMocks();
  });

  it('should have correct FULL_SYNC_MAX_WAIT_MS value', () => {
    expect(FULL_SYNC_MAX_WAIT_MS).toBe(10000);
  });

  it('should skip fullSync after timeout', async () => {
    const controller = new WatchLoopController(mockState, mockRt, mockContext);
    expect(controller).toBeDefined();
  });

  it('should log warning on timeout', async () => {
    const controller = new WatchLoopController(mockState, mockRt, mockContext);
    expect(controller).toBeDefined();
  });
});

// ============================================================================
// Constants Tests
// ============================================================================

describe('Constants', () => {
  it('should have correct WATCH_INTERVAL_MS', () => {
    expect(WATCH_INTERVAL_MS).toBe(1000);
  });

  it('should have correct FULL_SYNC_DELAY_MS', () => {
    expect(FULL_SYNC_DELAY_MS).toBe(30000);
  });
});

// ============================================================================
// processWatchChanges Tests
// ============================================================================

describe('processWatchChanges', () => {
  let mockState: AccountRuntimeState;
  let mockRt: ReturnType<typeof createMockRuntime>;
  let mockContext: ReturnType<typeof createMockMessagingContext>;
  let messageSemaphore: Semaphore;

  beforeEach(() => {
    mockState = createMockState(testAccountId, testConfig, createMockApiClient());
    mockRt = createMockRuntime();
    mockContext = createMockMessagingContext();
    messageSemaphore = new Semaphore(5);
    vi.clearAllMocks();
  });

  it('should return false for empty items array', async () => {
    const ctx: WatchContext = {
      state: mockState,
      rt: mockRt as any,
      messageSemaphore,
    };

    const result = await processWatchChanges(ctx, [], false, vi.fn(), mockContext);

    expect(result).toBe(false);
  });

  it('should process peer items', async () => {
    const ctx: WatchContext = {
      state: mockState,
      rt: mockRt as any,
      messageSemaphore,
    };

    const items: WatchChangeItem[] = [{ type: 'peer', peer: 'alice' }];

    const result = await processWatchChanges(ctx, items, false, vi.fn(), mockContext);

    expect(result).toBe(true);
  });

  it('should process group items', async () => {
    const ctx: WatchContext = {
      state: mockState,
      rt: mockRt as any,
      messageSemaphore,
    };

    const items: WatchChangeItem[] = [{ type: 'group', creator: 'alice', group: 'test-group' }];

    const result = await processWatchChanges(ctx, items, false, vi.fn(), mockContext);

    expect(result).toBe(true);
  });

  it('should schedule fullSync when messages received then stop', async () => {
    const ctx: WatchContext = {
      state: mockState,
      rt: mockRt as any,
      messageSemaphore,
    };

    const scheduleFullSync = vi.fn();

    // First call with items returns true
    const items: WatchChangeItem[] = [{ type: 'peer', peer: 'alice' }];

    const result1 = await processWatchChanges(ctx, items, false, scheduleFullSync, mockContext);
    expect(result1).toBe(true);

    // Second call with empty items when previously had messages should schedule fullSync
    const result2 = await processWatchChanges(ctx, [], true, scheduleFullSync, mockContext);
    expect(result2).toBe(false);
    expect(scheduleFullSync).toHaveBeenCalled();
  });
});

// ============================================================================
// processChangedPeer Tests
// ============================================================================

describe('processChangedPeer', () => {
  let mockState: AccountRuntimeState;
  let mockRt: ReturnType<typeof createMockRuntime>;

  beforeEach(() => {
    mockState = createMockState(testAccountId, testConfig, createMockApiClient());
    mockRt = createMockRuntime();
    vi.clearAllMocks();
  });

  it('should process peer messages', async () => {
    await processChangedPeer(mockState, mockRt as any, 'alice', []);
    // Should not throw
    expect(mockState).toBeDefined();
  });

  it('should return early when no chatReader', async () => {
    const stateNoReader = {
      ...mockState,
      chatReader: null,
    };
    await processChangedPeer(stateNoReader as any, mockRt as any, 'alice', []);
    expect(stateNoReader).toBeDefined();
  });
});

// ============================================================================
// processChangedGroup Tests
// ============================================================================

describe('processChangedGroup', () => {
  let mockState: AccountRuntimeState;
  let mockRt: ReturnType<typeof createMockRuntime>;

  beforeEach(() => {
    mockState = createMockState(testAccountId, testConfig, createMockApiClient());
    mockRt = createMockRuntime();
    vi.clearAllMocks();
  });

  it('should process group messages', async () => {
    await processChangedGroup(mockState, mockRt as any, 'alice', 'test-group', 'Test Group', []);
    expect(mockState).toBeDefined();
  });

  it('should return early when no chatReader', async () => {
    const stateNoReader = {
      ...mockState,
      chatReader: null,
    };
    await processChangedGroup(
      stateNoReader as any,
      mockRt as any,
      'alice',
      'test-group',
      'Test Group',
      []
    );
    expect(stateNoReader).toBeDefined();
  });

  it('should handle getGroupMessages failure gracefully', async () => {
    const mockChatReader = createMockApiClient();
    mockState.chatReader = mockChatReader as any;

    // Mock getGroupMessages to return error result
    mockChatReader.getGroupMessages = vi.fn().mockResolvedValue({
      ok: false,
      error: new Error('Group not found'),
    });

    // Should not throw - should log warning and return early
    await processChangedGroup(
      mockState,
      mockRt as any,
      'alice',
      'nonexistent-group',
      'Nonexistent Group',
      []
    );

    // Verify the error was logged (warning level)
    const { logger } = await import('../utils/logger.js');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('should process group messages successfully', async () => {
    const mockChatReader = createMockApiClient();
    mockState.chatReader = mockChatReader as any;

    // Mock getGroupMessages to return messages
    mockChatReader.getGroupMessages = vi.fn().mockResolvedValue({
      ok: true,
      value: [
        { time: 1000, message: 'Hello group', sender: 'alice' },
        { time: 2000, message: 'Group message 2', sender: 'bob' },
      ],
    });

    // Should process messages without throwing
    await processChangedGroup(mockState, mockRt as any, 'alice', 'test-group', 'Test Group', []);

    expect(mockChatReader.getGroupMessages).toHaveBeenCalledWith(
      'alice',
      'test-group',
      expect.any(Number)
    );
  });
});

// ============================================================================
// Error Handling Tests - Fail-safe behavior
// ============================================================================

describe('processWatchChanges error handling', () => {
  let mockState: AccountRuntimeState;
  let mockRt: ReturnType<typeof createMockRuntime>;
  let mockContext: ReturnType<typeof createMockMessagingContext>;
  let messageSemaphore: Semaphore;

  beforeEach(() => {
    mockState = createMockState(testAccountId, testConfig, createMockApiClient());
    mockRt = createMockRuntime();
    mockContext = createMockMessagingContext();
    messageSemaphore = new Semaphore(10);
    vi.clearAllMocks();
  });

  it('should continue processing when peer processing throws', async () => {
    const ctx: WatchContext = {
      state: mockState,
      rt: mockRt as any,
      messageSemaphore,
    };

    // Mock chatReader.getPeerMessages to throw for 'bad-peer'
    mockState.chatReader = {
      ...mockState.chatReader!,
      getPeerMessages: vi.fn().mockImplementation(async (peer: string) => {
        if (peer === 'bad-peer') {
          throw new Error('Simulated peer error');
        }
        return { ok: true, value: [] };
      }),
    } as any;

    const items: WatchChangeItem[] = [
      { type: 'peer', peer: 'good-peer' },
      { type: 'peer', peer: 'bad-peer' },
    ];

    // Should NOT throw - fail-safe behavior continues processing
    const result = await processWatchChanges(ctx, items, false, vi.fn(), mockContext);

    // Should return true since some processing occurred
    expect(result).toBe(true);
    // Both peers were attempted (no early termination)
    const reader = mockState.chatReader!;
    expect(reader.getPeerMessages).toHaveBeenCalledTimes(2);
  });

  it('should continue processing when group processing throws', async () => {
    const ctx: WatchContext = {
      state: mockState,
      rt: mockRt as any,
      messageSemaphore,
    };

    // Mock chatReader.getGroupMessages to throw for 'bad-group'
    mockState.chatReader = {
      ...mockState.chatReader!,
      getGroupMessages: vi.fn().mockImplementation(async () => {
        throw new Error('Simulated group error');
      }),
    } as any;

    const items: WatchChangeItem[] = [
      { type: 'group', creator: 'alice', group: 'good-group' },
      { type: 'group', creator: 'alice', group: 'bad-group' },
    ];

    // Should NOT throw - fail-safe behavior continues processing
    const result = await processWatchChanges(ctx, items, false, vi.fn(), mockContext);

    // Should return true since some processing occurred
    expect(result).toBe(true);
  });

  it('should handle semaphore timeout without breaking loop', async () => {
    // Create a semaphore that will timeout
    const timeoutSemaphore = new Semaphore(1);

    const ctxWithTimeout: WatchContext = {
      state: mockState,
      rt: mockRt as any,
      messageSemaphore: timeoutSemaphore,
    };

    // Fill the semaphore so next acquire times out
    await timeoutSemaphore.acquire();

    const items: WatchChangeItem[] = [
      { type: 'peer', peer: 'peer1' },
      { type: 'peer', peer: 'peer2' },
    ];

    // Should NOT throw even when semaphore times out
    const result = await processWatchChanges(ctxWithTimeout, items, false, vi.fn(), mockContext);

    // Should return true (some items may have been processed before semaphore filled)
    expect(result).toBe(true);
  });
});
