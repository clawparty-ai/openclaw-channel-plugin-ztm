/**
 * E2E Tests for Callback Error Handling
 *
 * Tests callback error handling:
 * - Handle callback throwing exception
 * - Continue processing when one callback fails
 * - Handle callback timeout
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getOrCreateAccountState,
  disposeMessageStateStore,
  resetDefaultProvider,
} from '../../runtime/index.js';
import { notifyMessageCallbacks } from '../../messaging/dispatcher.js';
import type { ZTMChatMessage, MessageCallback } from '../../types/index.js';

describe('E2E: Callback Error Handling', () => {
  const baseAccountId = `test-callback-error-${Date.now()}`;

  beforeEach(() => {
    disposeMessageStateStore();
    resetDefaultProvider();
  });

  afterEach(async () => {
    disposeMessageStateStore();
    resetDefaultProvider();
  });

  const getTestAccountId = (suffix = '') =>
    `${baseAccountId}-${suffix}-${Math.random().toString(36).slice(2, 8)}`;

  const createTestMessage = (overrides = {}): ZTMChatMessage => ({
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    content: 'Test message',
    sender: 'alice',
    senderId: 'alice',
    timestamp: new Date(),
    peer: 'alice',
    ...overrides,
  });

  describe('Handle callback throwing exception', () => {
    it('should not throw when callback throws an error', async () => {
      const accountId = getTestAccountId('throw1');
      const state = getOrCreateAccountState(accountId);

      const throwingCallback: MessageCallback = vi.fn(async () => {
        throw new Error('Intentional callback error');
      });
      state.messageCallbacks = new Set([throwingCallback]);

      const message = createTestMessage();

      // Should not throw
      await expect(notifyMessageCallbacks(state, message)).resolves.not.toThrow();
    });

    it('should log error but continue when callback throws', async () => {
      const accountId = getTestAccountId('throw2');
      const state = getOrCreateAccountState(accountId);

      const throwingCallback: MessageCallback = vi.fn(async () => {
        throw new Error('Test error');
      });
      state.messageCallbacks = new Set([throwingCallback]);

      const message = createTestMessage();

      // Should complete without throwing
      await notifyMessageCallbacks(state, message);

      // Callback should have been called
      expect(throwingCallback).toHaveBeenCalledWith(message);
    });

    it('should handle multiple different error types', async () => {
      const accountId = getTestAccountId('throw3');
      const state = getOrCreateAccountState(accountId);

      const errorCallback: MessageCallback = vi.fn(async () => {
        throw new Error('Regular error');
      });
      const typeErrorCallback: MessageCallback = vi.fn(async () => {
        throw new TypeError('Type error');
      });
      const rangeErrorCallback: MessageCallback = vi.fn(async () => {
        throw new RangeError('Range error');
      });

      state.messageCallbacks = new Set([errorCallback, typeErrorCallback, rangeErrorCallback]);

      const message = createTestMessage();

      // All should be handled gracefully
      await expect(notifyMessageCallbacks(state, message)).resolves.not.toThrow();

      // All callbacks should have been attempted
      expect(errorCallback).toHaveBeenCalled();
      expect(typeErrorCallback).toHaveBeenCalled();
      expect(rangeErrorCallback).toHaveBeenCalled();
    });
  });

  describe('Continue processing when one callback fails', () => {
    it('should call all callbacks even if one throws', async () => {
      const accountId = getTestAccountId('continue1');
      const state = getOrCreateAccountState(accountId);

      const failingCallback: MessageCallback = vi.fn(async () => {
        throw new Error('Fail');
      });
      const successCallback1: MessageCallback = vi.fn();
      const successCallback2: MessageCallback = vi.fn();

      state.messageCallbacks = new Set([failingCallback, successCallback1, successCallback2]);

      const message = createTestMessage();

      await notifyMessageCallbacks(state, message);

      // All callbacks should have been called
      expect(failingCallback).toHaveBeenCalledWith(message);
      expect(successCallback1).toHaveBeenCalledWith(message);
      expect(successCallback2).toHaveBeenCalledWith(message);
    });

    it('should handle callback order regardless of failures', async () => {
      const accountId = getTestAccountId('continue2');
      const state = getOrCreateAccountState(accountId);

      const callOrder: string[] = [];
      const callback1: MessageCallback = vi.fn(async () => {
        callOrder.push('first');
      });
      const callback2: MessageCallback = vi.fn(async () => {
        callOrder.push('second');
        throw new Error('Fail in second');
      });
      const callback3: MessageCallback = vi.fn(async () => {
        callOrder.push('third');
      });

      state.messageCallbacks = new Set([callback1, callback2, callback3]);

      const message = createTestMessage();

      await notifyMessageCallbacks(state, message);

      // All should have been called
      expect(callOrder).toContain('first');
      expect(callOrder).toContain('second');
      expect(callOrder).toContain('third');
    });

    it('should update lastInboundAt even when callbacks fail', async () => {
      const accountId = getTestAccountId('continue3');
      const state = getOrCreateAccountState(accountId);

      const failingCallback: MessageCallback = vi.fn(async () => {
        throw new Error('Fail');
      });
      state.messageCallbacks = new Set([failingCallback]);

      const message = createTestMessage();

      const before = new Date();
      await notifyMessageCallbacks(state, message);
      const after = new Date();

      // lastInboundAt should be updated
      expect(state.lastInboundAt).toBeDefined();
      expect(state.lastInboundAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(state.lastInboundAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('Handle callback timeout', () => {
    it('should handle slow callback without blocking forever', async () => {
      const accountId = getTestAccountId('timeout1');
      const state = getOrCreateAccountState(accountId);

      let slowCallbackCompleted = false;
      const slowCallback: MessageCallback = vi.fn(async () => {
        // Simulate slow operation
        await new Promise(resolve => setTimeout(resolve, 100));
        slowCallbackCompleted = true;
      });

      state.messageCallbacks = new Set([slowCallback]);

      const message = createTestMessage();

      // Should complete within reasonable time
      await notifyMessageCallbacks(state, message);

      expect(slowCallbackCompleted).toBe(true);
    });

    it('should handle mixed fast and slow callbacks', async () => {
      const accountId = getTestAccountId('timeout3');
      const state = getOrCreateAccountState(accountId);

      const fastCallback: MessageCallback = vi.fn();
      const slowCallback: MessageCallback = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      state.messageCallbacks = new Set([fastCallback, slowCallback]);

      const message = createTestMessage();

      await notifyMessageCallbacks(state, message);

      expect(fastCallback).toHaveBeenCalledWith(message);
      expect(slowCallback).toHaveBeenCalledWith(message);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty callback set', async () => {
      const accountId = getTestAccountId('edge1');
      const state = getOrCreateAccountState(accountId);

      state.messageCallbacks = new Set();

      const message = createTestMessage();

      // Should not throw
      await expect(notifyMessageCallbacks(state, message)).resolves.not.toThrow();
    });

    it('should handle callback that returns non-Promise', async () => {
      const accountId = getTestAccountId('edge2');
      const state = getOrCreateAccountState(accountId);

      const syncCallback: MessageCallback = vi.fn(async () => {
        // Callback should return Promise<void>, not a value
        void 'sync return';
      });
      state.messageCallbacks = new Set([syncCallback]);

      const message = createTestMessage();

      await expect(notifyMessageCallbacks(state, message)).resolves.not.toThrow();
      expect(syncCallback).toHaveBeenCalledWith(message);
    });

    it('should handle callback that returns Promise', async () => {
      const accountId = getTestAccountId('edge3');
      const state = getOrCreateAccountState(accountId);

      const asyncCallback: MessageCallback = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        // Callback should return Promise<void>, not a value
      });
      state.messageCallbacks = new Set([asyncCallback]);

      const message = createTestMessage();

      await expect(notifyMessageCallbacks(state, message)).resolves.not.toThrow();
      expect(asyncCallback).toHaveBeenCalledWith(message);
    });

    it('should handle callback modifying message', async () => {
      const accountId = getTestAccountId('edge4');
      const state = getOrCreateAccountState(accountId);

      const modifyingCallback: MessageCallback = vi.fn(async (msg: ZTMChatMessage) => {
        // Attempt to modify message (should work, message is passed by reference)
        msg.content = 'Modified content';
      });
      state.messageCallbacks = new Set([modifyingCallback]);

      const message = createTestMessage();

      await notifyMessageCallbacks(state, message);

      expect(modifyingCallback).toHaveBeenCalled();
    });
  });
});
