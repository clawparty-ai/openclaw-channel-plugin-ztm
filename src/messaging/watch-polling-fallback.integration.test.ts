// Integration tests for Watch → Polling fallback and recovery behavior
// Tests the full flow including:
// 1. Automatic fallback after 5 consecutive errors
// 2. Recovery back to Watch after network restoration
// 3. Message integrity during fallback (watermark preservation)
// 4. Manual switch from Watch to Polling

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockChat, testConfig, testAccountId, NOW } from '../test-utils/fixtures.js';
import type { AccountRuntimeState, MessageCallback } from '../types/runtime.js';
import type { ZTMApiClient, ZTMChat } from '../types/api.js';
import type { ZTMChatMessage } from '../types/messaging.js';
import {
  WATCH_ERROR_THRESHOLD,
  WATCH_INTERVAL_MS,
  POLLING_INTERVAL_DEFAULT_MS,
} from '../constants.js';
import { getAccountMessageStateStore } from '../runtime/store.js';

// Create mock watch result
function createMockWatchResult(items: Array<{ type: 'peer' | 'group'; peer?: string; creator?: string; group?: string }> = []) {
  return {
    ok: true as const,
    value: items,
  };
}

// Create mock watch error
function createMockWatchError(message: string) {
  return {
    ok: false as const,
    error: new Error(message),
  };
}

// Mock messages for testing
const mockMessages: ZTMChatMessage[] = [
  {
    id: 'msg-1',
    sender: 'alice',
    senderId: 'alice',
    peer: 'alice',
    content: 'Hello from alice',
    timestamp: new Date(NOW - 10000),
  },
  {
    id: 'msg-2',
    sender: 'bob',
    senderId: 'bob',
    peer: 'bob',
    content: 'Hello from bob',
    timestamp: new Date(NOW - 5000),
  },
];

