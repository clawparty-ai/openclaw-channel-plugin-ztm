// Integration tests for Gateway - Account Lifecycle
// Tests for full account lifecycle: start, send, logout

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testConfig, testAccountId } from '../test-utils/fixtures.js';
import { sendTextGateway, logoutAccountGateway } from './gateway.js';

// Mock all dependencies
vi.mock('./config.js', () => ({
  resolveZTMChatAccount: vi.fn(config => ({
    config,
    accountId: config?.accountId || 'default',
  })),
}));

vi.mock('../runtime/state.js', () => ({
  getAllAccountStates: vi.fn(),
  initializeRuntime: vi.fn().mockResolvedValue(true),
  stopRuntime: vi.fn().mockResolvedValue(undefined),
  removeAccountState: vi.fn(),
  getOrCreateAccountState: vi.fn(),
}));

vi.mock('../messaging/outbound.js', () => ({
  sendZTMMessage: vi.fn().mockResolvedValue({ ok: true }),
  generateMessageId: vi.fn(() => 'test-msg-id'),
}));

vi.mock('../messaging/watcher.js', () => ({
  startMessageWatcher: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../di/index.js', () => ({
  DEPENDENCIES: {
    MESSAGING_CONTEXT: Symbol('ztm:messaging-context'),
  },
  container: {
    get: vi.fn(key => {
      if (String(key).includes('ztm:messaging-context')) {
        return {
          allowFromRepo: {
            getAllowFrom: vi.fn(() => Promise.resolve([])),
            clearCache: vi.fn(),
          },
          messageStateRepo: {
            getWatermark: vi.fn(() => 0),
            setWatermark: vi.fn(),
            flush: vi.fn(),
          },
        };
      }
      return null;
    }),
  },
}));

