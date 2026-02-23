// Unit tests for Chat Processor

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processChatMessage, processAndNotify } from './chat-processor.js';
import type { AccountRuntimeState } from '../types/runtime.js';
import type { ZTMChatConfig } from '../types/config.js';
import type { ZTMChat, ZTMMessage } from '../types/api.js';
import { testConfig, testAccountId } from '../test-utils/fixtures.js';

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

vi.mock('../runtime/store.js', () => ({
  getAccountMessageStateStore: vi.fn(() => ({
    getWatermark: vi.fn(() => -1),
    getGlobalWatermark: vi.fn(() => 0),
    setWatermark: vi.fn(),
    flush: vi.fn(),
    flushAsync: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
  })),
}));

vi.mock('../connectivity/permit.js', () => ({
  handlePairingRequest: vi.fn(() => Promise.resolve()),
}));

function createMockMessage(overrides?: Partial<ZTMMessage>): ZTMMessage {
  return {
    time: Date.now(),
    message: 'Hello',
    sender: 'alice',
    ...overrides,
  };
}

function createMockChat(overrides?: Partial<ZTMChat>): ZTMChat {
  return {
    peer: 'alice',
    time: Date.now(),
    updated: Date.now(),
    latest: createMockMessage(),
    ...overrides,
  };
}

describe('processChatMessage', () => {
  const baseConfig: ZTMChatConfig = {
    ...testConfig,
    username: 'testuser',
    dmPolicy: 'allow',
  };

  describe('group chat processing', () => {
    it('should return false when no latest message', async () => {
      const chat = createMockChat({
        creator: 'alice',
        group: 'test-group',
        name: 'Test Group',
        latest: undefined as unknown as ZTMMessage,
      });

      const result = await processChatMessage(chat, baseConfig, [], testAccountId);
      expect(result).toBe(false);
    });

    it('should return false when sender is self', async () => {
      const chat = createMockChat({
        creator: 'alice',
        group: 'test-group',
        name: 'Test Group',
        latest: createMockMessage({ sender: 'testuser' }),
      });

      const result = await processChatMessage(chat, baseConfig, [], testAccountId);
      expect(result).toBe(false);
    });

    it('should process valid group message', async () => {
      const chat = createMockChat({
        creator: 'alice',
        group: 'test-group',
        name: 'Test Group',
        latest: createMockMessage({ sender: 'bob', message: 'Hello from group' }),
      });

      const result = await processChatMessage(chat, baseConfig, [], testAccountId);
      expect(result).toBe(true);
    });

    it('should handle group with empty sender', async () => {
      const chat = createMockChat({
        creator: 'alice',
        group: 'test-group',
        name: 'Test Group',
        latest: createMockMessage({ sender: '' }),
      });

      const result = await processChatMessage(chat, baseConfig, [], testAccountId);
      expect(result).toBe(false);
    });
  });

  describe('peer chat processing', () => {
    it('should return false when no peer', async () => {
      const chat = createMockChat({
        peer: '',
      });

      const result = await processChatMessage(chat, baseConfig, [], testAccountId);
      expect(result).toBe(false);
    });

    it('should return false when peer is self', async () => {
      const chat = createMockChat({
        peer: 'testuser',
      });

      const result = await processChatMessage(chat, baseConfig, [], testAccountId);
      expect(result).toBe(false);
    });

    it('should return false when no latest message', async () => {
      const chat = createMockChat({
        latest: undefined as unknown as ZTMMessage,
      });

      const result = await processChatMessage(chat, baseConfig, [], testAccountId);
      expect(result).toBe(false);
    });

    it('should return false when sender is self', async () => {
      const chat = createMockChat({
        latest: createMockMessage({ sender: 'testuser' }),
      });

      const result = await processChatMessage(chat, baseConfig, [], testAccountId);
      expect(result).toBe(false);
    });

    it('should process valid peer message', async () => {
      const chat = createMockChat({
        latest: createMockMessage({ sender: 'bob', message: 'Hello from alice' }),
      });

      const result = await processChatMessage(chat, baseConfig, [], testAccountId);
      expect(result).toBe(true);
    });

    it('should use peer as sender when sender is empty', async () => {
      const chat = createMockChat({
        latest: createMockMessage({ sender: '' }),
      });

      const result = await processChatMessage(chat, baseConfig, [], testAccountId);
      expect(result).toBe(true);
    });
  });
});

describe('processAndNotify', () => {
  let mockState: AccountRuntimeState;

  beforeEach(() => {
    vi.clearAllMocks();

    mockState = {
      accountId: testAccountId,
      config: { ...testConfig, dmPolicy: 'allow', username: 'testuser' },
      apiClient: null,
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
  });

  describe('group chat processing with notification', () => {
    it('should return false when no latest message', async () => {
      const chat = createMockChat({
        creator: 'alice',
        group: 'test-group',
        name: 'Test Group',
        latest: undefined as unknown as ZTMMessage,
      });

      const result = await processAndNotify(chat, mockState, []);
      expect(result).toBe(false);
    });

    it('should return false when sender is self', async () => {
      const chat = createMockChat({
        creator: 'alice',
        group: 'test-group',
        name: 'Test Group',
        latest: createMockMessage({ sender: 'testuser' }),
      });

      const result = await processAndNotify(chat, mockState, []);
      expect(result).toBe(false);
    });

    it('should process valid group message and notify', async () => {
      const chat = createMockChat({
        creator: 'alice',
        group: 'test-group',
        name: 'Test Group',
        latest: createMockMessage({ sender: 'bob', message: 'Hello from group' }),
      });

      const result = await processAndNotify(chat, mockState, []);
      expect(result).toBe(true);
    });
  });

  describe('peer chat processing with notification', () => {
    it('should return false when no peer', async () => {
      const chat = createMockChat({
        peer: '',
      });

      const result = await processAndNotify(chat, mockState, []);
      expect(result).toBe(false);
    });

    it('should return false when peer is self', async () => {
      const chat = createMockChat({
        peer: 'testuser',
      });

      const result = await processAndNotify(chat, mockState, []);
      expect(result).toBe(false);
    });

    it('should return false when no latest message', async () => {
      const chat = createMockChat({
        latest: undefined as unknown as ZTMMessage,
      });

      const result = await processAndNotify(chat, mockState, []);
      expect(result).toBe(false);
    });

    it('should return false when sender is self', async () => {
      const chat = createMockChat({
        latest: createMockMessage({ sender: 'testuser' }),
      });

      const result = await processAndNotify(chat, mockState, []);
      expect(result).toBe(false);
    });

    it('should process valid peer message', async () => {
      const chat = createMockChat({
        latest: createMockMessage({ sender: 'bob', message: 'Hello from alice' }),
      });

      const result = await processAndNotify(chat, mockState, []);
      expect(result).toBe(true);
    });

    it('should trigger pairing request when policy requires', async () => {
      const chat = createMockChat({
        peer: 'newuser',
        latest: createMockMessage({ sender: 'newuser', message: 'Hello' }),
      });

      const pairingConfig: ZTMChatConfig = {
        ...testConfig,
        dmPolicy: 'pairing' as const,
      };
      const stateWithPairingConfig: AccountRuntimeState = {
        ...mockState,
        config: pairingConfig,
      };

      await processAndNotify(chat, stateWithPairingConfig, []);
    });
  });
});
