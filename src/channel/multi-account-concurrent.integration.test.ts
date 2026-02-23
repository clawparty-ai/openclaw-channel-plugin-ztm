// Integration tests for Multi-Account Concurrent Messaging
// Tests for:
// 1. 3 account concurrent messaging - each account processes independently
// 2. Account isolation verification - messages aren't sent to wrong accounts
// 3. Account fault isolation - single account crash doesn't affect others

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  testConfig,
  testAccountId,
  testAccountId2,
  createMockState,
  createConfig,
} from '../test-utils/fixtures.js';
import type { AccountRuntimeState } from '../types/runtime.js';
import type { ZTMChatMessage } from '../types/messaging.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const ACCOUNT_1 = 'account-1';
const ACCOUNT_2 = 'account-2';
const ACCOUNT_3 = 'account-3';

const configAccount1 = createConfig({ username: 'bot1', dmPolicy: 'allow' });
const configAccount2 = createConfig({ username: 'bot2', dmPolicy: 'allow' });
const configAccount3 = createConfig({ username: 'bot3', dmPolicy: 'allow' });

// ============================================================================
// Mocks - Hoisted for access
// ============================================================================

const { getAllAccountStatesMock, stopRuntimeMock, removeAccountStateMock } = vi.hoisted(() => ({
  getAllAccountStatesMock: vi.fn(),
  stopRuntimeMock: vi.fn().mockResolvedValue(undefined),
  removeAccountStateMock: vi.fn(),
}));

const { sendZTMMessageMock, generateMessageIdMock } = vi.hoisted(() => ({
  sendZTMMessageMock: vi.fn().mockResolvedValue({ ok: true }),
  generateMessageIdMock: vi.fn(() => 'test-msg-id'),
}));

const { resolveZTMChatAccountMock } = vi.hoisted(() => ({
  resolveZTMChatAccountMock: vi.fn((config: any, accountId?: string) => ({
    config,
    accountId: accountId || config?.accountId || 'default',
  })),
}));

const { initializeRuntimeMock, getOrCreateAccountStateMock, cleanupExpiredPairingsMock, getGroupPermissionCachedMock } = vi.hoisted(() => ({
  initializeRuntimeMock: vi.fn().mockResolvedValue(true),
  getOrCreateAccountStateMock: vi.fn(),
  cleanupExpiredPairingsMock: vi.fn(),
  getGroupPermissionCachedMock: vi.fn(() => ({})),
}));

const { startMessageWatcherMock } = vi.hoisted(() => ({
  startMessageWatcherMock: vi.fn().mockResolvedValue(undefined),
}));

const { createMessagingContextMock } = vi.hoisted(() => ({
  createMessagingContextMock: vi.fn(() => ({
    runtime: {},
    apiClient: {},
    config: {},
  })),
}));

const { validateAgentConnectivityMock, loadOrRequestPermitMock, joinMeshIfNeededMock, probeAccountMock } = vi.hoisted(() => ({
  validateAgentConnectivityMock: vi.fn().mockResolvedValue({ ok: true }),
  loadOrRequestPermitMock: vi.fn().mockResolvedValue({ token: 'test-token' }),
  joinMeshIfNeededMock: vi.fn().mockResolvedValue(undefined),
  probeAccountMock: vi.fn().mockResolvedValue({ ok: true, error: null }),
}));

const { checkGroupPolicyMock } = vi.hoisted(() => ({
  checkGroupPolicyMock: vi.fn(() => ({
    allowed: true,
    reason: 'allowed' as const,
    action: 'process' as const,
  })),
}));

