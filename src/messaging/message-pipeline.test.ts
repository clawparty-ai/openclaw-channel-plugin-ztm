// Unit tests for Inbound message processing

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processIncomingMessage } from './processor.js';
import { notifyMessageCallbacks } from './dispatcher.js';
import { checkDmPolicy } from '../core/dm-policy.js';
import { normalizeUsername } from '../utils/validation.js';
import { startMessageWatcher } from './watcher.js';
import { MAX_MESSAGE_LENGTH } from '../constants.js';
import type { ZTMChatMessage } from '../types/messaging.js';
import type { MessageCheckResult } from '../types/messaging.js';
import { testConfig, testAccountId } from '../test-utils/fixtures.js';
import type { AccountRuntimeState, MessageCallback } from '../types/runtime.js';

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

// Mock store with fresh instances for each call
vi.mock('../runtime/store.js', () => ({
  getAccountMessageStateStore: vi.fn(function () {
    return {
      ensureLoaded: vi.fn().mockResolvedValue(undefined),
      isLoaded: vi.fn(() => true),
      getWatermark: vi.fn(() => -1),
      getGlobalWatermark: vi.fn(() => 0),
      setWatermark: vi.fn(),
      setWatermarkAsync: vi.fn().mockResolvedValue(undefined),
      flush: vi.fn(),
      flushAsync: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
    };
  }),
  disposeMessageStateStore: vi.fn(),
}));

