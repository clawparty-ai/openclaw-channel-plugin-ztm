/**
 * Watcher Sync Tests
 * @module messaging/watcher-sync.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performInitialSync, performFullSync } from './watcher-sync.js';
import type { AccountRuntimeState } from '../types/runtime.js';
import { success, failure } from '../types/common.js';

// Mock dependencies
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('./strategies/message-strategies.js', () => ({
  processAndNotify: vi.fn().mockResolvedValue(true),
}));

// Mock getMessageSyncStart
vi.mock('../utils/sync-time.js', () => ({
  getMessageSyncStart: vi.fn().mockReturnValue(0),
}));

// Mock getAccountMessageStateStore
vi.mock('../runtime/store.js', () => ({
  getAccountMessageStateStore: vi.fn().mockReturnValue({
    getWatermark: vi.fn().mockReturnValue(0),
  }),
}));

// Mock isGroupChat
vi.mock('./message-processor-helpers.js', () => ({
  isGroupChat: vi.fn().mockReturnValue(false),
}));

// Mock sanitizeForLog
vi.mock('../utils/log-sanitize.js', () => ({
  sanitizeForLog: vi.fn().mockImplementation((s: string) => s),
}));

// Mock getOrDefault
vi.mock('../utils/guards.js', () => ({
  getOrDefault: vi.fn().mockImplementation((val: unknown, def: unknown) => val ?? def),
}));

describe('watcher-sync', () => {
  let mockState: AccountRuntimeState;
  const allowFrom = ['alice', 'bob'];

  beforeEach(async () => {
    vi.clearAllMocks();
    mockState = {
      accountId: 'test-account',
      config: { username: 'test-bot' },
      chatReader: {
        getChats: vi.fn(),
        getPeerMessages: vi.fn().mockResolvedValue(success([])),
        getGroupMessages: vi.fn().mockResolvedValue(success([])),
      },
    } as unknown as AccountRuntimeState;

    // Reset isGroupChat to default (false = peer chat)
    const { isGroupChat } = await import('./message-processor-helpers.js');
    vi.mocked(isGroupChat).mockReturnValue(false);
  });

  describe('performInitialSync', () => {
    it('should return empty array when chatReader is undefined', async () => {
      const stateWithoutReader = {
        accountId: 'test-account',
      } as unknown as AccountRuntimeState;

      const result = await performInitialSync(stateWithoutReader, allowFrom);
      expect(result).toEqual([]);
    });

    it('should return empty array when getChats fails', async () => {
      vi.mocked(mockState.chatReader!.getChats).mockResolvedValue(
        failure(new Error('Network error'))
      );

      const result = await performInitialSync(mockState, allowFrom);
      expect(result).toEqual([]);
    });

    it('should return empty array when no chats exist', async () => {
      vi.mocked(mockState.chatReader!.getChats).mockResolvedValue(success([]));

      const result = await performInitialSync(mockState, allowFrom);
      expect(result).toEqual([]);
    });

    it('should process chats and return them', async () => {
      const chats = [
        { peer: 'alice', time: 1000, updated: 1000, latest: { time: 1000, text: 'hi' } },
        { peer: 'bob', time: 2000, updated: 2000, latest: { time: 2000, text: 'hello' } },
      ];
      vi.mocked(mockState.chatReader!.getChats).mockResolvedValue(success(chats));
      (mockState.chatReader as any).getPeerMessages
        .mockResolvedValueOnce(success([{ time: 1000, text: 'hi' }]))
        .mockResolvedValueOnce(success([{ time: 2000, text: 'hello' }]));

      const result = await performInitialSync(mockState, allowFrom);
      expect(result).toEqual(chats);
      expect(result.length).toBe(2);
    });

    it('should fetch ALL messages per peer chat, not just latest', async () => {
      const { processAndNotify } = await import('./strategies/message-strategies.js');
      vi.mocked(processAndNotify).mockResolvedValue(true);

      const chats = [
        { peer: 'alice', time: 3000, updated: 3000, latest: { time: 3000, text: 'msg3' } },
      ];
      vi.mocked(mockState.chatReader!.getChats).mockResolvedValue(success(chats));

      // Simulate 3 messages since watermark — the core bug fix scenario
      const allMessages = [
        { time: 1000, text: 'msg1' },
        { time: 2000, text: 'msg2' },
        { time: 3000, text: 'msg3' },
      ];
      (mockState.chatReader as any).getPeerMessages.mockResolvedValue(success(allMessages));

      const result = await performInitialSync(mockState, allowFrom);
      expect(result).toEqual(chats);

      // All 3 messages should be processed, not just the latest
      expect(processAndNotify).toHaveBeenCalledTimes(3);
      expect(processAndNotify).toHaveBeenCalledWith(
        expect.objectContaining({ peer: 'alice', latest: allMessages[0] }),
        mockState,
        allowFrom
      );
      expect(processAndNotify).toHaveBeenCalledWith(
        expect.objectContaining({ peer: 'alice', latest: allMessages[1] }),
        mockState,
        allowFrom
      );
      expect(processAndNotify).toHaveBeenCalledWith(
        expect.objectContaining({ peer: 'alice', latest: allMessages[2] }),
        mockState,
        allowFrom
      );
    });

    it('should fetch ALL messages for group chats', async () => {
      const { processAndNotify } = await import('./strategies/message-strategies.js');
      const { isGroupChat } = await import('./message-processor-helpers.js');
      vi.mocked(isGroupChat).mockReturnValue(true);
      vi.mocked(processAndNotify).mockResolvedValue(true);

      const chats = [
        {
          creator: 'ttt',
          group: 'group-id',
          time: 2000,
          updated: 2000,
          latest: { time: 2000, text: 'group-msg2' },
        },
      ];
      vi.mocked(mockState.chatReader!.getChats).mockResolvedValue(success(chats));

      const allMessages = [
        { time: 1000, text: 'group-msg1' },
        { time: 2000, text: 'group-msg2' },
      ];
      (mockState.chatReader as any).getGroupMessages.mockResolvedValue(success(allMessages));

      const result = await performInitialSync(mockState, allowFrom);
      expect(result).toEqual(chats);

      expect(processAndNotify).toHaveBeenCalledTimes(2);
      expect(processAndNotify).toHaveBeenCalledWith(
        expect.objectContaining({ creator: 'ttt', group: 'group-id', latest: allMessages[0] }),
        mockState,
        allowFrom
      );
      expect(processAndNotify).toHaveBeenCalledWith(
        expect.objectContaining({ creator: 'ttt', group: 'group-id', latest: allMessages[1] }),
        mockState,
        allowFrom
      );
    });

    it('should handle mixed processAndNotify results', async () => {
      const { processAndNotify } = await import('./strategies/message-strategies.js');
      vi.mocked(processAndNotify).mockImplementation((chat: any) =>
        Promise.resolve(chat.latest?.text === 'msg1')
      );

      const chats = [
        { peer: 'alice', time: 2000, updated: 2000, latest: { time: 2000, text: 'msg2' } },
      ];
      vi.mocked(mockState.chatReader!.getChats).mockResolvedValue(success(chats));
      (mockState.chatReader as any).getPeerMessages.mockResolvedValue(
        success([
          { time: 1000, text: 'msg1' },
          { time: 2000, text: 'msg2' },
        ])
      );

      const result = await performInitialSync(mockState, allowFrom);
      expect(result).toEqual(chats);
    });

    it('should skip chats where peer equals own username', async () => {
      const { processAndNotify } = await import('./strategies/message-strategies.js');
      vi.mocked(processAndNotify).mockResolvedValue(true);

      const chats = [
        { peer: 'test-bot', time: 1000, updated: 1000, latest: { time: 1000, text: 'self' } },
      ];
      vi.mocked(mockState.chatReader!.getChats).mockResolvedValue(success(chats));

      await performInitialSync(mockState, allowFrom);

      // Should not call getPeerMessages for self-chat
      expect(mockState.chatReader!.getPeerMessages).not.toHaveBeenCalled();
      expect(processAndNotify).not.toHaveBeenCalled();
    });

    it('should handle getPeerMessages failure gracefully', async () => {
      const chats = [
        { peer: 'alice', time: 1000, updated: 1000, latest: { time: 1000, text: 'hi' } },
      ];
      vi.mocked(mockState.chatReader!.getChats).mockResolvedValue(success(chats));
      (mockState.chatReader as any).getPeerMessages.mockResolvedValue(
        failure(new Error('Peer API error'))
      );

      const result = await performInitialSync(mockState, allowFrom);
      expect(result).toEqual(chats);
      // Should not throw
    });
  });

  describe('performFullSync', () => {
    it('should return early when chatReader is undefined', async () => {
      const stateWithoutReader = {
        accountId: 'test-account',
      } as unknown as AccountRuntimeState;

      await performFullSync(stateWithoutReader, allowFrom);
      // Should not throw and should not call anything
    });

    it('should handle getChats failure gracefully', async () => {
      vi.mocked(mockState.chatReader!.getChats).mockResolvedValue(failure(new Error('API error')));

      await performFullSync(mockState, allowFrom);
      // Should not throw
    });

    it('should process chats when they exist', async () => {
      const chats = [
        { peer: 'alice', time: 1000, updated: 1000, latest: { time: 1000, text: 'hi' } },
      ];
      vi.mocked(mockState.chatReader!.getChats).mockResolvedValue(success(chats));
      (mockState.chatReader as any).getPeerMessages.mockResolvedValue(
        success([{ time: 1000, text: 'hi' }])
      );

      await performFullSync(mockState, allowFrom);
      // Should process without error
    });

    it('should handle empty chat list', async () => {
      vi.mocked(mockState.chatReader!.getChats).mockResolvedValue(success([]));

      await performFullSync(mockState, allowFrom);
      // Should not throw
    });

    it('should NOT call processAndNotify when getPeerMessages returns empty array', async () => {
      const { processAndNotify } = await import('./strategies/message-strategies.js');
      vi.mocked(processAndNotify).mockResolvedValue(true);

      const chats = [
        { peer: 'alice', time: 1000, updated: 1000, latest: { time: 1000, text: 'hi' } },
      ];
      vi.mocked(mockState.chatReader!.getChats).mockResolvedValue(success(chats));

      // Return empty array - no messages since watermark
      (mockState.chatReader as any).getPeerMessages.mockResolvedValue(success([]));

      await performFullSync(mockState, allowFrom);

      // Should NOT process anything - prevents internal duplicate detection
      expect(processAndNotify).not.toHaveBeenCalled();
    });

    it('should process all chats in the list', async () => {
      const { processAndNotify } = await import('./strategies/message-strategies.js');
      vi.mocked(processAndNotify).mockResolvedValue(true);

      const chats = [
        { peer: 'alice', time: 1000, updated: 1000, latest: { time: 1000, text: 'a' } },
        { peer: 'bob', time: 2000, updated: 2000, latest: { time: 2000, text: 'b' } },
        { peer: 'charlie', time: 3000, updated: 3000, latest: { time: 3000, text: 'c' } },
      ];
      vi.mocked(mockState.chatReader!.getChats).mockResolvedValue(success(chats));
      (mockState.chatReader as any).getPeerMessages
        .mockResolvedValueOnce(success([{ time: 1000, text: 'a' }]))
        .mockResolvedValueOnce(success([{ time: 2000, text: 'b' }]))
        .mockResolvedValueOnce(success([{ time: 3000, text: 'c' }]));

      await performFullSync(mockState, allowFrom);
      // Should call getPeerMessages for each peer
      expect(mockState.chatReader!.getPeerMessages).toHaveBeenCalledTimes(3);
    });

    it('should fetch ALL messages per peer in full sync (bug fix verification)', async () => {
      const { processAndNotify } = await import('./strategies/message-strategies.js');
      vi.mocked(processAndNotify).mockResolvedValue(true);

      const chats = [
        { peer: 'ttt', time: 3000, updated: 3000, latest: { time: 3000, text: 'latest' } },
      ];
      vi.mocked(mockState.chatReader!.getChats).mockResolvedValue(success(chats));

      // 3 messages since watermark
      const allMessages = [
        { time: 1000, text: 'first' },
        { time: 2000, text: 'second' },
        { time: 3000, text: 'latest' },
      ];
      (mockState.chatReader as any).getPeerMessages.mockResolvedValue(success(allMessages));

      await performFullSync(mockState, allowFrom);

      // All 3 must be processed
      expect(processAndNotify).toHaveBeenCalledTimes(3);
    });
  });
});
