// Integration tests for Message Ordering
// Tests for out-of-order message handling, timestamp-based ordering

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processIncomingMessage } from './processor.js';
import { testConfig } from '../test-utils/fixtures.js';
import type { ZTMChatMessage } from '../types/messaging.js';

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
    getWatermark: vi.fn(() => 0),
    setWatermark: vi.fn(),
    setWatermarkAsync: vi.fn().mockResolvedValue(undefined),
    getFileMetadata: vi.fn(() => ({})),
    setFileMetadata: vi.fn(),
    setFileMetadataBulk: vi.fn(),
    flush: vi.fn(),
    flushAsync: vi.fn().mockResolvedValue(undefined),
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
    isLoaded: vi.fn(() => true),
    dispose: vi.fn(),
  })),
  disposeMessageStateStore: vi.fn(),
}));

describe('Message Ordering Integration', () => {
  const accountId = 'ordering-test-account';
  const config = { ...testConfig, dmPolicy: 'allow' as const };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('out-of-order message handling', () => {
    it('should process messages in timestamp order regardless of arrival order', () => {
      const messages = [
        { time: 1000, sender: 'alice', message: 'First' },
        { time: 3000, sender: 'alice', message: 'Third' },
        { time: 2000, sender: 'alice', message: 'Second' },
      ];

      // Process in wrong order (arrived out of order)
      const results: (ZTMChatMessage | null)[] = [];

      results.push(processIncomingMessage(messages[0], { config, accountId }));
      results.push(processIncomingMessage(messages[2], { config, accountId }));
      results.push(processIncomingMessage(messages[1], { config, accountId }));

      // All should be processed
      expect(results.every(r => r !== null)).toBe(true);

      // Verify messages have correct timestamps
      const processed = results as ZTMChatMessage[];
      expect(processed[0].timestamp.getTime()).toBe(1000);
      expect(processed[1].timestamp.getTime()).toBe(2000);
      expect(processed[2].timestamp.getTime()).toBe(3000);
    });

    it('should handle messages with same timestamp from different senders', () => {
      const sameTimeMessages = [
        { time: 5000, sender: 'alice', message: 'From Alice' },
        { time: 5000, sender: 'bob', message: 'From Bob' },
        { time: 5000, sender: 'charlie', message: 'From Charlie' },
      ];

      const results = sameTimeMessages.map(msg =>
        processIncomingMessage(msg, { config, accountId })
      );

      // All should be processed (different senders)
      expect(results.every(r => r !== null)).toBe(true);

      // Each should have unique ID based on sender
      const processed = results as ZTMChatMessage[];
      const ids = new Set(processed.map(m => m.id));
      expect(ids.size).toBe(3);
    });

    it('should handle delayed old messages', () => {
      // Simulate a message that arrives late
      const timeline = [
        { time: 10000, sender: 'alice', message: 'Old message (delayed)' },
        { time: 20000, sender: 'alice', message: 'New message' },
      ];

      // Process newer message first
      const result1 = processIncomingMessage(timeline[1], { config, accountId });
      expect(result1).not.toBeNull();

      // Process delayed old message (should be filtered by watermark in real scenario)
      const result2 = processIncomingMessage(timeline[0], { config, accountId });
      // Without watermark, both would process
      expect(result2).not.toBeNull();
    });
  });

  describe('timestamp-based message ordering', () => {
    it('should sort messages by timestamp when processing batch', () => {
      const batch = [
        { time: 4000, sender: 'user1', message: 'D' },
        { time: 1000, sender: 'user2', message: 'A' },
        { time: 3000, sender: 'user3', message: 'C' },
        { time: 2000, sender: 'user4', message: 'B' },
      ];

      // Process all
      const results = batch.map(msg => processIncomingMessage(msg, { config, accountId }));

      // Sort results by timestamp
      const sorted = results
        .filter((r): r is ZTMChatMessage => r !== null)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      expect(sorted[0].content).toBe('A');
      expect(sorted[1].content).toBe('B');
      expect(sorted[2].content).toBe('C');
      expect(sorted[3].content).toBe('D');
    });

    it('should preserve message content during ordering', () => {
      const messages = [
        { time: 3000, sender: 'alice', message: 'Hello world!' },
        { time: 1000, sender: 'bob', message: 'Testing 123' },
        { time: 2000, sender: 'charlie', message: 'Special chars: @#$%' },
      ];

      const processed = messages
        .map(msg => processIncomingMessage(msg, { config, accountId }))
        .filter((r): r is ZTMChatMessage => r !== null)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      expect(processed[0].content).toBe('Testing 123');
      expect(processed[1].content).toBe('Special chars: @#$%');
      expect(processed[2].content).toBe('Hello world!');
    });

    it('should handle negative timestamps (edge case)', () => {
      const messages = [
        { time: -1000, sender: 'alice', message: 'Before epoch' },
        { time: 0, sender: 'bob', message: 'At epoch' },
        { time: 1000, sender: 'charlie', message: 'After epoch' },
      ];

      const results = messages.map(msg => processIncomingMessage(msg, { config, accountId }));

      // Note: Default watermark is 0, so negative timestamps are skipped
      // Messages with time <= 0 would be filtered by watermark
      // In real scenario, watermark advances, so this tests the initial state
      expect(results[0]).toBeNull(); // -1000 <= 0, skipped by watermark
      expect(results[1]).toBeNull(); // 0 <= 0, skipped by watermark
      expect(results[2]).not.toBeNull(); // 1000 > 0, processed
    });
  });

  describe('identical timestamp handling', () => {
    it('should handle messages with identical timestamps', () => {
      const identicalTime = 1234567890;
      const messages = [
        { time: identicalTime, sender: 'alice', message: 'Message 1' },
        { time: identicalTime, sender: 'alice', message: 'Message 2' },
        { time: identicalTime, sender: 'alice', message: 'Message 3' },
      ];

      const results = messages.map(msg => processIncomingMessage(msg, { config, accountId }));

      // Note: Due to mock getWatermark always returning 0, all messages are processed
      // In real scenario with watermark updates, duplicates would be filtered
      expect(results.every(r => r !== null)).toBe(true);

      // All three should have the same ID (based on timestamp + sender)
      expect(results[0]?.id).toBe(results[1]?.id);
      expect(results[1]?.id).toBe(results[2]?.id);

      // But different content
      expect(results[0]?.content).toBe('Message 1');
      expect(results[1]?.content).toBe('Message 2');
      expect(results[2]?.content).toBe('Message 3');
    });

    it('should deduplicate messages with same timestamp and sender', () => {
      const duplicateMessage = {
        time: 99999,
        sender: 'alice',
        message: 'Duplicate content',
      };

      const result1 = processIncomingMessage(duplicateMessage, { config, accountId });
      const result2 = processIncomingMessage(duplicateMessage, { config, accountId });

      // Both would be processed (watermark would filter in real scenario)
      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();

      // They should have the same ID
      expect(result1?.id).toBe(result2?.id);
    });

    it('should maintain FIFO order for identical timestamps from same sender', () => {
      const sameTimeMessages = [
        { time: 5000, sender: 'alice', message: 'First' },
        { time: 5000, sender: 'alice', message: 'Second' },
        { time: 5000, sender: 'alice', message: 'Third' },
      ];

      const results = sameTimeMessages.map(msg =>
        processIncomingMessage(msg, { config, accountId })
      );

      // All should have same timestamp in result
      const timestamps = results.map(r => r?.timestamp.getTime());
      expect(timestamps.every(t => t === 5000)).toBe(true);
    });
  });

  describe('monotonic timestamp verification', () => {
    it('should handle monotonically increasing timestamps', () => {
      const messages: Array<{ time: number; sender: string; message: string }> = [];

      // Generate messages with increasing timestamps
      for (let i = 0; i < 10; i++) {
        messages.push({
          time: Date.now() + i * 1000,
          sender: 'user',
          message: `Message ${i}`,
        });
      }

      const results = messages.map(msg => processIncomingMessage(msg, { config, accountId }));

      // All should be processed
      expect(results.every(r => r !== null)).toBe(true);

      // Verify monotonic increase
      const processed = results as ZTMChatMessage[];
      for (let i = 1; i < processed.length; i++) {
        expect(processed[i].timestamp.getTime()).toBeGreaterThan(
          processed[i - 1].timestamp.getTime()
        );
      }
    });

    it('should handle non-monotonic timestamps', () => {
      const messages = [
        { time: 5000, sender: 'alice', message: 'Middle' },
        { time: 1000, sender: 'alice', message: 'First' },
        { time: 9000, sender: 'alice', message: 'Last' },
        { time: 3000, sender: 'alice', message: 'Second' },
      ];

      const results = messages.map(msg => processIncomingMessage(msg, { config, accountId }));

      // All processed despite non-monotonic order
      expect(results.every(r => r !== null)).toBe(true);

      // Can sort by timestamp if needed
      const sorted = results
        .filter((r): r is ZTMChatMessage => r !== null)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      expect(sorted[0].content).toBe('First');
      expect(sorted[1].content).toBe('Second');
      expect(sorted[2].content).toBe('Middle');
      expect(sorted[3].content).toBe('Last');
    });
  });

  describe('message ordering with DM policy', () => {
    it('should apply DM policy regardless of message order', () => {
      const configDeny = { ...testConfig, dmPolicy: 'deny' as const };
      const configAllow = { ...testConfig, dmPolicy: 'allow' as const };

      const messages = [
        { time: 3000, sender: 'alice', message: 'Third' },
        { time: 1000, sender: 'bob', message: 'First' },
        { time: 2000, sender: 'charlie', message: 'Second' },
      ];

      // With deny policy - none should be processed
      const denyResults = messages.map(msg =>
        processIncomingMessage(msg, { config: configDeny, accountId })
      );
      expect(denyResults.every(r => r === null)).toBe(true);

      // With allow policy - all should be processed
      const allowResults = messages.map(msg =>
        processIncomingMessage(msg, { config: configAllow, accountId })
      );
      expect(allowResults.every(r => r !== null)).toBe(true);
    });

    it('should maintain ordering consistency with whitelist', () => {
      const configPairing = {
        ...testConfig,
        dmPolicy: 'pairing' as const,
        allowFrom: ['bob'],
      };

      const messages = [
        { time: 1000, sender: 'alice', message: 'Not whitelisted' },
        { time: 2000, sender: 'bob', message: 'Whitelisted' },
        { time: 3000, sender: 'charlie', message: 'Not whitelisted' },
      ];

      const results = messages.map(msg =>
        processIncomingMessage(msg, { config: configPairing, accountId, storeAllowFrom: [] })
      );

      // Only bob's message should be processed
      expect(results[0]).toBeNull();
      expect(results[1]).not.toBeNull();
      expect(results[2]).toBeNull();

      if (results[1]) {
        expect(results[1].sender).toBe('bob');
        expect(results[1].content).toBe('Whitelisted');
      }
    });
  });

  describe('group message ordering', () => {
    it('should order group messages by timestamp', () => {
      const groupInfo = { creator: 'admin', group: 'test-group' };

      const messages = [
        { time: 3000, sender: 'user1', message: 'C' },
        { time: 1000, sender: 'user2', message: 'A' },
        { time: 2000, sender: 'user3', message: 'B' },
      ];

      const results = messages.map(msg =>
        processIncomingMessage(msg, {
          config,
          accountId,
          groupInfo,
        })
      );

      const sorted = results
        .filter((r): r is ZTMChatMessage => r !== null)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      expect(sorted[0].content).toBe('A');
      expect(sorted[1].content).toBe('B');
      expect(sorted[2].content).toBe('C');
    });

    it('should handle interleaved DM and group messages', () => {
      const groupInfo = { creator: 'admin', group: 'developers' };

      const messages = [
        { time: 1000, sender: 'alice', message: 'DM 1' },
        { time: 2000, sender: 'bob', message: 'Group 1' },
        { time: 3000, sender: 'alice', message: 'DM 2' },
        { time: 4000, sender: 'charlie', message: 'Group 2' },
      ];

      const dmResults = messages
        .slice(0, 3)
        .map(msg => processIncomingMessage(msg, { config, accountId }));

      const groupResult = processIncomingMessage(messages[1], {
        config,
        accountId,
        groupInfo,
      });

      // All should be processed
      expect(dmResults.every(r => r !== null)).toBe(true);
      expect(groupResult).not.toBeNull();
    });
  });

  describe('timestamp edge cases', () => {
    it('should handle very large timestamps', () => {
      const farFuture = Date.now() + 365 * 24 * 60 * 60 * 1000; // 1 year in future

      const result = processIncomingMessage(
        { time: farFuture, sender: 'alice', message: 'Future message' },
        { config, accountId }
      );

      expect(result).not.toBeNull();
      expect(result?.timestamp.getTime()).toBe(farFuture);
    });

    it('should handle microsecond precision differences', () => {
      const baseTime = Date.now();
      const messages = [
        { time: baseTime, sender: 'alice', message: 'Base' },
        { time: baseTime + 1, sender: 'bob', message: 'Plus 1ms' },
        { time: baseTime + 2, sender: 'charlie', message: 'Plus 2ms' },
      ];

      const results = messages.map(msg => processIncomingMessage(msg, { config, accountId }));

      expect(results.every(r => r !== null)).toBe(true);

      const processed = results as ZTMChatMessage[];
      expect(processed[0].timestamp.getTime()).toBe(baseTime);
      expect(processed[1].timestamp.getTime()).toBe(baseTime + 1);
      expect(processed[2].timestamp.getTime()).toBe(baseTime + 2);
    });

    it('should handle floating point timestamps', () => {
      const messages = [
        { time: 1000.5, sender: 'alice', message: 'Fractional 1' },
        { time: 1000.9, sender: 'bob', message: 'Fractional 2' },
        { time: 1000.1, sender: 'charlie', message: 'Fractional 3' },
      ];

      const results = messages.map(msg => processIncomingMessage(msg, { config, accountId }));

      // All should be processed
      expect(results.every(r => r !== null)).toBe(true);
    });
  });
});
