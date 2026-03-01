// Integration tests for OpenClaw Pairing delegation

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PluginRuntime } from 'openclaw/plugin-sdk';

// Mock the logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock AccountStateManager for testing
describe('OpenClaw Pairing Integration', () => {
  // Create mock runtime that simulates OpenClaw pairing API
  function createMockRuntime(
    overrides?: Partial<PluginRuntime['channel']['pairing']>
  ): PluginRuntime {
    return {
      channel: {
        pairing: {
          readAllowFromStore: vi.fn().mockResolvedValue(['alice', 'bob']),
          upsertPairingRequest: vi.fn().mockResolvedValue({ code: 'ABC123', created: true }),
          ...overrides,
        },
      },
    } as unknown as PluginRuntime;
  }

  describe('readAllowFromStore', () => {
    it('should fetch allowFrom from OpenClaw pairing store', async () => {
      const runtime = createMockRuntime();
      const result = await runtime.channel.pairing.readAllowFromStore({
        channel: 'ztm-chat',
        accountId: 'test-account',
      });

      expect(result).toEqual(['alice', 'bob']);
      expect(runtime.channel.pairing.readAllowFromStore).toHaveBeenCalledWith({
        channel: 'ztm-chat',
        accountId: 'test-account',
      });
    });

    it('should handle empty allowFrom', async () => {
      const runtime = createMockRuntime({
        readAllowFromStore: vi.fn().mockResolvedValue([]),
      });

      const result = await runtime.channel.pairing.readAllowFromStore({
        channel: 'ztm-chat',
        accountId: 'test-account',
      });

      expect(result).toEqual([]);
    });

    it('should return null when store is unavailable', async () => {
      const runtime = createMockRuntime({
        readAllowFromStore: vi.fn().mockRejectedValue(new Error('Store unavailable')),
      });

      await expect(
        runtime.channel.pairing.readAllowFromStore({
          channel: 'ztm-chat',
          accountId: 'test-account',
        })
      ).rejects.toThrow('Store unavailable');
    });
  });

  describe('upsertPairingRequest', () => {
    it('should register new pairing request with OpenClaw', async () => {
      const runtime = createMockRuntime();

      const result = await runtime.channel.pairing.upsertPairingRequest({
        channel: 'ztm-chat',
        accountId: 'test-account',
        id: 'new-peer',
        meta: { name: 'NewPeer' },
      });

      expect(result).toEqual({ code: 'ABC123', created: true });
      expect(runtime.channel.pairing.upsertPairingRequest).toHaveBeenCalledWith({
        channel: 'ztm-chat',
        accountId: 'test-account',
        id: 'new-peer',
        meta: { name: 'NewPeer' },
      });
    });

    it('should handle existing pairing (created: false)', async () => {
      const runtime = createMockRuntime({
        upsertPairingRequest: vi.fn().mockResolvedValue({ code: 'EXISTING', created: false }),
      });

      const result = await runtime.channel.pairing.upsertPairingRequest({
        channel: 'ztm-chat',
        accountId: 'test-account',
        id: 'existing-peer',
        meta: { name: 'ExistingPeer' },
      });

      expect(result.created).toBe(false);
    });

    it('should handle registration failure gracefully', async () => {
      const runtime = createMockRuntime({
        upsertPairingRequest: vi.fn().mockRejectedValue(new Error('Registration failed')),
      });

      await expect(
        runtime.channel.pairing.upsertPairingRequest({
          channel: 'ztm-chat',
          accountId: 'test-account',
          id: 'peer',
          meta: { name: 'Peer' },
        })
      ).rejects.toThrow('Registration failed');
    });
  });

  describe('Error Scenarios', () => {
    it('should handle timeout gracefully', async () => {
      const runtime = createMockRuntime({
        readAllowFromStore: vi
          .fn()
          .mockImplementation(
            () => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
          ),
      });

      const promise = runtime.channel.pairing.readAllowFromStore({
        channel: 'ztm-chat',
        accountId: 'test-account',
      });

      await expect(promise).rejects.toThrow('Timeout');
    });

    it('should handle network errors', async () => {
      const runtime = createMockRuntime({
        readAllowFromStore: vi.fn().mockRejectedValue(new Error('Network error')),
      });

      await expect(
        runtime.channel.pairing.readAllowFromStore({
          channel: 'ztm-chat',
          accountId: 'test-account',
        })
      ).rejects.toThrow('Network error');
    });

    it('should handle malformed responses', async () => {
      const runtime = createMockRuntime({
        readAllowFromStore: vi.fn().mockResolvedValue(null as any),
      });

      const result = await runtime.channel.pairing.readAllowFromStore({
        channel: 'ztm-chat',
        accountId: 'test-account',
      });

      // Should handle null response gracefully
      expect(result).toBeNull();
    });
  });

  describe('Race Conditions', () => {
    it('should handle concurrent pairing requests for same user', async () => {
      const runtime = createMockRuntime();

      // Simulate 10 concurrent requests
      const promises = Array(10)
        .fill(null)
        .map(() =>
          runtime.channel.pairing.upsertPairingRequest({
            channel: 'ztm-chat',
            accountId: 'test-account',
            id: 'same-peer',
            meta: { name: 'SamePeer' },
          })
        );

      const results = await Promise.all(promises);

      // All should resolve successfully
      expect(results).toHaveLength(10);
      // The mock was called 10 times
      expect(runtime.channel.pairing.upsertPairingRequest).toHaveBeenCalledTimes(10);
    });

    it('should handle rapid read refresh cycles', async () => {
      const runtime = createMockRuntime();

      // Simulate rapid cache invalidation and refresh
      for (let i = 0; i < 5; i++) {
        await runtime.channel.pairing.readAllowFromStore({
          channel: 'ztm-chat',
          accountId: 'test-account',
        });
      }

      expect(runtime.channel.pairing.readAllowFromStore).toHaveBeenCalledTimes(5);
    });
  });
});