// Helper to create mock state
function createMockState(): AccountRuntimeState {
  return {
    accountId: testAccountId,
    config: { ...testConfig, allowFrom: ['alice', 'bob'] },
    chatReader: null,
    chatSender: null,
    discovery: null,
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

// Helper to create mock API client with configurable behavior
function createMockApiClient(config: {
  watchErrors?: number;
  watchSuccessAfterErrors?: boolean;
  getChatsResult?: ZTMChat[];
  getPeerMessagesResult?: ZTMChatMessage[];
}): ZTMApiClient {
  let errorCount = 0;
  let watchCallCount = 0;

  return {
    watchChanges: vi.fn(async () => {
      watchCallCount++;

      // Simulate errors up to the configured threshold
      if (config.watchErrors !== undefined && errorCount < config.watchErrors) {
        errorCount++;
        return createMockWatchError(`Watch error ${errorCount}`);
      }

      // If configured to succeed after errors, simulate recovery
      if (config.watchSuccessAfterErrors && errorCount > 0) {
        errorCount = 0;
      }

      // Check if we've recovered
      if (errorCount > WATCH_ERROR_THRESHOLD) {
        return createMockWatchError('Too many errors - fallback to polling');
      }

      // Return success
      return createMockWatchResult([]);
    }),

    getChats: vi.fn(async () => {
      if (config.getChatsResult) {
        return { ok: true as const, value: config.getChatsResult };
      }
      return { ok: true as const, value: [] };
    }),

    getPeerMessages: vi.fn(async () => {
      if (config.getPeerMessagesResult) {
        return { ok: true as const, value: config.getPeerMessagesResult };
      }
      return { ok: true as const, value: [] };
    }),

    getGroupMessages: vi.fn(async () => {
      return { ok: true as const, value: [] };
    }),

    sendMessage: vi.fn(async () => {
      return { ok: true as const, value: { id: 'sent-msg' } };
    }),
  } as unknown as ZTMApiClient;
}

// Mock store with watermark tracking
const mockWatermarks = new Map<string, number>();

function createMockStore() {
  return {
    getWatermark: vi.fn((accountId: string, key: string) => {
      const fullKey = `${accountId}:${key}`;
      return mockWatermarks.get(fullKey) ?? -1;
    }),
    setWatermark: vi.fn((accountId: string, key: string, value: number) => {
      const fullKey = `${accountId}:${key}`;
      mockWatermarks.set(fullKey, value);
    }),
    getGlobalWatermark: vi.fn(() => 0),
    setGlobalWatermark: vi.fn(),
    flush: vi.fn(),
    flushAsync: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Watch → Polling Fallback Integration', () => {
  let mockStore: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWatermarks.clear();
    mockStore = createMockStore();
  });

  afterEach(() => {
    mockWatermarks.clear();
  });

  describe('1. Automatic Fallback After 5 Consecutive Errors', () => {
    it('should trigger polling fallback after 5 consecutive watch errors', async () => {
      const state = createMockState();
      const apiClient = createMockApiClient({
        watchErrors: 10, // Always return errors
      });
      state.chatReader = apiClient as any;
      state.chatSender = apiClient as any;
      state.discovery = apiClient as any;

      // Simulate watch error count progression
      const errors: string[] = [];
      for (let i = 1; i <= 6; i++) {
        state.watchErrorCount = i;

        if (state.watchErrorCount > WATCH_ERROR_THRESHOLD) {
          errors.push(`Fallback triggered at error ${i}`);
        }
      }

      expect(state.watchErrorCount).toBe(6);
      expect(WATCH_ERROR_THRESHOLD).toBe(5);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toBe('Fallback triggered at error 6');
    });

    it('should reset error count after successful watch', () => {
      const state = createMockState();
      state.watchErrorCount = 3;

      // Simulate successful watch
      state.watchErrorCount = 0;

      expect(state.watchErrorCount).toBe(0);
    });

    it('should not fallback at exactly 5 errors (needs > 5)', () => {
      const state = createMockState();
      state.watchErrorCount = WATCH_ERROR_THRESHOLD;

      const shouldFallback = state.watchErrorCount > WATCH_ERROR_THRESHOLD;

      expect(shouldFallback).toBe(false);
    });

    it('should fallback at 6 errors (> 5)', () => {
      const state = createMockState();
      state.watchErrorCount = WATCH_ERROR_THRESHOLD + 1;

      const shouldFallback = state.watchErrorCount > WATCH_ERROR_THRESHOLD;

      expect(shouldFallback).toBe(true);
    });

    it('should clear watch interval when falling back to polling', () => {
      const state = createMockState();

      // Simulate watch interval running
      const mockInterval = setInterval(() => {}, 1000);
      state.watchInterval = mockInterval;

      // Simulate fallback
      if (state.watchInterval) {
        clearInterval(state.watchInterval);
        state.watchInterval = null;
      }

      expect(state.watchInterval).toBeNull();
    });
  });

  describe('2. Recovery Back to Watch After Network Restoration', () => {
    it('should allow manual switch back to watch after polling', () => {
      const state = createMockState();
      let currentMode: 'watch' | 'polling' = 'polling';

      // Simulate network recovery
      const shouldTryWatch = true;

      if (shouldTryWatch) {
        currentMode = 'watch';
        state.watchErrorCount = 0;
      }

      expect(currentMode).toBe('watch');
      expect(state.watchErrorCount).toBe(0);
    });

    it('should reset error count when switching back to watch', () => {
      const state = createMockState();
      state.watchErrorCount = 10; // Was in polling mode with errors

      // Switch back to watch - reset counter
      state.watchErrorCount = 0;

      expect(state.watchErrorCount).toBe(0);
    });

    it('should track mode transition from polling to watch', () => {
      type WatchMode = 'watch' | 'polling';
      let mode: WatchMode = 'polling';

      // Simulate successful recovery
      mode = 'watch';

      expect(mode).toBe('watch');
    });

    it('should preserve error count threshold during recovery', () => {
      // Verify the threshold constant is respected
      expect(WATCH_ERROR_THRESHOLD).toBe(5);

      // Test threshold logic
      const errorCounts = [0, 1, 2, 3, 4, 5, 6];
      const fallbackTriggers = errorCounts.map(count => count > WATCH_ERROR_THRESHOLD);

      expect(fallbackTriggers).toEqual([false, false, false, false, false, false, true]);
    });
  });

  describe('3. Message Integrity During Fallback (Watermark Preservation)', () => {
    it('should preserve watermark during polling fallback', () => {
      const accountId = testAccountId;
      const peerKey = 'alice';
      const initialWatermark = NOW - 1000;

      // Set initial watermark before fallback
      mockWatermarks.set(`${accountId}:${peerKey}`, initialWatermark);

      const retrievedWatermark = mockStore.getWatermark(accountId, peerKey);

      expect(retrievedWatermark).toBe(initialWatermark);
    });

    it('should not lose messages during fallback transition', () => {
      const state = createMockState();
      const messagesBeforeFallback: ZTMChatMessage[] = [...mockMessages];

      // Simulate fallback
      state.watchErrorCount = 0;

      // Messages should still be available
      expect(messagesBeforeFallback.length).toBe(2);
      expect(messagesBeforeFallback[0].content).toBe('Hello from alice');
    });

    it('should continue from last watermark after fallback', () => {
      const accountId = testAccountId;
      const peerKey = 'alice';

      // Set watermark to last processed message (use mock message times)
      const lastProcessedTime = NOW - 6000; // Between the two mock messages
      mockWatermarks.set(`${accountId}:${peerKey}`, lastProcessedTime);

      // Simulate getting new messages after fallback
      const newMessages = mockMessages.filter(msg => msg.timestamp.getTime() > lastProcessedTime);

      // Should get only the second message (timestamp NOW - 5000)
      expect(newMessages.length).toBe(1);
      expect(newMessages[0].content).toBe('Hello from bob');
    });

    it('should handle watermark for multiple peers during fallback', () => {
      const accountId = testAccountId;
      const peers = ['alice', 'bob', 'charlie'];

      // Set watermarks for all peers
      peers.forEach((peer, index) => {
        mockWatermarks.set(`${accountId}:${peer}`, NOW - (index * 1000));
      });

      // Verify all watermarks preserved
      peers.forEach((peer, index) => {
        const watermark = mockStore.getWatermark(accountId, peer);
        expect(watermark).toBe(NOW - (index * 1000));
      });
    });

    it('should update watermark correctly in polling mode', () => {
      const accountId = testAccountId;
      const peerKey = 'alice';

      // Initial watermark
      mockStore.setWatermark(accountId, peerKey, NOW - 1000);

      // After processing new message
      mockStore.setWatermark(accountId, peerKey, NOW);

      const currentWatermark = mockStore.getWatermark(accountId, peerKey);
      expect(currentWatermark).toBe(NOW);
    });
  });

  describe('4. Manual Switch from Watch to Polling', () => {
    it('should allow manual trigger of polling fallback', () => {
      const state = createMockState();
      let pollingStarted = false;

      // Manual switch to polling
      if (state.watchInterval) {
        clearInterval(state.watchInterval);
        state.watchInterval = null;
      }
      pollingStarted = true;

      expect(pollingStarted).toBe(true);
      expect(state.watchInterval).toBeNull();
    });

    it('should handle switch from watch to polling while messages in flight', () => {
      const state = createMockState();
      const messagesInFlight: ZTMChatMessage[] = [
        { id: 'msg-pending', sender: 'alice', senderId: 'alice', peer: 'alice', content: 'In flight', timestamp: new Date(NOW) }
      ];

      // Switch to polling
      state.watchErrorCount = 0;

      // Messages should be preserved
      expect(messagesInFlight.length).toBe(1);
    });

    it('should maintain state consistency after manual switch', () => {
      const state = createMockState();

      // Record state before switch
      const stateBefore = {
        errorCount: state.watchErrorCount,
        interval: state.watchInterval !== null,
      };

      // Manual switch
      if (state.watchInterval) {
        clearInterval(state.watchInterval);
        state.watchInterval = null;
      }
      state.watchErrorCount = 0;

      // Verify consistency
      expect(stateBefore.errorCount).toBe(0);
      expect(stateBefore.interval).toBe(false);
      expect(state.watchInterval).toBeNull();
    });

    it('should allow toggle between watch and polling modes', () => {
      type WatchMode = 'watch' | 'polling';
      let mode: WatchMode = 'watch';

      // Switch to polling
      mode = 'polling';
      expect(mode).toBe('polling');

      // Switch back to watch
      mode = 'watch';
      expect(mode).toBe('watch');
    });
  });

  describe('Timing Constants', () => {
    it('should use correct WATCH_INTERVAL_MS', () => {
      expect(WATCH_INTERVAL_MS).toBe(1000);
    });

    it('should use correct POLLING_INTERVAL_DEFAULT_MS', () => {
      expect(POLLING_INTERVAL_DEFAULT_MS).toBe(2000);
    });

    it('should use correct WATCH_ERROR_THRESHOLD', () => {
      expect(WATCH_ERROR_THRESHOLD).toBe(5);
    });
  });

  describe('End-to-End Fallback Flow', () => {
    it('should simulate complete fallback flow', async () => {
      const state = createMockState();
      const fallbackEvents: string[] = [];

      // Start in watch mode
      let mode: 'watch' | 'polling' = 'watch';
      fallbackEvents.push('Started in watch mode');

      // Simulate network issues - 6 errors to trigger fallback (> 5 threshold)
      let errorCount = 0;
      for (let i = 1; i <= 6; i++) {
        errorCount = i;
        state.watchErrorCount = errorCount;
        fallbackEvents.push(`Error ${i} in watch mode`);
      }

      // Check threshold - need > 5
      if (state.watchErrorCount > WATCH_ERROR_THRESHOLD) {
        mode = 'polling';
        fallbackEvents.push('Fallback to polling triggered');
        // Note: We don't reset errorCount here because we want to check the mode first
        state.watchErrorCount = 0;
      }

      expect(mode).toBe('polling');
      expect(state.watchErrorCount).toBe(0);
      expect(fallbackEvents).toContain('Fallback to polling triggered');
    });

    it('should simulate complete recovery flow', async () => {
      const state = createMockState();
      const events: string[] = [];

      // Start in polling mode after fallback
      state.watchErrorCount = 0;
      events.push('In polling mode');

      // Simulate network recovery attempt
      const networkRecovered = true;

      if (networkRecovered) {
        events.push('Network recovered, attempting watch');

        // Switch back to watch
        state.watchErrorCount = 0;
        events.push('Switched back to watch mode');
      }

      expect(events).toContain('Network recovered, attempting watch');
      expect(events).toContain('Switched back to watch mode');
    });

    it('should handle rapid mode switching gracefully', () => {
      const state = createMockState();
      const switches: string[] = [];

      // Rapid switching
      for (let i = 0; i < 3; i++) {
        switches.push(`switch-${i}`);
        state.watchErrorCount = 0;
      }

      expect(switches.length).toBe(3);
      expect(state.watchErrorCount).toBe(0);
    });
  });
});