vi.mock('./connectivity-manager.js', () => ({
  validateAgentConnectivity: vi.fn().mockResolvedValue({ ok: true }),
  loadOrRequestPermit: vi.fn().mockResolvedValue({ token: 'test-token' }),
  joinMeshIfNeeded: vi.fn().mockResolvedValue(undefined),
  probeAccount: vi.fn().mockResolvedValue({ ok: true, error: null }),
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

describe('Gateway Account Lifecycle Integration', () => {
  describe('sendTextGateway', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should send message to valid peer', async () => {
      // Setup mock state
      const { getAllAccountStates } = await import('../runtime/state.js');
      const mockState = {
        accountId: testAccountId,
        config: testConfig,
        connected: true,
        meshConnected: true,
        messageCallbacks: new Set(),
        lastStartAt: new Date(),
      };
      (getAllAccountStates as ReturnType<typeof vi.fn>).mockReturnValue(
        new Map([[testAccountId, mockState]])
      );

      const result = await sendTextGateway({
        to: 'alice',
        text: 'Hello world',
        accountId: testAccountId,
      });

      expect(result.ok).toBe(true);
      expect(result.messageId).toBe('test-msg-id');
    });

    it('should handle ztm-chat: prefix in recipient', async () => {
      const { getAllAccountStates } = await import('../runtime/state.js');
      const mockState = {
        accountId: testAccountId,
        config: testConfig,
        connected: true,
        meshConnected: true,
        messageCallbacks: new Set(),
        lastStartAt: new Date(),
      };
      (getAllAccountStates as ReturnType<typeof vi.fn>).mockReturnValue(
        new Map([[testAccountId, mockState]])
      );

      const result = await sendTextGateway({
        to: 'ztm-chat:alice',
        text: 'Hello',
        accountId: testAccountId,
      });

      expect(result.ok).toBe(true);
    });

    it('should fail when account not initialized', async () => {
      const { getAllAccountStates } = await import('../runtime/state.js');
      (getAllAccountStates as ReturnType<typeof vi.fn>).mockReturnValue(new Map());

      const result = await sendTextGateway({
        to: 'alice',
        text: 'Hello',
        accountId: 'nonexistent',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Account not initialized');
    });

    it('should use default accountId when not provided', async () => {
      const { getAllAccountStates } = await import('../runtime/state.js');
      const mockState = {
        accountId: 'default',
        config: testConfig,
        connected: true,
        meshConnected: true,
        messageCallbacks: new Set(),
        lastStartAt: new Date(),
      };
      (getAllAccountStates as ReturnType<typeof vi.fn>).mockReturnValue(
        new Map([['default', mockState]])
      );

      const result = await sendTextGateway({
        to: 'alice',
        text: 'Hello',
      });

      expect(result.ok).toBe(true);
    });
  });

  describe('logoutAccountGateway', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should logout and clear account state', async () => {
      const { stopRuntime, removeAccountState } = await import('../runtime/state.js');

      const result = await logoutAccountGateway({
        accountId: testAccountId,
      });

      expect(result.cleared).toBe(true);
      expect(stopRuntime).toHaveBeenCalledWith(testAccountId);
      expect(removeAccountState).toHaveBeenCalledWith(testAccountId);
    });

    it('should handle logout for any accountId', async () => {
      const { stopRuntime, removeAccountState } = await import('../runtime/state.js');

      const result = await logoutAccountGateway({
        accountId: 'custom-account',
      });

      expect(result.cleared).toBe(true);
      expect(stopRuntime).toHaveBeenCalledWith('custom-account');
      expect(removeAccountState).toHaveBeenCalledWith('custom-account');
    });
  });

  describe('account lifecycle flow', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should complete full lifecycle: start -> send -> logout', async () => {
      // Step 1: Setup initial state for send
      const { getAllAccountStates, initializeRuntime, stopRuntime } =
        await import('../runtime/state.js');

      const mockState = {
        accountId: testAccountId,
        config: testConfig,
        connected: true,
        meshConnected: true,
        messageCallbacks: new Set(),
        lastStartAt: new Date(),
      };
      (getAllAccountStates as ReturnType<typeof vi.fn>).mockReturnValue(
        new Map([[testAccountId, mockState]])
      );
      (initializeRuntime as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      // Step 2: Send a message
      const sendResult = await sendTextGateway({
        to: 'alice',
        text: 'Test message',
        accountId: testAccountId,
      });

      expect(sendResult.ok).toBe(true);

      // Step 3: Logout
      const logoutResult = await logoutAccountGateway({
        accountId: testAccountId,
      });

      expect(logoutResult.cleared).toBe(true);
      expect(stopRuntime).toHaveBeenCalledWith(testAccountId);
    });

    it('should handle multiple accounts independently', async () => {
      const { getAllAccountStates, stopRuntime, removeAccountState } =
        await import('../runtime/state.js');

      // Setup two account states
      const state1 = { accountId: 'account-1', config: testConfig, connected: true };
      const state2 = { accountId: 'account-2', config: testConfig, connected: true };

      (getAllAccountStates as ReturnType<typeof vi.fn>).mockReturnValue(
        new Map([
          ['account-1', state1 as any],
          ['account-2', state2 as any],
        ])
      );

      // Send from account 1
      const result1 = await sendTextGateway({
        to: 'alice',
        text: 'From account 1',
        accountId: 'account-1',
      });
      expect(result1.ok).toBe(true);

      // Send from account 2
      const result2 = await sendTextGateway({
        to: 'bob',
        text: 'From account 2',
        accountId: 'account-2',
      });
      expect(result2.ok).toBe(true);

      // Logout account 1 only
      await logoutAccountGateway({ accountId: 'account-1' });

      // Verify only account 1 was stopped
      expect(stopRuntime).toHaveBeenCalledWith('account-1');
      expect(removeAccountState).toHaveBeenCalledWith('account-1');
      expect(stopRuntime).not.toHaveBeenCalledWith('account-2');
    });
  });
});