describe('Inbound message processing', () => {
  const baseConfig = testConfig;

  const mockState: AccountRuntimeState = {
    accountId: testAccountId,
    config: baseConfig,
    chatReader: null,
    chatSender: null,
    discovery: null,
    lastError: null,
    lastStartAt: null,
    lastStopAt: null,
    lastInboundAt: null,
    lastOutboundAt: null,
    messageCallbacks: new Set<MessageCallback>(),
    watchInterval: null,
    watchErrorCount: 0,
  };

  beforeEach(async () => {
    mockState.messageCallbacks.clear();
  });

  afterEach(() => {
    // Restore all mocks after each test to prevent pollution
    vi.restoreAllMocks();
  });

  describe('checkDmPolicy', () => {
    describe("with dmPolicy='allow'", () => {
      it('should allow all messages', () => {
        const config = { ...baseConfig, dmPolicy: 'allow' as const };
        const result = checkDmPolicy('alice', config, []);

        expect(result).toEqual({
          allowed: true,
          reason: 'allowed',
          action: 'process',
        });
      });

      it('should allow messages from unknown senders', () => {
        const config = { ...baseConfig, dmPolicy: 'allow' as const };
        const result = checkDmPolicy('stranger', config, []);

        expect(result.allowed).toBe(true);
      });
    });

    describe("with dmPolicy='deny'", () => {
      it('should deny all messages', () => {
        const config = { ...baseConfig, dmPolicy: 'deny' as const };
        const result = checkDmPolicy('alice', config, []);

        expect(result).toEqual({
          allowed: false,
          reason: 'denied',
          action: 'ignore',
        });
      });
    });

    describe("with dmPolicy='pairing'", () => {
      it('should request pairing for new senders', () => {
        const config = { ...baseConfig, dmPolicy: 'pairing' as const };
        const result = checkDmPolicy('alice', config, []);

        expect(result).toEqual({
          allowed: false,
          reason: 'pending',
          action: 'request_pairing',
        });
      });

      it('should allow whitelisted senders', () => {
        const config = { ...baseConfig, dmPolicy: 'pairing' as const, allowFrom: ['alice'] };
        const result = checkDmPolicy('alice', config, []);

        expect(result).toEqual({
          allowed: true,
          reason: 'whitelisted',
          action: 'process',
        });
      });

      it('should allow store-approved senders', () => {
        const config = { ...baseConfig, dmPolicy: 'pairing' as const };
        const storeAllowFrom = ['alice'];
        const result = checkDmPolicy('alice', config, storeAllowFrom);

        expect(result).toEqual({
          allowed: true,
          reason: 'whitelisted',
          action: 'process',
        });
      });

      it('should be case-insensitive for allowFrom matching', () => {
        const config = { ...baseConfig, dmPolicy: 'pairing' as const, allowFrom: ['Alice'] };
        const result = checkDmPolicy('ALICE', config, []);

        expect(result.allowed).toBe(true);
      });

      it('should trim whitespace from sender names', () => {
        const config = { ...baseConfig, dmPolicy: 'pairing' as const, allowFrom: ['alice'] };
        const result = checkDmPolicy('  alice  ', config, []);

        expect(result.allowed).toBe(true);
      });
    });

    describe('with unknown dmPolicy', () => {
      it('should deny for unknown dmPolicy (fail-closed)', () => {
        const config = { ...baseConfig, dmPolicy: 'unknown' as any };
        const result = checkDmPolicy('alice', config, []);

        // Security: Unknown policy must deny (fail-closed)
        expect(result).toEqual({
          allowed: false,
          reason: 'denied',
          action: 'ignore',
        });
      });
    });
  });

  describe('processIncomingMessage', () => {
    // Use a function to generate unique timestamps for each test
    const createMessage = (
      overrides?: Partial<{ time: number; message: string; sender: string }>
    ) => ({
      time: Date.now() + Math.floor(Math.random() * 1000000),
      message: 'Hello, world!',
      sender: 'alice',
      ...overrides,
    });

    it('should normalize valid messages', () => {
      const message = createMessage();
      const config = { ...baseConfig, dmPolicy: 'allow' as const };
      const result = processIncomingMessage(message, {
        config,
        storeAllowFrom: [],
        accountId: testAccountId,
      });

      expect(result).not.toBeNull();
      expect(result?.id).toBe(`${message.time}-alice`);
      expect(result?.content).toBe('Hello, world!');
      expect(result?.sender).toBe('alice');
      expect(result?.senderId).toBe('alice');
      expect(result?.peer).toBe('alice');
      expect(result?.timestamp).toBeInstanceOf(Date);
    });

    it('should skip empty messages', () => {
      const message = createMessage({ message: '' });
      const config = { ...baseConfig, dmPolicy: 'allow' as const };
      const result = processIncomingMessage(message, {
        config,
        storeAllowFrom: [],
        accountId: testAccountId,
      });

      expect(result).toBeNull();
    });

    it('should skip whitespace-only messages', () => {
      const message = createMessage({ message: '   ' });
      const config = { ...baseConfig, dmPolicy: 'allow' as const };
      const result = processIncomingMessage(message, {
        config,
        storeAllowFrom: [],
        accountId: testAccountId,
      });

      expect(result).toBeNull();
    });

    it('should reject oversized messages', () => {
      const oversizedMessage = 'a'.repeat(MAX_MESSAGE_LENGTH + 1);
      const message = createMessage({ message: oversizedMessage });
      const config = { ...baseConfig, dmPolicy: 'allow' as const };
      const result = processIncomingMessage(message, {
        config,
        storeAllowFrom: [],
        accountId: testAccountId,
      });

      expect(result).toBeNull();
    });

    it('should accept messages at exactly MAX_MESSAGE_LENGTH', () => {
      const maxSizeMessage = 'a'.repeat(MAX_MESSAGE_LENGTH);
      const message = createMessage({ message: maxSizeMessage });
      const config = { ...baseConfig, dmPolicy: 'allow' as const };
      const result = processIncomingMessage(message, {
        config,
        storeAllowFrom: [],
        accountId: testAccountId,
      });

      expect(result).not.toBeNull();
      expect(result?.content).toBe(maxSizeMessage);
    });

    it('should skip already-processed messages based on watermark', async () => {
      // Get the original mock and override getWatermark
      const { getAccountMessageStateStore } = await import('../runtime/store.js');
      const message = createMessage();

      // Create a new store mock with high watermark
      const mockStore = {
        ensureLoaded: vi.fn().mockResolvedValue(undefined),
        isLoaded: vi.fn(() => true),
        getWatermark: vi.fn(() => message.time + 1000),
        getGlobalWatermark: vi.fn(() => 0),
        setWatermark: vi.fn(),
        setWatermarkAsync: vi.fn().mockResolvedValue(undefined),
        flush: vi.fn(),
        flushAsync: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
      };

      // Save original implementation
      const originalImpl = vi.mocked(getAccountMessageStateStore).getMockImplementation?.();

      // Override
      vi.mocked(getAccountMessageStateStore).mockReturnValue(mockStore);

      const config = { ...baseConfig, dmPolicy: 'allow' as const };
      const result = processIncomingMessage(message, {
        config,
        storeAllowFrom: [],
        accountId: testAccountId,
      });

      expect(result).toBeNull();

      // Restore original if there was one
      if (originalImpl) {
        vi.mocked(getAccountMessageStateStore).mockImplementation(originalImpl);
      } else {
        vi.mocked(getAccountMessageStateStore).mockReset();
      }
    });

    it("should respect dmPolicy='deny'", () => {
      const message = createMessage();
      const config = { ...baseConfig, dmPolicy: 'deny' as const };
      const result = processIncomingMessage(message, {
        config,
        storeAllowFrom: [],
        accountId: testAccountId,
      });

      expect(result).toBeNull();
    });

    it("should trigger pairing request for dmPolicy='pairing'", () => {
      const message = createMessage();
      const config = { ...baseConfig, dmPolicy: 'pairing' as const };
      const result = processIncomingMessage(message, {
        config,
        storeAllowFrom: [],
        accountId: testAccountId,
      });

      expect(result).toBeNull();
    });

    it('should allow whitelisted senders in pairing mode', () => {
      const message = createMessage();
      const config = { ...baseConfig, dmPolicy: 'pairing' as const, allowFrom: ['alice'] };

      const result = processIncomingMessage(message, {
        config,
        storeAllowFrom: [],
        accountId: testAccountId,
      });

      expect(result).not.toBeNull();
      expect(result?.sender).toBe('alice');
    });

    it('should handle messages with newlines', () => {
      const message = createMessage({ message: 'Hello\nWorld\n' });
      const config = { ...baseConfig, dmPolicy: 'allow' as const };
      const result = processIncomingMessage(message, {
        config,
        storeAllowFrom: [],
        accountId: testAccountId,
      });

      expect(result).not.toBeNull();
      expect(result?.content).toBe('Hello\nWorld\n');
    });

    it('should handle messages with special characters', () => {
      const message = createMessage({ message: 'Hello! 🌍 世界' });
      const config = { ...baseConfig, dmPolicy: 'allow' as const };
      const result = processIncomingMessage(message, {
        config,
        storeAllowFrom: [],
        accountId: testAccountId,
      });

      expect(result).not.toBeNull();
      expect(result?.content).toBe('Hello! 🌍 世界');
    });

    it('should handle very long messages', () => {
      const message = createMessage({ message: 'a'.repeat(10000) });
      const config = { ...baseConfig, dmPolicy: 'allow' as const };
      const result = processIncomingMessage(message, {
        config,
        storeAllowFrom: [],
        accountId: testAccountId,
      });

      expect(result).not.toBeNull();
      expect(result?.content).toBe('a'.repeat(10000));
    });

    it('should handle zero timestamp', () => {
      const message = createMessage({ time: 0 });
      const config = { ...baseConfig, dmPolicy: 'allow' as const };

      const result = processIncomingMessage(message, {
        config,
        storeAllowFrom: [],
        accountId: testAccountId,
      });

      expect(result).not.toBeNull();
    });

    // ========================================
    // NEW: Watermark-based deduplication tests
    // Covers: duplicate message detection, new message detection
    // ========================================

    it('should process NEW messages when msg.time > watermark', async () => {
      const { getAccountMessageStateStore } = await import('../runtime/store.js');
      const fixedTime = 1000000;
      const message = createMessage({ time: fixedTime + 100 }); // Newer than watermark

      // Mock store with lower watermark (simulating already-processed messages)
      const mockStore = {
        ensureLoaded: vi.fn().mockResolvedValue(undefined),
        isLoaded: vi.fn(() => true),
        getWatermark: vi.fn(() => fixedTime), // Watermark = fixedTime
        getGlobalWatermark: vi.fn(() => 0),
        setWatermark: vi.fn(),
        setWatermarkAsync: vi.fn().mockResolvedValue(undefined),
        flush: vi.fn(),
        flushAsync: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
      };

      const originalImpl = vi.mocked(getAccountMessageStateStore).getMockImplementation?.();
      vi.mocked(getAccountMessageStateStore).mockReturnValue(mockStore);

      const config = { ...baseConfig, dmPolicy: 'allow' as const };
      const result = processIncomingMessage(message, {
        config,
        storeAllowFrom: [],
        accountId: testAccountId,
      });

      // Message should be processed (not skipped) because time > watermark
      expect(result).not.toBeNull();
      expect(result?.content).toBe('Hello, world!');

      // Restore
      if (originalImpl) {
        vi.mocked(getAccountMessageStateStore).mockImplementation(originalImpl);
      } else {
        vi.mocked(getAccountMessageStateStore).mockReset();
      }
    });

    it('should SKIP messages when msg.time === watermark (equal boundary)', async () => {
      const { getAccountMessageStateStore } = await import('../runtime/store.js');
      const fixedTime = 1000000;
      const message = createMessage({ time: fixedTime }); // Equal to watermark

      // Mock store with same watermark
      const mockStore = {
        ensureLoaded: vi.fn().mockResolvedValue(undefined),
        isLoaded: vi.fn(() => true),
        getWatermark: vi.fn(() => fixedTime), // Same as message.time
        getGlobalWatermark: vi.fn(() => 0),
        setWatermark: vi.fn(),
        setWatermarkAsync: vi.fn().mockResolvedValue(undefined),
        flush: vi.fn(),
        flushAsync: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
      };

      const originalImpl = vi.mocked(getAccountMessageStateStore).getMockImplementation?.();
      vi.mocked(getAccountMessageStateStore).mockReturnValue(mockStore);

      const config = { ...baseConfig, dmPolicy: 'allow' as const };
      const result = processIncomingMessage(message, {
        config,
        storeAllowFrom: [],
        accountId: testAccountId,
      });

      // Message should be SKIPPED because time <= watermark (not strictly greater)
      expect(result).toBeNull();

      // Restore
      if (originalImpl) {
        vi.mocked(getAccountMessageStateStore).mockImplementation(originalImpl);
      } else {
        vi.mocked(getAccountMessageStateStore).mockReset();
      }
    });

    it('should use per-peer watermark key for isolation', async () => {
      const { getWatermarkKey } = await import('./watermark.js');

      // Verify that different peers get different watermark keys
      const aliceKey = getWatermarkKey({ type: 'peer', data: 'alice' });
      const bobKey = getWatermarkKey({ type: 'peer', data: 'bob' });
      const groupKey = getWatermarkKey({
        type: 'group',
        data: { group: 'mygroup', creator: 'alice' },
      });

      // Keys should be different for different peers/groups
      expect(aliceKey).not.toBe(bobKey);
      expect(aliceKey).not.toBe(groupKey);
      expect(bobKey).not.toBe(groupKey);

      // Peer key should contain peer identifier
      expect(aliceKey).toContain('alice');
      expect(bobKey).toContain('bob');
      expect(groupKey).toContain('group:');
    });
  });

  describe('notifyMessageCallbacks', () => {
    it('should call all registered callbacks', async () => {
      const mockCallback1 = vi.fn();
      const mockCallback2 = vi.fn();
      mockState.messageCallbacks.add(mockCallback1);
      mockState.messageCallbacks.add(mockCallback2);

      const message: ZTMChatMessage = {
        id: 'test-id',
        content: 'test message',
        sender: 'alice',
        senderId: 'alice',
        timestamp: new Date(),
        peer: 'alice',
      };

      await notifyMessageCallbacks(mockState, message);

      expect(mockCallback1).toHaveBeenCalledWith(message);
      expect(mockCallback2).toHaveBeenCalledWith(message);
    });

    it('should update lastInboundAt timestamp', async () => {
      const before = new Date();
      mockState.messageCallbacks.add(vi.fn());

      const message: ZTMChatMessage = {
        id: 'test-id',
        content: 'test message',
        sender: 'alice',
        senderId: 'alice',
        timestamp: new Date(),
        peer: 'alice',
      };

      await notifyMessageCallbacks(mockState, message);

      expect(mockState.lastInboundAt).toBeDefined();
      expect(mockState.lastInboundAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('should set watermark in message state store', async () => {
      // Mock getAccountMessageStateStore to return a store with a tracked setWatermarkAsync
      const setWatermarkAsyncMock = vi.fn();
      const { getAccountMessageStateStore } = await import('../runtime/store.js');

      // Override mock to return store with tracked setWatermarkAsync
      vi.mocked(getAccountMessageStateStore).mockReturnValue({
        ensureLoaded: vi.fn().mockResolvedValue(undefined),
        isLoaded: vi.fn(() => true),
        getWatermark: vi.fn(() => -1),
        getGlobalWatermark: vi.fn(() => 0),
        setWatermark: vi.fn(),
        setWatermarkAsync: setWatermarkAsyncMock,
        flush: vi.fn(),
        flushAsync: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
      });

      mockState.messageCallbacks.add(vi.fn());

      const message: ZTMChatMessage = {
        id: 'test-id',
        content: 'test message',
        sender: 'alice',
        senderId: 'alice',
        timestamp: new Date(1234567890),
        peer: 'alice',
      };

      await notifyMessageCallbacks(mockState, message);

      // Check that watermark was set (async version)
      expect(setWatermarkAsyncMock).toHaveBeenCalledWith(testAccountId, 'alice', 1234567890);
    });

    it('should handle callback errors gracefully', async () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Callback error');
      });
      const successCallback = vi.fn();

      mockState.messageCallbacks.add(errorCallback);
      mockState.messageCallbacks.add(successCallback);

      const message: ZTMChatMessage = {
        id: 'test-id',
        content: 'test message',
        sender: 'alice',
        senderId: 'alice',
        timestamp: new Date(),
        peer: 'alice',
      };

      // Should not throw, should still call other callbacks
      expect(async () => await notifyMessageCallbacks(mockState, message)).not.toThrow();
      expect(errorCallback).toHaveBeenCalled();
      expect(successCallback).toHaveBeenCalled();
    });

    it('should handle empty callback set', async () => {
      const message: ZTMChatMessage = {
        id: 'test-id',
        content: 'test message',
        sender: 'alice',
        senderId: 'alice',
        timestamp: new Date(),
        peer: 'alice',
      };

      expect(async () => await notifyMessageCallbacks(mockState, message)).not.toThrow();
    });
  });

  describe('ZTMChatMessage type', () => {
    it('should have all required fields', () => {
      const message: ZTMChatMessage = {
        id: 'test-id',
        content: 'test',
        sender: 'alice',
        senderId: 'alice',
        timestamp: new Date(),
        peer: 'alice',
        thread: 'thread-123',
      };

      expect(message.id).toBe('test-id');
      expect(message.content).toBe('test');
      expect(message.sender).toBe('alice');
      expect(message.senderId).toBe('alice');
      expect(message.peer).toBe('alice');
      expect(message.thread).toBe('thread-123');
    });

    it('should have optional thread field', () => {
      const message: ZTMChatMessage = {
        id: 'test-id',
        content: 'test',
        sender: 'alice',
        senderId: 'alice',
        timestamp: new Date(),
        peer: 'alice',
      };

      expect(message.thread).toBeUndefined();
    });
  });

  describe('MessageCheckResult type', () => {
    it('should represent allowed messages', () => {
      const result: MessageCheckResult = {
        allowed: true,
        reason: 'allowed',
        action: 'process',
      };

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('allowed');
      expect(result.action).toBe('process');
    });

    it('should represent denied messages', () => {
      const result: MessageCheckResult = {
        allowed: false,
        reason: 'denied',
        action: 'ignore',
      };

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('denied');
      expect(result.action).toBe('ignore');
    });

    it('should represent pending pairing requests', () => {
      const result: MessageCheckResult = {
        allowed: false,
        reason: 'pending',
        action: 'request_pairing',
      };

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('pending');
      expect(result.action).toBe('request_pairing');
    });
  });
});

describe('re-exported functions from inbound.ts', () => {
  describe('startMessageWatcher re-export', () => {
    it('should be available via inbound.ts', () => {
      expect(startMessageWatcher).toBeDefined();
      expect(typeof startMessageWatcher).toBe('function');
    });
  });

  describe('normalizeUsername re-export', () => {
    it('should be available via inbound.ts', () => {
      expect(normalizeUsername).toBeDefined();
      expect(typeof normalizeUsername).toBe('function');
    });

    it('should normalize usernames correctly', () => {
      expect(normalizeUsername('  alice  ')).toBe('alice');
      expect(normalizeUsername('ALICE')).toBe('alice');
      expect(normalizeUsername('alice')).toBe('alice');
    });
  });
});
