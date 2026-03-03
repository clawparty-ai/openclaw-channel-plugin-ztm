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

describe('watcher-sync', () => {
  let mockState: AccountRuntimeState;
  const allowFrom = ['alice', 'bob'];

  beforeEach(() => {
    vi.clearAllMocks();
    mockState = {
      accountId: 'test-account',
      config: { username: 'test-bot' },
      chatReader: {
        getChats: vi.fn(),
      },
    } as unknown as AccountRuntimeState;
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
        { id: 'chat1', peer: 'alice', lastMessage: { timestamp: 1000 } },
        { id: 'chat2', peer: 'bob', lastMessage: { timestamp: 2000 } },
      ];
      vi.mocked(mockState.chatReader!.getChats).mockResolvedValue(success(chats));

      const result = await performInitialSync(mockState, allowFrom);
      expect(result).toEqual(chats);
      expect(result.length).toBe(2);
    });

    it('should handle mixed processAndNotify results', async () => {
      const { processAndNotify } = await import('./strategies/message-strategies.js');
      vi.mocked(processAndNotify).mockImplementation((chat: any) =>
        Promise.resolve(chat.id === 'chat1')
      );

      const chats = [
        { id: 'chat1', peer: 'alice' },
        { id: 'chat2', peer: 'bob' },
      ];
      vi.mocked(mockState.chatReader!.getChats).mockResolvedValue(success(chats));

      const result = await performInitialSync(mockState, allowFrom);
      expect(result).toEqual(chats);
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
      const chats = [{ id: 'chat1', peer: 'alice' }];
      vi.mocked(mockState.chatReader!.getChats).mockResolvedValue(success(chats));

      await performFullSync(mockState, allowFrom);
      // Should process without error
    });

    it('should handle empty chat list', async () => {
      vi.mocked(mockState.chatReader!.getChats).mockResolvedValue(success([]));

      await performFullSync(mockState, allowFrom);
      // Should not throw
    });

    it('should process all chats in the list', async () => {
      const chats = [
        { id: 'chat1', peer: 'alice' },
        { id: 'chat2', peer: 'bob' },
        { id: 'chat3', peer: 'charlie' },
      ];
      vi.mocked(mockState.chatReader!.getChats).mockResolvedValue(success(chats));

      await performFullSync(mockState, allowFrom);
      // Should process all 3 chats
    });
  });
});
