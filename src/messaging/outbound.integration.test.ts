// Integration tests for Outbound Message Sending
// Tests for sendZTMMessage flow with runtime state, validation, and error handling

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sendZTMMessage, generateMessageId } from './outbound.js';
import type { AccountRuntimeState } from '../runtime/state.js';
import { testConfig } from '../test-utils/fixtures.js';
import { failure, success } from '../types/common.js';

// Mock logger
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

// Mock validation
vi.mock('../utils/validation.js', () => ({
  validateUsername: vi.fn((username: string) => {
    if (!username || username.length === 0) {
      return { valid: false, error: 'Username is required' };
    }
    if (username.includes(' ')) {
      return { valid: false, error: 'Username cannot contain spaces' };
    }
    if (username.length > 100) {
      return { valid: false, error: 'Username too long' };
    }
    return { valid: true };
  }),
}));

describe('Outbound Message Sending Integration', () => {
  let mockState: AccountRuntimeState;

  const createMockState = (overrides?: Partial<AccountRuntimeState>): AccountRuntimeState => ({
    accountId: 'test-account',
    config: testConfig,
    chatSender: {
      sendPeerMessage: vi.fn().mockResolvedValue(success(true)),
      sendGroupMessage: vi.fn().mockResolvedValue(success(true)),
    } as any,
    chatReader: null,
    discovery: null,
    messageCallbacks: new Set(),
    watchInterval: null,
    lastError: null,
    lastStartAt: null,
    lastStopAt: null,
    lastInboundAt: null,
    lastOutboundAt: null,
    watchErrorCount: 0,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockState = createMockState();
  });

  describe('sendZTMMessage', () => {
    it('should send peer message successfully', async () => {
      const result = await sendZTMMessage(mockState, 'alice', 'Hello World');

      expect(result.ok).toBe(true);
      expect(mockState.chatSender?.sendPeerMessage).toHaveBeenCalledWith(
        'alice',
        expect.objectContaining({
          message: 'Hello World',
          sender: testConfig.username,
        })
      );
      expect(mockState.lastOutboundAt).not.toBeNull();
    });

    it('should send group message successfully', async () => {
      const groupInfo = { creator: 'admin', group: 'developers' };
      const result = await sendZTMMessage(mockState, 'admin', 'Hello Group', groupInfo);

      expect(result.ok).toBe(true);
      expect(mockState.chatSender?.sendGroupMessage).toHaveBeenCalledWith(
        'admin',
        'developers',
        expect.objectContaining({
          message: 'Hello Group',
          sender: testConfig.username,
        })
      );
      expect(mockState.lastOutboundAt).not.toBeNull();
    });

    it('should return failure when runtime not initialized', async () => {
      const uninitializedState = createMockState({
        config: null as any,
        chatReader: null,
        chatSender: null,
        discovery: null,
      });

      const result = await sendZTMMessage(uninitializedState, 'alice', 'Hello');

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(uninitializedState.lastError).toContain('Runtime not initialized');
    });

    it('should validate peer username', async () => {
      const result = await sendZTMMessage(mockState, '', 'Hello');

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should validate peer username with spaces', async () => {
      const result = await sendZTMMessage(mockState, 'alice bob', 'Hello');

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle send message failure', async () => {
      (mockState.chatSender?.sendPeerMessage as any).mockResolvedValue(
        failure(new Error('Network error'))
      );

      const result = await sendZTMMessage(mockState, 'alice', 'Hello');

      expect(result.ok).toBe(false);
      expect(mockState.lastError).toContain('Network error');
    });

    it('should update lastOutboundAt on successful send', async () => {
      const before = new Date();
      await sendZTMMessage(mockState, 'alice', 'Hello');
      const after = new Date();

      expect(mockState.lastOutboundAt).toBeInstanceOf(Date);
      expect(mockState.lastOutboundAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(mockState.lastOutboundAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should include sender username in message', async () => {
      await sendZTMMessage(mockState, 'alice', 'Hello');

      expect(mockState.chatSender?.sendPeerMessage).toHaveBeenCalledWith(
        'alice',
        expect.objectContaining({
          sender: testConfig.username,
        })
      );
    });

    it('should include timestamp in message', async () => {
      await sendZTMMessage(mockState, 'alice', 'Hello');

      expect(mockState.chatSender?.sendPeerMessage).toHaveBeenCalledWith(
        'alice',
        expect.objectContaining({
          time: expect.any(Number),
        })
      );
    });
  });

  describe('generateMessageId', () => {
    it('should generate unique message IDs', () => {
      const id1 = generateMessageId();
      const id2 = generateMessageId();

      expect(id1).not.toBe(id2);
    });

    it('should include timestamp prefix', () => {
      const id = generateMessageId();

      expect(id).toMatch(/^ztm-\d+-/);
    });

    it('should include random hex part', () => {
      const id = generateMessageId();

      expect(id).toMatch(/ztm-\d+-[a-f0-9]+$/);
    });
  });

  describe('message sending with different configs', () => {
    it('should use config username as sender', async () => {
      const state = createMockState({
        config: { ...testConfig, username: 'custom-bot' },
      });

      await sendZTMMessage(state, 'alice', 'Hello');

      expect(state.chatSender?.sendPeerMessage).toHaveBeenCalledWith(
        'alice',
        expect.objectContaining({
          sender: 'custom-bot',
        })
      );
    });

    it('should handle missing optional fields', async () => {
      const state = createMockState({
        config: testConfig,
      });

      const result = await sendZTMMessage(state, 'alice', 'Hello');

      expect(result.ok).toBe(true);
    });
  });

  describe('error handling integration', () => {
    it('should log error on send failure', async () => {
      const { logger } = await import('../utils/logger.js');
      (mockState.chatSender?.sendPeerMessage as any).mockResolvedValue(
        failure(new Error('Connection refused'))
      );

      await sendZTMMessage(mockState, 'alice', 'Hello');

      expect(logger.warn).toHaveBeenCalled();
    });

    it('should set lastError on send failure', async () => {
      (mockState.chatSender?.sendPeerMessage as any).mockResolvedValue(
        failure(new Error('Test error'))
      );

      await sendZTMMessage(mockState, 'alice', 'Hello');

      expect(mockState.lastError).toBe('Test error');
    });

    it('should preserve previous lastOutboundAt on failure', async () => {
      mockState.lastOutboundAt = new Date('2024-01-01');
      (mockState.chatSender?.sendPeerMessage as any).mockResolvedValue(failure(new Error('Error')));

      await sendZTMMessage(mockState, 'alice', 'Hello');

      // lastOutboundAt should not be updated on failure
      expect(mockState.lastOutboundAt?.toISOString()).toBe('2024-01-01T00:00:00.000Z');
    });
  });
});
