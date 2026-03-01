// Integration tests for Runtime State Management
// Tests for full account lifecycle: create → initialize → use → stop → cleanup

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testConfig, testAccountId } from '../test-utils/fixtures.js';
import { success } from '../types/common.js';

// Mock dependencies
vi.mock('../api/ztm-api.js', () => ({
  createZTMApiClient: vi.fn(() => ({
    getMeshInfo: vi.fn().mockResolvedValue(success({ connected: true, peers: 5 })),
    getEndpointCount: vi.fn().mockResolvedValue(success(5)),
    getIdentity: vi.fn().mockResolvedValue(success('public-key-123')),
    getChats: vi.fn().mockResolvedValue(success([])),
    discoverUsers: vi.fn().mockResolvedValue(success([])),
    discoverPeers: vi.fn().mockResolvedValue(success([])),
    watchChanges: vi.fn().mockResolvedValue(success([])),
    listUsers: vi.fn().mockResolvedValue(success([])),
    getPeerMessages: vi.fn().mockResolvedValue(success([])),
    sendPeerMessage: vi.fn().mockResolvedValue(success(true)),
    getGroupMessages: vi.fn().mockResolvedValue(success([])),
    sendGroupMessage: vi.fn().mockResolvedValue(success(true)),
  })),
}));

vi.mock('./store.js', () => ({
  getAccountMessageStateStore: vi.fn(() => ({
    getWatermark: vi.fn().mockReturnValue(0),
    setWatermark: vi.fn().mockResolvedValue(undefined),
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
    flush: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn(),
  })),
}));

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
  getZTMRuntime: vi.fn(),
  isRuntimeInitialized: vi.fn(() => false),
  setZTMRuntime: vi.fn(),
}));

describe('Runtime State Management Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('account lifecycle flow', () => {
    it('should complete full lifecycle: getOrCreate → initialize → stop → remove', async () => {
      const {
        getOrCreateAccountState,
        initializeRuntime,
        stopRuntime,
        removeAccountState,
        getAllAccountStates,
      } = await import('./state.js');

      // Step 1: Get or create account state
      const state = getOrCreateAccountState(testAccountId);

      expect(state).toBeDefined();
      expect(state.accountId).toBe(testAccountId);

      // Step 2: Initialize runtime
      const initialized = await initializeRuntime(state.config, testAccountId);

      expect(initialized).toBe(true);

      // Verify state in map
      const allStates = getAllAccountStates();
      expect(allStates.has(testAccountId)).toBe(true);
      expect(allStates.get(testAccountId)).toBe(state);

      // Step 3: Stop runtime
      await stopRuntime(testAccountId);

      // Step 4: Remove state
      removeAccountState(testAccountId);

      const statesAfterRemove = getAllAccountStates();
      expect(statesAfterRemove.has(testAccountId)).toBe(false);
    });

    it('should handle multiple account lifecycles independently', async () => {
      const {
        getOrCreateAccountState,
        initializeRuntime,
        stopRuntime,
        removeAccountState,
        getAllAccountStates,
      } = await import('./state.js');

      const accountId1 = 'account-1';
      const accountId2 = 'account-2';

      // Create both accounts
      const state1 = getOrCreateAccountState(accountId1);
      const state2 = getOrCreateAccountState(accountId2);

      expect(state1.accountId).toBe(accountId1);
      expect(state2.accountId).toBe(accountId2);
      expect(state1).not.toBe(state2);

      // Initialize both
      await initializeRuntime(state1.config, accountId1);
      await initializeRuntime(state2.config, accountId2);

      // Verify both in map
      const allStates = getAllAccountStates();
      expect(allStates.size).toBe(2);

      // Stop only account 1
      await stopRuntime(accountId1);

      // Remove account 1
      removeAccountState(accountId1);

      const statesAfterRemove = getAllAccountStates();
      expect(statesAfterRemove.size).toBe(1);
      expect(statesAfterRemove.has(accountId1)).toBe(false);
      expect(statesAfterRemove.has(accountId2)).toBe(true);
    });
  });
});
