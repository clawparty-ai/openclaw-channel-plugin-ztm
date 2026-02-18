// Unit tests for Account Runtime State Management

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getOrCreateAccountState,
  removeAccountState,
  getAllAccountStates,
  initializeRuntime,
  stopRuntime,
  cleanupExpiredPairings,
  clearAllowFromCache,
  getGroupPermissionCached,
  clearGroupPermissionCache,
  type AccountRuntimeState,
} from "./state.js";
import { success } from "../types/common.js";
import { testConfig } from "../test-utils/fixtures.js";

// Mock state using mutable container
const mockApiState = {
  getMeshInfo: vi.fn().mockResolvedValue(success({
    connected: true,
    endpoints: 5,
    errors: [],
  })),
};

vi.mock("../api/ztm-api.js", () => ({
  createZTMApiClient: vi.fn(() => ({
    getMeshInfo: () => mockApiState.getMeshInfo(),
  })),
}));

vi.mock("../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("./store.js", () => ({
  getAccountMessageStateStore: vi.fn(() => ({
    flush: vi.fn(),
        flushAsync: vi.fn().mockResolvedValue(undefined),
    getWatermark: () => -1,
    getGlobalWatermark: vi.fn(() => 0),
    setWatermark: vi.fn(),
    getFileMetadata: vi.fn(() => ({})),
    setFileMetadata: vi.fn(),
    setFileMetadataBulk: vi.fn(),
    dispose: vi.fn(),
  })),
  disposeMessageStateStore: vi.fn(),
  FileSystem: {},
  nodeFs: {},
}));

vi.mock("./pairing-store.js", () => ({
  getPairingStateStore: vi.fn(() => ({
    loadPendingPairings: vi.fn(() => new Map()),
    savePendingPairing: vi.fn(),
    deletePendingPairing: vi.fn(),
    cleanupExpiredPairings: vi.fn(() => 0),
    flush: vi.fn(),
        flushAsync: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
  })),
  disposePairingStateStore: vi.fn(),
  FileSystem: {},
  nodeFs: {},
}));

vi.mock("../messaging/inbound.js", () => ({
  startMessageWatcher: vi.fn().mockResolvedValue(undefined),
}));

