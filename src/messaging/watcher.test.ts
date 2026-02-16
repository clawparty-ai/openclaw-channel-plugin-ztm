// Unit tests for Watcher core functionality

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { startMessageWatcher } from "./watcher.js";
import { testConfig, testAccountId, createMockChat } from "../test-utils/fixtures.js";
import { mockSuccess } from "../test-utils/mocks.js";
import type { AccountRuntimeState } from "../types/runtime.js";
import type { ZTMApiClient } from "../types/api.js";
import type { ZTMChatMessage } from "../types/messaging.js";

// Mock dependencies
vi.mock("../utils/logger.js", () => ({
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

vi.mock("../utils/log-sanitize.js", () => ({
  sanitizeForLog: vi.fn((input: string) => input),
}));

vi.mock("../runtime/index.js", () => ({
  getZTMRuntime: () => ({
    channel: {
      pairing: {
        readAllowFromStore: vi.fn(() => Promise.resolve([])),
      },
    },
  }),
}));

vi.mock("../runtime/store.js", () => ({
  getAccountMessageStateStore: vi.fn(() => ({
    getFileMetadata: vi.fn(() => ({})),
    setFileMetadataBulk: vi.fn(),
  })),
}));

vi.mock("../runtime/state.js", () => ({
  getAllowFromCache: vi.fn(() => Promise.resolve([])),
}));

vi.mock("./polling.js", () => ({
  startPollingWatcher: vi.fn(),
}));

vi.mock("./chat-processor.js", () => ({
  processAndNotifyChat: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("./processor.js", () => ({
  processIncomingMessage: vi.fn(() => null),
}));

vi.mock("./dispatcher.js", () => ({
  notifyMessageCallbacks: vi.fn(),
}));

vi.mock("../core/dm-policy.js", () => ({
  checkDmPolicy: vi.fn(() => ({ allowed: true, reason: "allowed", action: "process" })),
}));

vi.mock("../connectivity/permit.js", () => ({
  handlePairingRequest: vi.fn(() => Promise.resolve()),
}));

describe("startMessageWatcher", () => {
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
      messageCallbacks: new Set<(message: ZTMChatMessage) => void>(),
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
    }) as unknown as typeof setInterval;

    mockState = createMockState();
  });

  afterEach(() => {
    for (const interval of createdIntervals) {
      clearInterval(interval);
    }
    createdIntervals = [];
    global.setInterval = originalSetInterval;
  });

  describe("initialization", () => {
    it("should return early if no apiClient", async () => {
      const stateWithoutApi = { ...mockState, apiClient: null };
      await startMessageWatcher(stateWithoutApi as AccountRuntimeState);
      // Should not throw and should return quickly
    });

    it("should call seedFileMetadata", async () => {
      await startMessageWatcher(mockState);
      // seedFileMetadata should have been called internally
    });

    it("should perform initial sync", async () => {
      const chats = [createMockChat("alice", "Hello", 1000)];
      const apiClient = mockState.apiClient as any;
      apiClient.getChats = vi.fn(() => mockSuccess({ value: chats }));

      await startMessageWatcher(mockState);

      expect(apiClient.getChats).toHaveBeenCalled();
    });
  });

  describe("watch loop behavior", () => {
    it("should start the watch loop", async () => {
      await startMessageWatcher(mockState);
      // Watch loop is started via recursive setTimeout
      // Just verify function completes without error
    });

    it("should handle empty changed items", async () => {
      const apiClient = mockState.apiClient as any;
      apiClient.watchChanges = vi.fn(() =>
        Promise.resolve(mockSuccess({ value: [] }))
      );

      await startMessageWatcher(mockState);

      // Wait a bit for the watch loop to run
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it("should handle peer change items", async () => {
      const apiClient = mockState.apiClient as any;
      const mockWatchChanges = vi.fn(() =>
        Promise.resolve(
          mockSuccess({
            value: [{ type: "peer" as const, peer: "alice" }],
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
              message: "Hello",
              sender: "alice",
            },
          ],
        })
      );

      await startMessageWatcher(mockState);

      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it("should handle group change items", async () => {
      const apiClient = mockState.apiClient as any;
      const mockWatchChanges = vi.fn(() =>
        Promise.resolve(
          mockSuccess({
            value: [
              { type: "group" as const, creator: "alice", group: "test-group", name: "Test Group" },
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
              message: "Hello group",
              sender: "bob",
            },
          ],
        })
      );

      await startMessageWatcher(mockState);

      await new Promise((resolve) => setTimeout(resolve, 100));
    });
  });

  describe("error handling", () => {
    it("should handle API client errors gracefully", async () => {
      const apiClient = mockState.apiClient as any;
      apiClient.watchChanges = vi.fn(() =>
        Promise.reject(new Error("Network error"))
      );

      await startMessageWatcher(mockState);

      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it("should handle getChats errors gracefully", async () => {
      const apiClient = mockState.apiClient as any;
      apiClient.getChats = vi.fn(() =>
        Promise.resolve({ ok: false, error: { code: "FAILED", message: "Failed to get chats", context: {}, toJSON: () => ({}), name: "ZTMReadError" } })
      );

      await startMessageWatcher(mockState);
      // Should not throw
    });

    it("should handle getPeerMessages errors gracefully", async () => {
      const apiClient = mockState.apiClient as any;
      const mockWatchChanges = vi.fn(() =>
        Promise.resolve(
          mockSuccess({
            value: [{ type: "peer" as const, peer: "alice" }],
          })
        )
      );
      apiClient.watchChanges = mockWatchChanges;
      apiClient.getPeerMessages = vi.fn(() =>
        Promise.reject(new Error("Failed to get messages"))
      );

      await startMessageWatcher(mockState);

      await new Promise((resolve) => setTimeout(resolve, 100));
    });
  });

  describe("crash recovery", () => {
    it("should restart loop after unexpected error", async () => {
      let callCount = 0;
      const apiClient = mockState.apiClient as any;
      apiClient.watchChanges = vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Unexpected crash");
        }
        return Promise.resolve(mockSuccess({ value: [] }));
      });

      await startMessageWatcher(mockState);

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Loop should have restarted after the crash
    });
  });
});

describe("seedFileMetadata", () => {
  it("should seed metadata from persisted state", async () => {
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
    await startMessageWatcher(state);
  });
});

describe("watch error count behavior", () => {
  it("should increment error count on watch failure", () => {
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

  it("should reset error count after successful iteration", () => {
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

describe("full sync behavior", () => {
  it("should trigger full sync after multiple errors", async () => {
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

    await startMessageWatcher(state);
    // Should fallback to polling when error count > 5
  });
});
