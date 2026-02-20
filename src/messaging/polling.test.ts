// Unit tests for polling watcher fallback

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { testConfig, testAccountId } from '../test-utils/fixtures.js';
import type { AccountRuntimeState } from '../runtime/state.js';

// Mock dependencies - using hoisted for proper ordering
const {
  mockProcessPeerMessage,
  mockProcessGroupMessage,
  mockHandlePeerPolicyCheck,
  mockNotifyMessageCallbacks,
} = vi.hoisted(() => ({
  mockProcessPeerMessage: vi.fn(),
  mockProcessGroupMessage: vi.fn(),
  mockHandlePeerPolicyCheck: vi.fn().mockResolvedValue(undefined),
  mockNotifyMessageCallbacks: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('./message-processor-helpers.js', () => ({
  processPeerMessage: mockProcessPeerMessage,
  processGroupMessage: mockProcessGroupMessage,
  handlePeerPolicyCheck: mockHandlePeerPolicyCheck,
}));

vi.mock('./dispatcher.js', () => ({
  notifyMessageCallbacks: mockNotifyMessageCallbacks,
}));

vi.mock('../utils/result.js', () => ({
  handleResult: vi.fn((result: any) => {
    if (result.ok && result.value !== undefined) {
      return result.value;
    }
    return null;
  }),
}));

const { mockContainerGet } = vi.hoisted(() => {
  return { mockContainerGet: vi.fn() };
});

vi.mock('../di/index.js', () => ({
  container: {
    get: mockContainerGet,
  },
  DEPENDENCIES: {
    RUNTIME: 'RUNTIME',
  },
}));

// Import after setting up mocks
import { startPollingWatcher } from './polling.js';
import type { MessagingContext } from './context.js';

describe('polling', () => {
  describe('startPollingWatcher', () => {
    let mockState: AccountRuntimeState;
    let mockContext: MessagingContext;
    let mockRuntime: any;

    beforeEach(() => {
      vi.clearAllMocks();

      mockRuntime = {
        channel: {
          pairing: {
            readAllowFromStore: vi.fn().mockResolvedValue(['alice', 'bob']),
          },
        },
      };

      mockContext = {
        allowFromRepo: {
          getAllowFrom: vi.fn().mockResolvedValue(['alice', 'bob']),
        },
      } as unknown as MessagingContext;

      mockState = {
        accountId: testAccountId,
        config: { ...testConfig, username: 'mybot' },
        apiClient: {
          getChats: vi.fn().mockResolvedValue({ ok: true, value: [] }),
        } as any,
                lastError: null,
        lastStartAt: null,
        lastStopAt: null,
        lastInboundAt: null,
        lastOutboundAt: null,
            watchErrorCount: 0,
        messageCallbacks: new Set(),
        watchInterval: null,
        pendingPairings: new Map(),
      };

      // Set up container mock with nested .get() structure
      mockContainerGet.mockImplementation((dep: string) => {
        if (dep === 'RUNTIME') {
          return { get: vi.fn(() => mockRuntime) };
        }
        return {};
      });
    });

    afterEach(() => {
      if (mockState.watchInterval) {
        clearInterval(mockState.watchInterval);
      }
      vi.clearAllMocks();
    });

    it('should return early when apiClient is null', async () => {
      const stateWithoutApi = {
        ...mockState,
        apiClient: null,
      };

      await startPollingWatcher(stateWithoutApi, mockContext);

      expect(stateWithoutApi.watchInterval).toBeNull();
    });

    it('should set up watch interval with default polling interval', async () => {
      await startPollingWatcher(mockState, mockContext);

      expect(mockState.watchInterval).not.toBeNull();
    });

    it('should use custom polling interval when provided', async () => {
      const stateWithCustomInterval = {
        ...mockState,
        config: { ...mockState.config, pollingInterval: 5000 },
      };

      await startPollingWatcher(stateWithCustomInterval, mockContext);

      expect(stateWithCustomInterval.watchInterval).not.toBeNull();
    });

    it('should enforce minimum polling interval when custom is too low', async () => {
      const stateWithLowInterval = {
        ...mockState,
        config: { ...mockState.config, pollingInterval: 100 },
      };

      await startPollingWatcher(stateWithLowInterval, mockContext);

      expect(stateWithLowInterval.watchInterval).not.toBeNull();
    });

    it('should call getAllowFrom from context on each poll cycle', async () => {
      const chats = [{ peer: 'alice', latest: { time: 1000, message: 'hello' } }];
      (mockState.apiClient as any).getChats.mockResolvedValue({ ok: true, value: chats });

      await startPollingWatcher(mockState, mockContext);

      // Wait for first poll cycle to complete
      await new Promise(resolve => setTimeout(resolve, 2100));

      expect(mockContext.allowFromRepo.getAllowFrom).toHaveBeenCalled();
    }, 10000);

    it('should skip processing when allowFrom is null', async () => {
      (mockContext.allowFromRepo.getAllowFrom as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await startPollingWatcher(mockState, mockContext);

      // Wait for first poll cycle to complete
      await new Promise(resolve => setTimeout(resolve, 2100));

      expect(mockState.apiClient?.getChats).not.toHaveBeenCalled();
    }, 10000);

    it('should process chats and notify callbacks', async () => {
      const chats = [{ peer: 'alice', latest: { time: 1000, message: 'hello' } }];
      (mockState.apiClient as any).getChats.mockResolvedValue({ ok: true, value: chats });

      const normalizedMsg = {
        id: 'msg-1',
        content: 'hello',
        sender: 'alice',
        senderId: 'alice',
        timestamp: new Date(1000),
        peer: 'alice',
      };
      mockProcessPeerMessage.mockReturnValue(normalizedMsg);

      await startPollingWatcher(mockState, mockContext);

      // Wait for first poll cycle to complete
      await new Promise(resolve => setTimeout(resolve, 2100));

      expect(mockProcessPeerMessage).toHaveBeenCalled();
      expect(mockNotifyMessageCallbacks).toHaveBeenCalled();
    }, 10000);

    it('should handle empty chats array', async () => {
      (mockState.apiClient as any).getChats.mockResolvedValue({ ok: true, value: [] });

      await startPollingWatcher(mockState, mockContext);

      // Wait for first poll cycle to complete
      await new Promise(resolve => setTimeout(resolve, 2100));

      expect(mockProcessPeerMessage).not.toHaveBeenCalled();
    }, 10000);

    it('should process group chats correctly', async () => {
      const chats = [
        {
          creator: 'admin',
          group: 'testgroup',
          latest: { time: 1000, message: 'hello', sender: 'alice' },
        },
      ];
      (mockState.apiClient as any).getChats.mockResolvedValue({ ok: true, value: chats });

      const normalizedMsg = {
        id: 'msg-1',
        content: 'hello',
        sender: 'alice',
        senderId: 'alice',
        timestamp: new Date(1000),
        peer: 'alice',
        isGroup: true,
        groupId: 'testgroup',
        groupCreator: 'admin',
      };
      mockProcessGroupMessage.mockReturnValue(normalizedMsg);

      await startPollingWatcher(mockState, mockContext);

      // Wait for first poll cycle to complete
      await new Promise(resolve => setTimeout(resolve, 2100));

      expect(mockProcessGroupMessage).toHaveBeenCalled();
    }, 10000);

    it('should skip peer chat when peer is same as bot username', async () => {
      const chats = [{ peer: 'mybot', latest: { time: 1000, message: 'hello' } }];
      (mockState.apiClient as any).getChats.mockResolvedValue({ ok: true, value: chats });

      await startPollingWatcher(mockState, mockContext);

      // Wait for first poll cycle to complete
      await new Promise(resolve => setTimeout(resolve, 2100));

      // processPeerMessage should NOT be called because peer equals bot username
      expect(mockProcessPeerMessage).not.toHaveBeenCalled();
    }, 10000);

    it('should skip group chat when missing required fields', async () => {
      const chats = [
        // Missing creator
        { group: 'testgroup', latest: { time: 1000, message: 'hello' } },
      ];
      (mockState.apiClient as any).getChats.mockResolvedValue({ ok: true, value: chats });

      await startPollingWatcher(mockState, mockContext);

      // Wait for first poll cycle to complete
      await new Promise(resolve => setTimeout(resolve, 2100));

      expect(mockProcessGroupMessage).not.toHaveBeenCalled();
    }, 10000);

    describe('abortSignal support', () => {
      it('should stop polling when abortSignal fires', async () => {
        const abortController = new AbortController();

        await startPollingWatcher(mockState, mockContext, abortController.signal);
        expect(mockState.watchInterval).not.toBeNull();

        abortController.abort();
        expect(mockState.watchInterval).toBeNull();
      });

      it('should clear interval on pre-aborted signal', async () => {
        const abortController = new AbortController();
        abortController.abort();

        await startPollingWatcher(mockState, mockContext, abortController.signal);

        await new Promise(resolve => setTimeout(resolve, 2200));

        expect(mockState.watchInterval).toBeNull();
      }, 10000);
    });
  });
});