describe("Account Runtime State Management", () => {
  const testAccountId = "test-account";
  // Using testConfig from fixtures (see import at top of file)

  // Clean up all states before and after tests
  beforeEach(() => {
    // Clean up states first
    const allStates = getAllAccountStates();
    for (const [accountId] of allStates) {
      removeAccountState(accountId);
    }

    // Reset mock calls and implementation, then set default behavior
    mockApiState.getMeshInfo.mockReset();
    mockApiState.getMeshInfo.mockResolvedValue(success({
      connected: true,
      endpoints: 5,
      errors: [],
    }));
  });

  afterEach(() => {
    const allStates = getAllAccountStates();
    for (const [accountId] of allStates) {
      removeAccountState(accountId);
    }
  });

  describe("getOrCreateAccountState", () => {
    it("should create a new state for unknown account", () => {
      const state = getOrCreateAccountState(testAccountId);

      expect(state).toBeDefined();
      expect(state.accountId).toBe(testAccountId);
      expect(state.config).toBeDefined();
      expect(state.connected).toBe(false);
      expect(state.meshConnected).toBe(false);
      expect(state.apiClient).toBeNull();
    });

    it("should return existing state for known account", () => {
      const state1 = getOrCreateAccountState(testAccountId);
      state1.lastError = "test error";

      const state2 = getOrCreateAccountState(testAccountId);

      expect(state2).toBe(state1);
      expect(state2.lastError).toBe("test error");
    });

    it("should create separate states for different accounts", () => {
      const state1 = getOrCreateAccountState("account1");
      const state2 = getOrCreateAccountState("account2");

      expect(state1).not.toBe(state2);
      expect(state1.accountId).toBe("account1");
      expect(state2.accountId).toBe("account2");
    });

    it("should initialize with default values", () => {
      const state = getOrCreateAccountState(testAccountId);

      expect(state.connected).toBe(false);
      expect(state.meshConnected).toBe(false);
      expect(state.lastError).toBeNull();
      expect(state.lastStartAt).toBeNull();
      expect(state.lastStopAt).toBeNull();
      expect(state.lastInboundAt).toBeNull();
      expect(state.lastOutboundAt).toBeNull();
      expect(state.peerCount).toBe(0);
      expect(state.messageCallbacks).toBeInstanceOf(Set);
      expect(state.watchInterval).toBeNull();
      expect(state.watchErrorCount).toBe(0);
      expect(state.pendingPairings).toBeInstanceOf(Map);
    });

    it("should initialize empty collections", () => {
      const state = getOrCreateAccountState(testAccountId);

      expect(state.messageCallbacks.size).toBe(0);
      expect(state.pendingPairings.size).toBe(0);
    });
  });

  describe("removeAccountState", () => {
    it("should remove existing account state", () => {
      getOrCreateAccountState(testAccountId);
      let allStates = getAllAccountStates();
      expect(allStates.has(testAccountId)).toBe(true);

      removeAccountState(testAccountId);

      allStates = getAllAccountStates();
      expect(allStates.has(testAccountId)).toBe(false);
    });

    it("should clear watch interval if set", () => {
      const state = getOrCreateAccountState(testAccountId);
      const mockInterval = setInterval(() => {}, 1000) as unknown as ReturnType<typeof setInterval>;
      state.watchInterval = mockInterval;

      // Should not throw
      expect(() => removeAccountState(testAccountId)).not.toThrow();
    });

    it("should clear message callbacks", () => {
      const state = getOrCreateAccountState(testAccountId);
      const mockCallback = vi.fn();
      state.messageCallbacks.add(mockCallback);

      removeAccountState(testAccountId);

      // State should be removed
      const allStates = getAllAccountStates();
      expect(allStates.has(testAccountId)).toBe(false);
    });

    it("should clear pendingPairings", () => {
      const state = getOrCreateAccountState(testAccountId);
      state.pendingPairings.set("alice", new Date());
      state.pendingPairings.set("bob", new Date());
      expect(state.pendingPairings.size).toBe(2);

      removeAccountState(testAccountId);

      // State should be removed
      const allStates = getAllAccountStates();
      expect(allStates.has(testAccountId)).toBe(false);
    });

    it("should handle removing unknown account gracefully", () => {
      // Should not throw
      expect(() => removeAccountState("unknown-account")).not.toThrow();
    });

    it("should handle removing already removed account", () => {
      getOrCreateAccountState(testAccountId);
      removeAccountState(testAccountId);

      // Should not throw when removing again
      expect(() => removeAccountState(testAccountId)).not.toThrow();
    });
  });

  describe("getAllAccountStates", () => {
    it("should return empty map when no accounts", () => {
      const states = getAllAccountStates();
      expect(states.size).toBe(0);
    });

    it("should return all account states", () => {
      getOrCreateAccountState("account1");
      getOrCreateAccountState("account2");
      getOrCreateAccountState("account3");

      const states = getAllAccountStates();
      expect(states.size).toBe(3);
      expect(states.has("account1")).toBe(true);
      expect(states.has("account2")).toBe(true);
      expect(states.has("account3")).toBe(true);
    });

    it("should reflect changes to state objects", () => {
      const state = getOrCreateAccountState(testAccountId);
      state.lastError = "test error";

      const states = getAllAccountStates();
      const retrievedState = states.get(testAccountId);
      expect(retrievedState?.lastError).toBe("test error");
    });
  });

  describe("initializeRuntime", () => {

    it("should initialize runtime for valid config", async () => {
      const initialized = await initializeRuntime(testConfig, testAccountId);

      expect(initialized).toBe(true);

      const state = getAllAccountStates().get(testAccountId);
      expect(state?.connected).toBe(true);
      expect(state?.meshConnected).toBe(true);
      expect(state?.peerCount).toBe(5);
      expect(state?.apiClient).toBeDefined();
    });

    it("should set config on state", async () => {
      await initializeRuntime(testConfig, testAccountId);

      const state = getAllAccountStates().get(testAccountId);
      expect(state?.config).toBe(testConfig);
    });

    it("should set lastStartAt when connected", async () => {
      await initializeRuntime(testConfig, testAccountId);

      const state = getAllAccountStates().get(testAccountId);
      // Note: lastStartAt is set by the gateway startAccount function, not initializeRuntime
      expect(state?.lastStartAt).toBeNull();
    });

    it("should handle mesh connection failure", async () => {
      // Override mock to return disconnected state wrapped in success Result
      mockApiState.getMeshInfo.mockResolvedValue(success({
        connected: false,
        endpoints: 0,
        errors: [],
      }));

      const initialized = await initializeRuntime(testConfig, testAccountId);

      expect(initialized).toBe(false);

      const state = getAllAccountStates().get(testAccountId);
      // Note: state.connected is true because apiClient was created successfully
      // But meshConnected is false because mesh is not connected
      expect(state?.connected).toBe(true);
      expect(state?.meshConnected).toBe(false);
      expect(state?.lastError).toBeDefined();
    });

    it("should retry mesh connection check", async () => {
      let attempts = 0;
      mockApiState.getMeshInfo.mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          return success({ connected: false, endpoints: 0, errors: [] });
        }
        return success({ connected: true, endpoints: 5, errors: [] });
      });

      const initialized = await initializeRuntime(testConfig, testAccountId);

      expect(initialized).toBe(true);
      expect(attempts).toBe(3);
    });
  });

  describe("stopRuntime", () => {

    it("should stop runtime for account", async () => {
      // First initialize
      await initializeRuntime(testConfig, testAccountId);
      const state = getAllAccountStates().get(testAccountId);
      expect(state?.connected).toBe(true);

      // Then stop
      await stopRuntime(testAccountId);

      const stoppedState = getAllAccountStates().get(testAccountId);
      expect(stoppedState?.connected).toBe(false);
      expect(stoppedState?.meshConnected).toBe(false);
      expect(stoppedState?.apiClient).toBeNull();
    });

    it("should clear watch interval if set", async () => {
      await initializeRuntime(testConfig, testAccountId);
      const state = getAllAccountStates().get(testAccountId);

      const mockInterval = setInterval(() => {}, 1000);
      state!.watchInterval = mockInterval;

      await stopRuntime(testAccountId);

      expect(state!.watchInterval).toBeNull();
    });

    it("should clear message callbacks", async () => {
      await initializeRuntime(testConfig, testAccountId);
      const state = getAllAccountStates().get(testAccountId);
      const mockCallback = vi.fn();
      state!.messageCallbacks.add(mockCallback);

      await stopRuntime(testAccountId);

      expect(state!.messageCallbacks.size).toBe(0);
    });

    it("should clear pendingPairings", async () => {
      await initializeRuntime(testConfig, testAccountId);
      const state = getAllAccountStates().get(testAccountId);
      state!.pendingPairings.set("alice", new Date());
      state!.pendingPairings.set("bob", new Date());
      expect(state!.pendingPairings.size).toBe(2);

      await stopRuntime(testAccountId);

      expect(state!.pendingPairings.size).toBe(0);
    });

    it("should set lastStopAt", async () => {
      await initializeRuntime(testConfig, testAccountId);

      const beforeStop = new Date();
      await stopRuntime(testAccountId);

      const state = getAllAccountStates().get(testAccountId);
      expect(state?.lastStopAt).toBeDefined();
      expect(state!.lastStopAt!.getTime()).toBeGreaterThanOrEqual(beforeStop.getTime());
    });

    it("should flush message state store", async () => {
      const { getAccountMessageStateStore, disposeMessageStateStore } = await import("./store.js");
      const store = {
        flush: vi.fn(),
        flushAsync: vi.fn().mockResolvedValue(undefined),
        getWatermark: () => -1,
        getGlobalWatermark: vi.fn(() => 0),
        setWatermark: vi.fn(),
        getFileMetadata: vi.fn(() => ({})),
        setFileMetadata: vi.fn(),
        setFileMetadataBulk: vi.fn(),
        dispose: vi.fn(),
      };
      vi.mocked(getAccountMessageStateStore).mockReturnValue(store);
      vi.mocked(disposeMessageStateStore).mockImplementation(() => {
        store.dispose();
      });

      await initializeRuntime(testConfig, testAccountId);
      await stopRuntime(testAccountId);

      expect(store.flush).toHaveBeenCalled();
    });

    it("should handle stopping unknown account gracefully", async () => {
      // Should not throw
      await expect(stopRuntime("unknown-account")).resolves.toBeUndefined();
    });

    it("should handle stopping already stopped account", async () => {
      await initializeRuntime(testConfig, testAccountId);
      await stopRuntime(testAccountId);

      // Should not throw when stopping again
      await expect(stopRuntime(testAccountId)).resolves.toBeUndefined();
    });
  });

  describe("AccountRuntimeState interface", () => {
    it("should have all required properties", () => {
      const state = getOrCreateAccountState(testAccountId);

      expect(state).toHaveProperty("accountId");
      expect(state).toHaveProperty("config");
      expect(state).toHaveProperty("apiClient");
      expect(state).toHaveProperty("connected");
      expect(state).toHaveProperty("meshConnected");
      expect(state).toHaveProperty("lastError");
      expect(state).toHaveProperty("lastStartAt");
      expect(state).toHaveProperty("lastStopAt");
      expect(state).toHaveProperty("lastInboundAt");
      expect(state).toHaveProperty("lastOutboundAt");
      expect(state).toHaveProperty("peerCount");
      expect(state).toHaveProperty("messageCallbacks");
      expect(state).toHaveProperty("watchInterval");
      expect(state).toHaveProperty("watchErrorCount");
      expect(state).toHaveProperty("pendingPairings");
    });

    it("should allow modification of state properties", () => {
      const state = getOrCreateAccountState(testAccountId);

      state.connected = true;
      state.meshConnected = true;
      state.lastError = null;
      state.peerCount = 10;
      state.watchErrorCount = 3;

      expect(state.connected).toBe(true);
      expect(state.meshConnected).toBe(true);
      expect(state.lastError).toBeNull();
      expect(state.peerCount).toBe(10);
      expect(state.watchErrorCount).toBe(3);
    });
  });

  describe("multi-account management", () => {

    it("should manage multiple independent accounts", async () => {
      const config1 = { ...testConfig, username: "bot1" };
      const config2 = { ...testConfig, username: "bot2" };

      await initializeRuntime(config1, "account1");
      await initializeRuntime(config2, "account2");

      const state1 = getAllAccountStates().get("account1");
      const state2 = getAllAccountStates().get("account2");

      expect(state1?.config.username).toBe("bot1");
      expect(state2?.config.username).toBe("bot2");
      expect(state1).not.toBe(state2);
    });

    it("should stop one account without affecting others", async () => {
      const config1 = { ...testConfig, username: "bot1" };
      const config2 = { ...testConfig, username: "bot2" };

      await initializeRuntime(config1, "account1");
      await initializeRuntime(config2, "account2");

      await stopRuntime("account1");

      const state1 = getAllAccountStates().get("account1");
      const state2 = getAllAccountStates().get("account2");

      expect(state1?.connected).toBe(false);
      expect(state2?.connected).toBe(true);
    });
  });

  // ============================================================================
  // Race Condition Tests - Concurrent Account Initialization
  // ============================================================================

  describe("concurrent account initialization", () => {
    it("should handle concurrent getOrCreateAccountState calls", async () => {
      const concurrentCalls = 10;
      const results: AccountRuntimeState[] = [];

      // Simulate concurrent creation of the same account
      const promises = Array(concurrentCalls)
        .fill(null)
        .map(() => {
          const state = getOrCreateAccountState("race-test-account");
          results.push(state);
          return Promise.resolve(state);
        });

      await Promise.all(promises);

      // All calls should return the same state instance
      const uniqueStates = new Set(results);
      expect(uniqueStates.size).toBe(1);
    });

    it("should handle concurrent initializeRuntime for same account", async () => {
      const accountId = "concurrent-init-account";

      // Simulate two concurrent initialization calls
      const [result1, result2] = await Promise.all([
        initializeRuntime({ ...testConfig, username: "bot1" }, accountId),
        initializeRuntime({ ...testConfig, username: "bot2" }, accountId),
      ]);

      // Both should succeed
      expect(result1).toBe(true);
      expect(result2).toBe(true);

      // State should have one of the configs (last write wins in current impl)
      const state = getAllAccountStates().get(accountId);
      expect(state?.config.username).toMatch(/^bot[12]$/);
    });

    it("should handle concurrent stopRuntime calls", async () => {
      const accountId = "concurrent-stop-account";

      await initializeRuntime(testConfig, accountId);

      // Simulate two concurrent stop calls
      await Promise.all([
        stopRuntime(accountId),
        stopRuntime(accountId),
      ]);

      // Should not throw, state should be stopped
      const state = getAllAccountStates().get(accountId);
      expect(state?.connected).toBe(false);
    });

    it("should handle concurrent removeAccountState calls", async () => {
      const accountId = "concurrent-remove-account";

      getOrCreateAccountState(accountId);

      // Simulate concurrent removal
      await Promise.all([
        Promise.resolve(removeAccountState(accountId)),
        Promise.resolve(removeAccountState(accountId)),
      ]);

      // Account should be removed
      const states = getAllAccountStates();
      expect(states.has(accountId)).toBe(false);
    });

    it("should handle interleaved initialize and stop", async () => {
      const accountId = "interleaved-account";

      // Start multiple init/stop in sequence rapidly
      await initializeRuntime(testConfig, accountId);
      await stopRuntime(accountId);
      await initializeRuntime(testConfig, accountId);
      await stopRuntime(accountId);

      // Final state should be stopped
      const state = getAllAccountStates().get(accountId);
      expect(state?.connected).toBe(false);
    });
  });

  describe("account removal during operations", () => {
    it("should handle removal while watch interval is active", async () => {
      const accountId = "remove-during-watch";

      // Create account and simulate watch interval
      const state = getOrCreateAccountState(accountId);
      state.watchInterval = setInterval(() => {}, 1000);

      // Remove account while interval is active
      removeAccountState(accountId);

      // Account should be removed and interval cleared
      expect(getAllAccountStates().has(accountId)).toBe(false);
      expect(state.watchInterval).toBe(null);

      // Cleanup
      clearInterval(state.watchInterval);
    });

    it("should handle removal while pending pairings exist", async () => {
      const accountId = "remove-during-pairing";

      // Create account with pending pairings
      const state = getOrCreateAccountState(accountId);
      state.pendingPairings.set("alice", new Date());
      state.pendingPairings.set("bob", new Date());
      state.pendingPairings.set("charlie", new Date());

      // Verify pairings exist
      expect(state.pendingPairings.size).toBe(3);

      // Remove account
      removeAccountState(accountId);

      // Account should be removed and pairings cleared
      expect(getAllAccountStates().has(accountId)).toBe(false);
    });

    it("should handle removal while message callbacks are registered", async () => {
      const accountId = "remove-during-callback";

      // Create account with message callbacks
      const state = getOrCreateAccountState(accountId);
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      state.messageCallbacks.add(callback1);
      state.messageCallbacks.add(callback2);

      // Verify callbacks exist
      expect(state.messageCallbacks.size).toBe(2);

      // Remove account
      removeAccountState(accountId);

      // Account should be removed and callbacks cleared
      expect(getAllAccountStates().has(accountId)).toBe(false);
    });

    it("should handle removal while allowFromCache is populated", async () => {
      const accountId = "remove-during-cache";

      // Create account with cache
      const state = getOrCreateAccountState(accountId);
      state.allowFromCache = {
        value: ["alice", "bob"],
        timestamp: Date.now(),
      };

      // Verify cache exists
      expect(state.allowFromCache).not.toBeNull();

      // Remove account
      removeAccountState(accountId);

      // Account should be removed and cache cleared
      expect(getAllAccountStates().has(accountId)).toBe(false);
    });

    it("should handle removal while groupPermissionCache is populated", async () => {
      const accountId = "remove-during-group-cache";

      // Create account with group permission cache
      const state = getOrCreateAccountState(accountId);
      state.groupPermissionCache = new Map([
        ["admin/test-group", {
          creator: "admin",
          group: "test-group",
          groupPolicy: "open",
          requireMention: false,
          allowFrom: [],
        }],
        ["user/other-group", {
          creator: "user",
          group: "other-group",
          groupPolicy: "allowlist",
          requireMention: true,
          allowFrom: ["alice", "bob"],
        }],
      ]);

      // Verify cache exists
      expect(state.groupPermissionCache?.size).toBe(2);

      // Remove account
      removeAccountState(accountId);

      // Account should be removed and cache cleared
      expect(getAllAccountStates().has(accountId)).toBe(false);
    });

    it("should handle concurrent removal and getOrCreate", async () => {
      const accountId = "concurrent-remove-create";

      // Create account first
      getOrCreateAccountState(accountId);

      // Simulate concurrent removal and recreation
      const [removeResult, createResult] = await Promise.all([
        Promise.resolve(removeAccountState(accountId)),
        Promise.resolve(getOrCreateAccountState(accountId)),
      ]);

      // Account should exist with fresh state
      const states = getAllAccountStates();
      expect(states.has(accountId)).toBe(true);
    });

    it("should handle rapid sequential remove and recreate", async () => {
      const accountId = "sequential-remove-create";

      // Rapidly create and remove multiple times
      for (let i = 0; i < 10; i++) {
        getOrCreateAccountState(accountId);
        removeAccountState(accountId);
      }

      // Final state should be removed
      expect(getAllAccountStates().has(accountId)).toBe(false);
    });

    it("should handle removal of non-existent account gracefully", () => {
      // Remove non-existent account should not throw
      expect(() => removeAccountState("non-existent-account")).not.toThrow();
      expect(getAllAccountStates().has("non-existent-account")).toBe(false);
    });
  });
});