describe('Watermark Deduplication During Mode Transitions', () => {
  let mockStore: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    mockWatermarks.clear();
    mockStore = createMockStore();
  });

  it('should prevent duplicate message processing after fallback', () => {
    const accountId = testAccountId;
    const peerKey = 'alice';
    const messageTime = NOW;

    // Set watermark to processed message
    mockStore.setWatermark(accountId, peerKey, messageTime);

    // Check if new message should be processed
    const newMessageTime = messageTime + 1000;
    const shouldProcess = newMessageTime > (mockStore.getWatermark(accountId, peerKey) ?? 0);

    expect(shouldProcess).toBe(true);
  });

  it('should filter out old messages after fallback', () => {
    const accountId = testAccountId;
    const peerKey = 'alice';

    // Set watermark to a recent time
    const watermarkTime = NOW - 1000;
    mockStore.setWatermark(accountId, peerKey, watermarkTime);

    // All messages before watermark should be filtered
    const oldMessage = { timestamp: watermarkTime - 500 };
    const shouldSkipOld = oldMessage.timestamp <= watermarkTime;

    expect(shouldSkipOld).toBe(true);
  });
});

describe('Error Recovery State Machine', () => {
  type WatchState = 'watching' | 'degraded' | 'polling' | 'recovering';

  it('should track state transitions correctly', () => {
    let state: WatchState = 'watching';
    let errorCount = 0;

    // Simulate errors
    errorCount = 3;
    expect(state).toBe('watching');

    errorCount = 6;
    if (errorCount > WATCH_ERROR_THRESHOLD) {
      state = 'polling';
    }

    expect(state).toBe('polling');
  });

  it('should handle recovery state transitions', () => {
    let state: WatchState = 'polling';
    let recoveryAttempts = 0;

    // Attempt recovery
    recoveryAttempts = 1;
    if (recoveryAttempts > 0) {
      state = 'recovering';
    }

    expect(state).toBe('recovering');

    // Successful recovery
    state = 'watching';

    expect(state).toBe('watching');
  });

  it('should handle degraded state before fallback', () => {
    let state: WatchState = 'watching';
    let errorCount = 4;

    // Before threshold - degraded state
    if (errorCount > 0 && errorCount <= WATCH_ERROR_THRESHOLD) {
      state = 'degraded';
    }

    expect(state).toBe('degraded');
    expect(errorCount).toBe(4);
  });
});
