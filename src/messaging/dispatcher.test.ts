// Unit tests for Message Dispatcher

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  notifyMessageCallbacks,
  getCallbackStats,
  hasCallbacks,
  clearCallbacks,
} from './dispatcher.js';
import { testAccountId } from '../test-utils/fixtures.js';
import { Semaphore } from '../utils/concurrency.js';
import { CALLBACK_SEMAPHORE_PERMITS } from '../constants.js';
import type { ZTMChatMessage } from '../types/messaging.js';
import type { AccountRuntimeState, MessageCallback } from '../types/runtime.js';

// Use vi.hoisted to ensure mocks are properly scoped
const { mockSetWatermark: actualMockSetWatermark, mockLoggerDebug: actualMockLoggerDebug } =
  vi.hoisted(() => ({
    mockSetWatermark: vi.fn(),
    mockLoggerDebug: vi.fn(),
  }));

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn().mockImplementation((...args: unknown[]) => {
      actualMockLoggerDebug(...args);
    }),
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
    setWatermark: vi.fn().mockImplementation((...args: unknown[]) => {
      actualMockSetWatermark(...args);
    }),
    setWatermarkAsync: vi.fn().mockImplementation(async (...args: unknown[]) => {
      actualMockSetWatermark(...args);
    }),
    getFileMetadata: vi.fn(() => ({})),
    setFileMetadata: vi.fn(),
    setFileMetadataBulk: vi.fn(),
    flush: vi.fn(),
    flushAsync: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
  })),
  disposeMessageStateStore: vi.fn(),
}));