describe("cleanupExpiredPairings", () => {
  beforeEach(() => {
    removeAccountState("cleanup-test");
  });

  afterEach(() => {
    removeAccountState("cleanup-test");
  });

  it("should return 0 when no accounts exist", () => {
    const result = cleanupExpiredPairings();
    expect(result).toBe(0);
  });

  it("should not remove fresh pairings", () => {
    const state = getOrCreateAccountState("cleanup-test");
    state.pendingPairings.set("alice", new Date());

    const result = cleanupExpiredPairings();
    expect(result).toBe(0);
    expect(state.pendingPairings.size).toBe(1);
  });

  it("should remove expired pairings", () => {
    const state = getOrCreateAccountState("cleanup-test");
    // Add expired pairing (older than 1 hour)
    const expiredTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
    state.pendingPairings.set("alice", expiredTime);

    const result = cleanupExpiredPairings();
    expect(result).toBe(1);
    expect(state.pendingPairings.size).toBe(0);
  });

  it("should only remove expired pairings from each account", () => {
    const state = getOrCreateAccountState("cleanup-test");
    // Add both fresh and expired
    state.pendingPairings.set("alice", new Date());
    state.pendingPairings.set("bob", new Date(Date.now() - 2 * 60 * 60 * 1000));

    const result = cleanupExpiredPairings();
    expect(result).toBe(1);
    expect(state.pendingPairings.size).toBe(1);
    expect(state.pendingPairings.has("alice")).toBe(true);
    expect(state.pendingPairings.has("bob")).toBe(false);
  });
});