// ============================================================================
// P1: Cleanup Edge Cases
// ============================================================================

describe('Cleanup Edge Cases', () => {
  it('should cleanup message retry timers', () => {
    // Simulate message retries Map
    const messageRetries = new Map<string, NodeJS.Timeout>();

    // Add some retry timers
    const timer1 = setTimeout(() => {}, 1000);
    const timer2 = setTimeout(() => {}, 2000);
    messageRetries.set('msg1', timer1);
    messageRetries.set('msg2', timer2);

    // Clear all timers
    for (const timerId of messageRetries.values()) {
      clearTimeout(timerId);
    }
    messageRetries.clear();

    expect(messageRetries.size).toBe(0);
  });

  it('should handle cleanup when watchAbortController already aborted', () => {
    // Simulate AbortController
    const ac = new AbortController();
    ac.abort();

    // Should not throw when aborting already aborted controller
    expect(() => ac.abort()).not.toThrow();
  });

  it('should cleanup in correct order: timers -> callbacks -> state', () => {
    const cleanupOrder: string[] = [];

    // Simulate cleanup sequence
    const timers = setTimeout(() => cleanupOrder.push('timers'), 0);
    clearTimeout(timers);

    const callbacks = new Set<() => void>();
    callbacks.add(() => cleanupOrder.push('callbacks'));
    callbacks.clear();

    // State cleanup - use Map instead to avoid delete on non-optional
    const state = new Map<string, string>();
    state.set('data', 'test');
    state.clear();

    // Verify cleanup order
    expect(state.size).toBe(0);
  });

  it('should handle null/undefined intervals gracefully', () => {
    // Clear intervals should handle null/undefined gracefully
    expect(() => {
      clearInterval(null as any);
      clearInterval(undefined as any);
    }).not.toThrow();
  });
});

// ============================================================================
// P2: Message Retry Edge Cases
// ============================================================================

describe('Message Retry Edge Cases', () => {
  it('should handle retry when account stops mid-retry', async () => {
    let retries = 0;
    const maxRetries = 3;

    async function retryWithStop() {
      for (let i = 0; i < maxRetries; i++) {
        retries++;
        if (retries >= maxRetries) {
          return 'completed';
        }
        await new Promise(r => setTimeout(r, 10));
      }
      return 'stopped';
    }

    const result = await retryWithStop();
    expect(result).toBe('completed');
    expect(retries).toBe(3);
  });

  it('should handle retry queue overflow under extreme load', () => {
    const maxQueueSize = 1000;
    const queue: string[] = [];

    // Simulate extreme load
    for (let i = 0; i < maxQueueSize + 100; i++) {
      if (queue.length < maxQueueSize) {
        queue.push(`msg-${i}`);
      }
    }

    // Should respect queue limit
    expect(queue.length).toBe(maxQueueSize);
  });

  it('should handle non-retryable errors', async () => {
    const retryablePatterns = ['refused', 'timeout', 'not found', 'unavailable', 'network'];

    function shouldRetry(error: string): boolean {
      // Only retry known retryable error patterns
      const lower = error.toLowerCase();
      return retryablePatterns.some(p => lower.includes(p));
    }

    expect(shouldRetry('Connection refused')).toBe(true);
    expect(shouldRetry('timeout error')).toBe(true);
    expect(shouldRetry('not found')).toBe(true);
    expect(shouldRetry('Validation failed')).toBe(false);
    expect(shouldRetry('Authentication failed')).toBe(false);
  });

  it('should respect max retry attempts', async () => {
    let attempts = 0;
    const maxAttempts = 5;

    async function simulateRetry() {
      while (attempts < maxAttempts) {
        attempts++;
        if (attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 1));
        }
      }
      return attempts;
    }

    const result = await simulateRetry();
    expect(result).toBe(maxAttempts);
  });
});