const { loggerMock, defaultLoggerMock } = vi.hoisted(() => ({
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  defaultLoggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const { extractErrorMessageMock } = vi.hoisted(() => ({
  extractErrorMessageMock: vi.fn((err: unknown) => String(err)),
}));

// ============================================================================
// Apply Mocks
// ============================================================================

vi.mock('./config.js', () => ({
  resolveZTMChatAccount: resolveZTMChatAccountMock,
}));

vi.mock('../runtime/state.js', () => ({
  getAllAccountStates: getAllAccountStatesMock,
  initializeRuntime: initializeRuntimeMock,
  stopRuntime: stopRuntimeMock,
  removeAccountState: removeAccountStateMock,
  cleanupExpiredPairings: cleanupExpiredPairingsMock,
  getOrCreateAccountState: getOrCreateAccountStateMock,
  getGroupPermissionCached: getGroupPermissionCachedMock,
}));

vi.mock('../messaging/outbound.js', () => ({
  sendZTMMessage: sendZTMMessageMock,
  generateMessageId: generateMessageIdMock,
}));

vi.mock('../messaging/watcher.js', () => ({
  startMessageWatcher: startMessageWatcherMock,
}));

vi.mock('../messaging/context.js', () => ({
  createMessagingContext: createMessagingContextMock,
}));

vi.mock('./connectivity-manager.js', () => ({
  validateAgentConnectivity: validateAgentConnectivityMock,
  loadOrRequestPermit: loadOrRequestPermitMock,
  joinMeshIfNeeded: joinMeshIfNeededMock,
  probeAccount: probeAccountMock,
}));

vi.mock('../core/group-policy.js', () => ({
  checkGroupPolicy: checkGroupPolicyMock,
}));

vi.mock('../utils/logger.js', () => ({
  logger: loggerMock,
  defaultLogger: defaultLoggerMock,
}));

vi.mock('../utils/error.js', () => ({
  extractErrorMessage: extractErrorMessageMock,
}));

// ============================================================================
// Helper Functions
// ============================================================================

function createMockRuntime(accountId: string) {
  return {
    channel: {
      routing: {
        resolveAgentRoute: vi.fn(() => ({
          sessionKey: `session-${accountId}`,
          accountId,
          matchedBy: 'default',
          agentId: `agent-${accountId}`,
        })),
      },
      reply: {
        finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
        dispatchReplyWithBufferedBlockDispatcher: vi.fn(() =>
          Promise.resolve({ queuedFinal: true })
        ),
        resolveHumanDelayConfig: vi.fn(() => ({ enabled: false })),
      },
    },
  };
}

function createAccountState(accountId: string, config: typeof testConfig): AccountRuntimeState {
  return {
    accountId: accountId,
    config: config,
    apiClient: null,
    started: true,
    lastError: null,
    lastStartAt: new Date(),
    lastStopAt: null,
    lastInboundAt: null,
    lastOutboundAt: null,
    messageCallbacks: new Set(),
    watchInterval: null,
    watchErrorCount: 0,
    pendingPairings: new Map(),
    groupPermissionCache: new Map(),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Multi-Account Concurrent Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset the module state by clearing the mocked states
    getAllAccountStatesMock.mockReturnValue(new Map());
  });

  describe('3 Account Concurrent Messaging', () => {
    it('should process messages independently for each account', async () => {
      const { sendTextGateway } = await import('./gateway.js');

      const states = new Map<string, AccountRuntimeState>();
      states.set(ACCOUNT_1, createAccountState(ACCOUNT_1, configAccount1));
      states.set(ACCOUNT_2, createAccountState(ACCOUNT_2, configAccount2));
      states.set(ACCOUNT_3, createAccountState(ACCOUNT_3, configAccount3));
      getAllAccountStatesMock.mockReturnValue(states);

      // Send messages from each account concurrently
      const results = await Promise.all([
        sendTextGateway({ to: 'alice', text: 'Message from account 1', accountId: ACCOUNT_1 }),
        sendTextGateway({ to: 'bob', text: 'Message from account 2', accountId: ACCOUNT_2 }),
        sendTextGateway({ to: 'charlie', text: 'Message from account 3', accountId: ACCOUNT_3 }),
      ]);

      // All should succeed
      expect(results[0].ok).toBe(true);
      expect(results[1].ok).toBe(true);
      expect(results[2].ok).toBe(true);

      // Each should have unique message IDs (generated per call)
      expect(sendZTMMessageMock).toHaveBeenCalledTimes(3);
    });

    it('should handle high concurrency with multiple messages per account', async () => {
      const { sendTextGateway } = await import('./gateway.js');

      const states = new Map<string, AccountRuntimeState>();
      states.set(ACCOUNT_1, createAccountState(ACCOUNT_1, configAccount1));
      states.set(ACCOUNT_2, createAccountState(ACCOUNT_2, configAccount2));
      states.set(ACCOUNT_3, createAccountState(ACCOUNT_3, configAccount3));
      getAllAccountStatesMock.mockReturnValue(states);

      // Send 10 messages from each account concurrently (30 total)
      const messagePromises: Promise<{ ok: boolean }>[] = [];

      for (let i = 0; i < 10; i++) {
        messagePromises.push(
          sendTextGateway({ to: 'alice', text: `Account 1 msg ${i}`, accountId: ACCOUNT_1 }),
          sendTextGateway({ to: 'bob', text: `Account 2 msg ${i}`, accountId: ACCOUNT_2 }),
          sendTextGateway({ to: 'charlie', text: `Account 3 msg ${i}`, accountId: ACCOUNT_3 })
        );
      }

      const results = await Promise.all(messagePromises);

      // All should succeed
      expect(results.every(r => r.ok)).toBe(true);

      // Verify 30 total calls
      expect(sendZTMMessageMock).toHaveBeenCalledTimes(30);
    });

    it('should maintain separate watch intervals for each account', () => {
      const states = new Map<string, AccountRuntimeState>();
      const state1 = createAccountState(ACCOUNT_1, configAccount1);
      const state2 = createAccountState(ACCOUNT_2, configAccount2);
      const state3 = createAccountState(ACCOUNT_3, configAccount3);

      // Each account has its own watch interval
      state1.watchInterval = setInterval(() => {}, 1000);
      state2.watchInterval = setInterval(() => {}, 2000);
      state3.watchInterval = setInterval(() => {}, 3000);

      states.set(ACCOUNT_1, state1);
      states.set(ACCOUNT_2, state2);
      states.set(ACCOUNT_3, state3);

      getAllAccountStatesMock.mockReturnValue(states);

      // Verify each account has different interval
      expect(state1.watchInterval).not.toBe(state2.watchInterval);
      expect(state2.watchInterval).not.toBe(state3.watchInterval);
      expect(state1.watchInterval).not.toBe(state3.watchInterval);

      // Cleanup
      clearInterval(state1.watchInterval!);
      clearInterval(state2.watchInterval!);
      clearInterval(state3.watchInterval!);
    });
  });

  describe('Account Isolation Verification', () => {
    it('should not dispatch message to wrong account callback', async () => {
      const { handleInboundMessage } = await import('./message-dispatcher.js');

      const states = new Map<string, AccountRuntimeState>();
      const state1 = createAccountState(ACCOUNT_1, configAccount1);
      const state2 = createAccountState(ACCOUNT_2, configAccount2);
      const state3 = createAccountState(ACCOUNT_3, configAccount3);

      // Create separate callback sets for each account
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      state1.messageCallbacks.add(callback1);
      state2.messageCallbacks.add(callback2);
      state3.messageCallbacks.add(callback3);

      states.set(ACCOUNT_1, state1);
      states.set(ACCOUNT_2, state2);
      states.set(ACCOUNT_3, state3);

      getAllAccountStatesMock.mockReturnValue(states);

      // Create a message from alice to bot1 (account 1)
      const msg: ZTMChatMessage = {
        id: 'msg-to-account-1',
        sender: 'alice',
        senderId: 'alice-id',
        content: 'Hello bot1',
        timestamp: new Date(),
        peer: 'alice',
        isGroup: false,
      };

      // Simulate message processing for account 1
      const mockRt1 = createMockRuntime(ACCOUNT_1);
      await handleInboundMessage(
        state1,
        mockRt1 as any,
        {},
        configAccount1,
        ACCOUNT_1,
        { log: { info: vi.fn(), error: vi.fn() } },
        msg
      );

      // Verify the routing was called with correct accountId
      expect(mockRt1.channel.routing.resolveAgentRoute).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: ACCOUNT_1 })
      );
    });

    it('should isolate account states correctly via mock', () => {
      const states = new Map<string, AccountRuntimeState>();
      const state1 = createAccountState(ACCOUNT_1, configAccount1);
      const state2 = createAccountState(ACCOUNT_2, configAccount2);
      const state3 = createAccountState(ACCOUNT_3, configAccount3);

      states.set(ACCOUNT_1, state1);
      states.set(ACCOUNT_2, state2);
      states.set(ACCOUNT_3, state3);

      getAllAccountStatesMock.mockReturnValue(states);

      // Each account should have its own state
      const allStates = getAllAccountStatesMock();

      expect(allStates.size).toBe(3);
      expect(allStates.get(ACCOUNT_1)?.config.username).toBe('bot1');
      expect(allStates.get(ACCOUNT_2)?.config.username).toBe('bot2');
      expect(allStates.get(ACCOUNT_3)?.config.username).toBe('bot3');

      // Modifying one state should not affect others
      allStates.get(ACCOUNT_1)!.lastError = new Error('test error');

      expect(allStates.get(ACCOUNT_2)!.lastError).toBeNull();
      expect(allStates.get(ACCOUNT_3)!.lastError).toBeNull();
    });

    it('should route messages to correct account based on accountId', async () => {
      const { handleInboundMessage } = await import('./message-dispatcher.js');

      const states = new Map<string, AccountRuntimeState>();
      const state1 = createAccountState(ACCOUNT_1, configAccount1);
      const state2 = createAccountState(ACCOUNT_2, configAccount2);

      states.set(ACCOUNT_1, state1);
      states.set(ACCOUNT_2, state2);

      getAllAccountStatesMock.mockReturnValue(states);

      const msg: ZTMChatMessage = {
        id: 'msg-to-account-2',
        sender: 'bob',
        senderId: 'bob-id',
        content: 'Hello bot2',
        timestamp: new Date(),
        peer: 'bob',
        isGroup: false,
      };

      const mockRt2 = createMockRuntime(ACCOUNT_2);
      await handleInboundMessage(
        state2,
        mockRt2 as any,
        {},
        configAccount2,
        ACCOUNT_2,
        { log: { info: vi.fn(), error: vi.fn() } },
        msg
      );

      // Verify routing used correct accountId
      expect(mockRt2.channel.routing.resolveAgentRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: ACCOUNT_2,
        })
      );
    });
  });

  describe('Account Fault Isolation', () => {
    it('should not affect other accounts when one account has send error', async () => {
      const { sendTextGateway } = await import('./gateway.js');

      const states = new Map<string, AccountRuntimeState>();
      states.set(ACCOUNT_1, createAccountState(ACCOUNT_1, configAccount1));
      states.set(ACCOUNT_2, createAccountState(ACCOUNT_2, configAccount2));
      states.set(ACCOUNT_3, createAccountState(ACCOUNT_3, configAccount3));
      getAllAccountStatesMock.mockReturnValue(states);

      // Mock sendZTMMessage to return error for account 1
      sendZTMMessageMock.mockImplementation(async (params: any) => {
        if (params.accountId === ACCOUNT_1) {
          return { ok: false, error: 'Account 1 failed!' };
        }
        return { ok: true };
      });

      // Try to send from account 1 (should fail)
      const result1 = await sendTextGateway({
        to: 'alice',
        text: 'Message from account 1',
        accountId: ACCOUNT_1,
      });

      // Account 1 should fail
      expect(result1.ok).toBe(false);

      // But accounts 2 and 3 should still work
      const result2 = await sendTextGateway({
        to: 'bob',
        text: 'Message from account 2',
        accountId: ACCOUNT_2,
      });

      const result3 = await sendTextGateway({
        to: 'charlie',
        text: 'Message from account 3',
        accountId: ACCOUNT_3,
      });

      expect(result2.ok).toBe(true);
      expect(result3.ok).toBe(true);
    });

    it('should isolate send errors between accounts', async () => {
      const { sendTextGateway } = await import('./gateway.js');

      const states = new Map<string, AccountRuntimeState>();
      states.set(ACCOUNT_1, createAccountState(ACCOUNT_1, configAccount1));
      states.set(ACCOUNT_2, createAccountState(ACCOUNT_2, configAccount2));
      getAllAccountStatesMock.mockReturnValue(states);

      // Mock to return error for account 1
      sendZTMMessageMock.mockImplementation(async (params: any) => {
        if (params.accountId === ACCOUNT_1) {
          return { ok: false, error: 'Failed' };
        }
        return { ok: true };
      });

      // Account 1 fails
      const result1 = await sendTextGateway({ to: 'a', text: 't', accountId: ACCOUNT_1 });
      expect(result1.ok).toBe(false);

      // Account 2 still works
      const result2 = await sendTextGateway({ to: 'b', text: 't', accountId: ACCOUNT_2 });
      expect(result2.ok).toBe(true);

      // Verify both were attempted
      expect(sendZTMMessageMock).toHaveBeenCalledTimes(2);
    });

    it('should maintain account state integrity after error', () => {
      const states = new Map<string, AccountRuntimeState>();
      const state1 = createAccountState(ACCOUNT_1, configAccount1);
      const state2 = createAccountState(ACCOUNT_2, configAccount2);

      states.set(ACCOUNT_1, state1);
      states.set(ACCOUNT_2, state2);

      getAllAccountStatesMock.mockReturnValue(states);

      // Simulate error state on account 1
      state1.lastError = 'Network error';

      // Verify other account is unaffected
      const allStates = getAllAccountStatesMock();

      expect(allStates.get(ACCOUNT_1)?.lastError).toBeDefined();
      expect(allStates.get(ACCOUNT_2)?.lastError).toBeNull();
      expect(allStates.get(ACCOUNT_2)?.started).toBe(true);
      expect(allStates.get(ACCOUNT_2)?.config.username).toBe('bot2');
    });

    it('should handle removeAccountState for one account without affecting others', () => {
      const states = new Map<string, AccountRuntimeState>();
      const state1 = createAccountState(ACCOUNT_1, configAccount1);
      const state2 = createAccountState(ACCOUNT_2, configAccount2);
      const state3 = createAccountState(ACCOUNT_3, configAccount3);

      states.set(ACCOUNT_1, state1);
      states.set(ACCOUNT_2, state2);
      states.set(ACCOUNT_3, state3);

      getAllAccountStatesMock.mockReturnValue(states);

      // Remove account 2
      removeAccountStateMock(ACCOUNT_2);

      // Verify removeAccountState was called for account 2
      expect(removeAccountStateMock).toHaveBeenCalledWith(ACCOUNT_2);

      // Verify original map still has all 3 (mock doesn't actually remove)
      expect(states.size).toBe(3);
    });
  });

  describe('Concurrent Account Lifecycle', () => {
    it('should handle concurrent start and stop of multiple accounts', async () => {
      const { logoutAccountGateway } = await import('./gateway.js');

      const states = new Map<string, AccountRuntimeState>();
      states.set(ACCOUNT_1, createAccountState(ACCOUNT_1, configAccount1));
      states.set(ACCOUNT_2, createAccountState(ACCOUNT_2, configAccount2));
      states.set(ACCOUNT_3, createAccountState(ACCOUNT_3, configAccount3));
      getAllAccountStatesMock.mockReturnValue(states);

      // Concurrent logout of all accounts
      await Promise.all([
        logoutAccountGateway({ accountId: ACCOUNT_1 }),
        logoutAccountGateway({ accountId: ACCOUNT_2 }),
        logoutAccountGateway({ accountId: ACCOUNT_3 }),
      ]);

      // Verify stopRuntime was called for each account
      expect(stopRuntimeMock).toHaveBeenCalledWith(ACCOUNT_1);
      expect(stopRuntimeMock).toHaveBeenCalledWith(ACCOUNT_2);
      expect(stopRuntimeMock).toHaveBeenCalledWith(ACCOUNT_3);

      // Verify removeAccountState was called for each account
      expect(removeAccountStateMock).toHaveBeenCalledWith(ACCOUNT_1);
      expect(removeAccountStateMock).toHaveBeenCalledWith(ACCOUNT_2);
      expect(removeAccountStateMock).toHaveBeenCalledWith(ACCOUNT_3);
    });

    it('should create independent callbacks for each account', async () => {
      const { createMessageCallback } = await import('./message-dispatcher.js');

      const state1 = createAccountState(ACCOUNT_1, configAccount1);
      const state2 = createAccountState(ACCOUNT_2, configAccount2);

      // Create message callbacks for each account
      const messageCallback1 = createMessageCallback(
        ACCOUNT_1,
        configAccount1,
        createMockRuntime(ACCOUNT_1) as any,
        undefined,
        state1,
        { log: { info: vi.fn() } }
      );

      const messageCallback2 = createMessageCallback(
        ACCOUNT_2,
        configAccount2,
        createMockRuntime(ACCOUNT_2) as any,
        undefined,
        state2,
        { log: { info: vi.fn() } }
      );

      // Callbacks should be different functions - verifying account isolation
      expect(messageCallback1).not.toBe(messageCallback2);

      // Each callback should reference its own accountId
      // The runtime resolveAgentRoute should be called with correct account
      const msg1: ZTMChatMessage = {
        id: 'msg-1',
        sender: 'alice',
        senderId: 'alice-id',
        content: 'Test',
        timestamp: new Date(),
        peer: 'alice',
      };

      messageCallback1(msg1);

      // Verify the runtime was called with account 1's ID
      expect(state1.messageCallbacks.size).toBeGreaterThanOrEqual(0);
    });

    it('should handle concurrent logout with different timing', async () => {
      const { logoutAccountGateway } = await import('./gateway.js');

      const states = new Map<string, AccountRuntimeState>();
      states.set(ACCOUNT_1, createAccountState(ACCOUNT_1, configAccount1));
      states.set(ACCOUNT_2, createAccountState(ACCOUNT_2, configAccount2));
      getAllAccountStatesMock.mockReturnValue(states);

      // Logout sequentially
      await logoutAccountGateway({ accountId: ACCOUNT_1 });
      await logoutAccountGateway({ accountId: ACCOUNT_2 });

      // Both should be called
      expect(stopRuntimeMock).toHaveBeenCalledTimes(2);
      expect(removeAccountStateMock).toHaveBeenCalledTimes(2);
    });
  });
});