describe("clearAllowFromCache", () => {
  beforeEach(() => {
    removeAccountState("cache-test");
  });

  afterEach(() => {
    removeAccountState("cache-test");
  });

  it("should clear allowFromCache for existing account", () => {
    const state = getOrCreateAccountState("cache-test");
    state.allowFromCache = { value: ["alice", "bob"], timestamp: Date.now() };

    clearAllowFromCache("cache-test");

    expect(state.allowFromCache).toBeNull();
  });

  it("should handle non-existent account gracefully", () => {
    expect(() => clearAllowFromCache("non-existent")).not.toThrow();
  });
});

describe("getGroupPermissionCached", () => {
  beforeEach(() => {
    removeAccountState("group-perm-test");
  });

  afterEach(() => {
    removeAccountState("group-perm-test");
  });

  it("should return permissions without cache when no state exists", () => {
    const result = getGroupPermissionCached("non-existent", "creator", "group", testConfig);
    expect(result).toBeDefined();
  });

  it("should cache permissions after first call", () => {
    const state = getOrCreateAccountState("group-perm-test");

    const result1 = getGroupPermissionCached("group-perm-test", "creator", "group1", testConfig);
    const result2 = getGroupPermissionCached("group-perm-test", "creator", "group1", testConfig);

    // Second call should use cache
    expect(state.groupPermissionCache?.has("creator/group1")).toBe(true);
    expect(result1).toEqual(result2);
  });

  it("should handle different groups separately", () => {
    const state = getOrCreateAccountState("group-perm-test");

    getGroupPermissionCached("group-perm-test", "creator", "group1", testConfig);
    getGroupPermissionCached("group-perm-test", "creator", "group2", testConfig);

    expect(state.groupPermissionCache?.size).toBe(2);
  });
});

describe("clearGroupPermissionCache", () => {
  beforeEach(() => {
    removeAccountState("clear-group-test");
  });

  afterEach(() => {
    removeAccountState("clear-group-test");
  });

  it("should clear group permission cache for existing account", () => {
    const state = getOrCreateAccountState("clear-group-test");

    // Populate cache
    getGroupPermissionCached("clear-group-test", "creator", "group1", testConfig);
    expect(state.groupPermissionCache?.size).toBe(1);

    clearGroupPermissionCache("clear-group-test");
    expect(state.groupPermissionCache?.size).toBe(0);
  });

  it("should handle non-existent account gracefully", () => {
    expect(() => clearGroupPermissionCache("non-existent")).not.toThrow();
  });
});