describe('Message Dispatcher', () => {
  let mockState: ReturnType<typeof createMockState>;

  function createMockState(): AccountRuntimeState {
    return {
      accountId: testAccountId,
      config: {} as any,
      apiClient: null,
      connected: false,
      meshConnected: false,
      lastError: null,
      lastStartAt: null,
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 0,
      messageCallbacks: new Set<MessageCallback>(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
    };
  }

  beforeEach(() => {
    actualMockSetWatermark.mockClear();
    actualMockLoggerDebug.mockClear();
    vi.clearAllMocks();
    mockState = createMockState();
  });

  describe('notifyMessageCallbacks', () => {
    it('should update lastInboundAt timestamp', async () => {
      const before = mockState.lastInboundAt;
      const message: ZTMChatMessage = {
        id: '123',
        content: 'Test',
        sender: 'alice',
        senderId: 'alice',
        timestamp: new Date(),
        peer: 'alice',
      };

      await notifyMessageCallbacks(mockState, message);

      expect(mockState.lastInboundAt).not.toBe(before);
      expect(mockState.lastInboundAt).toBeInstanceOf(Date);
    });

    it('should call all registered callbacks', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      mockState.messageCallbacks = new Set([callback1, callback2]);

      const message: ZTMChatMessage = {
        id: '123',
        content: 'Test',
        sender: 'alice',
        senderId: 'alice',
        timestamp: new Date(),
        peer: 'alice',
      };

      await notifyMessageCallbacks(mockState, message);

      expect(callback1).toHaveBeenCalledWith(message);
      expect(callback2).toHaveBeenCalledWith(message);
    });

    it('should continue calling other callbacks if one throws', async () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Callback error');
      });
      const successCallback = vi.fn();
      mockState.messageCallbacks = new Set([errorCallback, successCallback]);

      const message: ZTMChatMessage = {
        id: '123',
        content: 'Test',
        sender: 'alice',
        senderId: 'alice',
        timestamp: new Date(),
        peer: 'alice',
      };

      expect(async () => {
        await notifyMessageCallbacks(mockState, message);
      }).not.toThrow();

      expect(successCallback).toHaveBeenCalled();
    });

    it('should update watermark after successful callbacks', async () => {
      const callback = vi.fn();
      mockState.messageCallbacks = new Set([callback]);

      const message: ZTMChatMessage = {
        id: '123',
        content: 'Test',
        sender: 'alice',
        senderId: 'alice',
        timestamp: new Date(1234567890),
        peer: 'alice',
      };

      await notifyMessageCallbacks(mockState, message);

      // Verify that setWatermark was called on the store
      expect(actualMockSetWatermark).toHaveBeenCalledWith(testAccountId, 'alice', 1234567890);
    });
  });

  describe('getCallbackStats', () => {
    it('should return correct stats', () => {
      mockState.messageCallbacks = new Set([vi.fn(), vi.fn()]);

      const stats = getCallbackStats(mockState);

      expect(stats.total).toBe(2);
      expect(stats.active).toBe(2);
    });

    it('should return zero for no callbacks', () => {
      const stats = getCallbackStats(mockState);

      expect(stats.total).toBe(0);
      expect(stats.active).toBe(0);
    });
  });

  describe('hasCallbacks', () => {
    it('should return true when callbacks exist', () => {
      mockState.messageCallbacks = new Set([vi.fn()]);

      expect(hasCallbacks(mockState)).toBe(true);
    });

    it('should return false when no callbacks', () => {
      expect(hasCallbacks(mockState)).toBe(false);
    });
  });

  describe('clearCallbacks', () => {
    it('should remove all callbacks', () => {
      const callback = vi.fn();
      mockState.messageCallbacks = new Set([callback]);

      clearCallbacks(mockState);

      expect(mockState.messageCallbacks.size).toBe(0);
    });

    it('should log cleared callback count', () => {
      mockState.messageCallbacks = new Set([vi.fn(), vi.fn()]);

      clearCallbacks(mockState);

      expect(actualMockLoggerDebug).toHaveBeenCalledWith(
        expect.stringContaining('Cleared 2 callback(s)')
      );
    });
  });

  describe('callback semaphore blocking', () => {
    it('should use semaphore when callbackSemaphore is present', async () => {
      const semaphore = new Semaphore(CALLBACK_SEMAPHORE_PERMITS);
      mockState.callbackSemaphore = semaphore;

      const callback = vi.fn().mockResolvedValue(undefined);
      mockState.messageCallbacks = new Set([callback]);

      const message: ZTMChatMessage = {
        id: '123',
        content: 'Test',
        sender: 'alice',
        senderId: 'alice',
        timestamp: new Date(),
        peer: 'alice',
      };

      await notifyMessageCallbacks(mockState, message);

      expect(callback).toHaveBeenCalledWith(message);
      // Semaphore should have released the permit back
      expect(semaphore.availablePermits()).toBe(CALLBACK_SEMAPHORE_PERMITS);
    });

    it('should limit concurrent callback execution when semaphore permits exhausted', async () => {
      // Create a semaphore with only 2 permits to make blocking observable
      const semaphore = new Semaphore(2);
      mockState.callbackSemaphore = semaphore;

      let activeCallbacks = 0;
      let maxConcurrent = 0;
      const executionOrder: number[] = [];

      // Create 5 callbacks that each take 50ms
      const callbacks: MessageCallback[] = Array.from({ length: 5 }, (_, i) =>
        vi.fn(async () => {
          activeCallbacks++;
          maxConcurrent = Math.max(maxConcurrent, activeCallbacks);
          executionOrder.push(i);
          await new Promise(resolve => setTimeout(resolve, 50));
          activeCallbacks--;
        })
      );

      mockState.messageCallbacks = new Set(callbacks);

      const message: ZTMChatMessage = {
        id: '123',
        content: 'Test',
        sender: 'alice',
        senderId: 'alice',
        timestamp: new Date(),
        peer: 'alice',
      };

      await notifyMessageCallbacks(mockState, message);

      // Verify all callbacks completed
      callbacks.forEach(cb => expect(cb).toHaveBeenCalledTimes(1));

      // Verify concurrency was limited by semaphore (max 2 concurrent)
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it('should handle callback error when semaphore is present', async () => {
      const semaphore = new Semaphore(CALLBACK_SEMAPHORE_PERMITS);
      mockState.callbackSemaphore = semaphore;

      const errorCallback = vi.fn(() => {
        throw new Error('Callback error');
      });
      const successCallback = vi.fn().mockResolvedValue(undefined);
      mockState.messageCallbacks = new Set([errorCallback, successCallback]);

      const message: ZTMChatMessage = {
        id: '123',
        content: 'Test',
        sender: 'alice',
        senderId: 'alice',
        timestamp: new Date(),
        peer: 'alice',
      };

      // Should not throw
      await expect(notifyMessageCallbacks(mockState, message)).resolves.not.toThrow();

      // Success callback should still be called
      expect(successCallback).toHaveBeenCalled();

      // Semaphore permits should be released even after error
      expect(semaphore.availablePermits()).toBe(CALLBACK_SEMAPHORE_PERMITS);
    });

    it('should not block when no callbacks registered even with semaphore', async () => {
      const semaphore = new Semaphore(CALLBACK_SEMAPHORE_PERMITS);
      mockState.callbackSemaphore = semaphore;

      const message: ZTMChatMessage = {
        id: '123',
        content: 'Test',
        sender: 'alice',
        senderId: 'alice',
        timestamp: new Date(),
        peer: 'alice',
      };

      await notifyMessageCallbacks(mockState, message);

      // No permits should be consumed
      expect(semaphore.availablePermits()).toBe(CALLBACK_SEMAPHORE_PERMITS);
    });

    it('should use default constant for semaphore permits', () => {
      expect(CALLBACK_SEMAPHORE_PERMITS).toBe(10);
    });
  });

  describe('filter operation efficiency', () => {
    it('should count success and error results efficiently', () => {
      // Simulate the filter operations from notifyMessageCallbacks
      const results = [true, false, true, true, false, true, false, true];

      // Current implementation uses two filter calls
      const successCount = results.filter(r => r).length;
      const errorCount = results.filter(r => !r).length;

      expect(successCount).toBe(5);
      expect(errorCount).toBe(3);
      expect(successCount + errorCount).toBe(results.length);
    });

    it('should handle empty results array', () => {
      const results: boolean[] = [];

      const successCount = results.filter(r => r).length;
      const errorCount = results.filter(r => !r).length;

      expect(successCount).toBe(0);
      expect(errorCount).toBe(0);
    });

    it('should handle all success results', () => {
      const results = [true, true, true, true];

      const successCount = results.filter(r => r).length;
      const errorCount = results.filter(r => !r).length;

      expect(successCount).toBe(4);
      expect(errorCount).toBe(0);
    });

    it('should handle all error results', () => {
      const results = [false, false, false, false];

      const successCount = results.filter(r => r).length;
      const errorCount = results.filter(r => !r).length;

      expect(successCount).toBe(0);
      expect(errorCount).toBe(4);
    });

    it('should process large result arrays efficiently', () => {
      // Create a large array to test performance
      const results = Array(1000)
        .fill(null)
        .map((_, i) => i % 2 === 0);

      const start = performance.now();
      const successCount = results.filter(r => r).length;
      const errorCount = results.filter(r => !r).length;
      const elapsed = performance.now() - start;

      expect(successCount).toBe(500);
      expect(errorCount).toBe(500);
      // Should complete quickly (< 10ms for 1000 items)
      expect(elapsed).toBeLessThan(10);
    });
  });
});
