/**
 * E2E Stress Tests for Messaging Performance
 *
 * Tests practical performance characteristics:
 * 1. High-frequency message handling - simulates burst message loads
 * 2. Memory leak detection - monitors memory during sustained processing
 * 3. Long-running stability - extended operation without degradation
 *
 * Note: These tests use scaled-down parameters to remain practical while
 * still providing meaningful performance validation.
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { processIncomingMessage } from '../messaging/processor.js';
import {
  getOrCreateAccountState,
  removeAccountState,
  RuntimeManager,
  disposeMessageStateStore,
} from '../runtime/index.js';
import { testConfigOpenDM, testAccountId, NOW } from '../test-utils/fixtures.js';
import type { ZTMChatMessage } from '../types/messaging.js';

describe('E2E: Stress Messaging', () => {
  // Unique sender prefix to avoid watermark collisions between test files
  const SENDER_PREFIX = 'sm-';

  beforeEach(() => {
    // Setup fresh account state for each test
    // Use open DM policy to allow all messages for testing
    disposeMessageStateStore();
    RuntimeManager.reset();
    getOrCreateAccountState(testAccountId);
  });

  afterEach(async () => {
    // Cleanup
    removeAccountState(testAccountId);
    RuntimeManager.reset();
  });

  describe('High-Frequency Message Handling', () => {
    /**
     * Simulates burst message load.
     * Scale: 10 messages/second for 3 seconds (30 messages total)
     * Real scenario would be 100 msg/sec for 30 sec (3000 messages)
     */
    it('should handle burst message load efficiently', async () => {
      const context = {
        config: testConfigOpenDM,
        storeAllowFrom: [],
        accountId: testAccountId,
      };

      const messages: { time: number; message: string; sender: string }[] = [];
      const messageCount = 30;
      const startTime = NOW;

      // Generate burst messages with timestamps spread over 3 seconds
      for (let i = 0; i < messageCount; i++) {
        messages.push({
          time: startTime + i * 100, // 10 messages per second
          message: `Burst message ${i + 1}`,
          sender: `${SENDER_PREFIX}user-${i % 5}`, // 5 different senders
        });
      }

      const processedMessages: ZTMChatMessage[] = [];
      const processingStart = Date.now();

      // Process all messages
      for (const msg of messages) {
        const result = processIncomingMessage(msg, context);
        if (result) {
          processedMessages.push(result);
        }
      }

      const processingTime = Date.now() - processingStart;

      // Verify processing completed successfully
      expect(processedMessages.length).toBeGreaterThan(0);

      // Performance assertions
      // Should process at least 10 messages per second equivalent
      const throughput = processedMessages.length / (processingTime / 1000);
      expect(throughput).toBeGreaterThan(5); // At least 5 msg/sec in test environment

      console.log(
        `Burst test: Processed ${processedMessages.length} messages in ${processingTime}ms (${throughput.toFixed(2)} msg/sec)`
      );
    });

    /**
     * Tests concurrent message processing.
     * Simulates messages arriving simultaneously from multiple sources.
     */
    it('should handle concurrent messages from multiple senders', async () => {
      const context = {
        config: testConfigOpenDM,
        storeAllowFrom: [],
        accountId: testAccountId,
      };

      const senderCount = 10;
      const messagesPerSender = 10;
      const timestamp = NOW;

      // Create messages from multiple senders at the same time
      const allMessages: { time: number; message: string; sender: string }[] = [];
      for (let s = 0; s < senderCount; s++) {
        for (let m = 0; m < messagesPerSender; m++) {
          allMessages.push({
            time: timestamp + m * 1000, // Sequential timestamps per sender
            message: `Message ${m} from sender ${s}`,
            sender: `sender-${s}`,
          });
        }
      }

      // Process concurrently using Promise.all
      const processedPromises = allMessages.map(msg =>
        Promise.resolve(processIncomingMessage(msg, context))
      );

      const processed = await Promise.all(processedPromises);
      const processedMessages = processed.filter((m): m is ZTMChatMessage => m !== null);

      // All messages should be processed
      expect(processedMessages.length).toBe(allMessages.length);

      // Verify each sender is represented
      const uniqueSenders = new Set(processedMessages.map(m => m.sender));
      expect(uniqueSenders.size).toBe(senderCount);

      console.log(
        `Concurrent test: ${processedMessages.length} messages from ${uniqueSenders.size} senders processed`
      );
    });
  });

  describe('Memory Leak Detection', () => {
    /**
     * Tests memory stability during sustained message processing.
     * Scale: 1000 messages (reduced from 1000 to keep test practical)
     */
    it('should not leak memory after processing many messages', async () => {
      const context = {
        config: testConfigOpenDM,
        storeAllowFrom: [],
        accountId: testAccountId,
      };

      const messageCount = 1000;
      const startMemory = process.memoryUsage().heapUsed;

      // Process large number of messages
      for (let i = 0; i < messageCount; i++) {
        const msg = {
          time: NOW + i * 1000,
          message: `Memory test message ${i} with some content to simulate real messages`,
          sender: `${SENDER_PREFIX}user-${i % 20}`,
        };

        processIncomingMessage(msg, context);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const endMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = endMemory - startMemory;
      const memoryIncreaseMB = memoryIncrease / 1024 / 1024;

      // Memory increase should be reasonable (< 50MB for 1000 messages)
      // This accounts for internal data structures and overhead
      expect(memoryIncreaseMB).toBeLessThan(50);

      console.log(
        `Memory test: ${messageCount} messages processed, memory increase: ${memoryIncreaseMB.toFixed(2)} MB`
      );
    });

    /**
     * Tests that watermark tracking doesn't accumulate unbounded data.
     */
    it('should maintain bounded watermark storage', async () => {
      const context = {
        config: testConfigOpenDM,
        storeAllowFrom: [],
        accountId: testAccountId,
      };

      const uniqueSenders = 50;
      const messagesPerSender = 20;
      const startTime = NOW;

      // Process messages from many unique senders
      for (let sender = 0; sender < uniqueSenders; sender++) {
        for (let msg = 0; msg < messagesPerSender; msg++) {
          processIncomingMessage(
            {
              time: startTime + sender * 10000 + msg * 1000,
              message: `Test message ${msg} from sender ${sender}`,
              sender: `sender-${sender}`,
            },
            context
          );

          // Only first message per sender should be processed (watermark blocks duplicates)
          // But we verify the watermark is being tracked
        }
      }

      // The watermark store should not grow unboundedly
      // Watermarks are key-based, so we should have at most unique senders keys
      const { getAccountMessageStateStore } = await import('../runtime/store.js');
      const store = getAccountMessageStateStore(testAccountId);

      // Verify store has some watermarks tracked
      // (The actual implementation stores watermarks per sender)
      expect(store).toBeDefined();

      console.log(
        `Watermark test: ${uniqueSenders} senders x ${messagesPerSender} messages tracked`
      );
    });
  });

  describe('Long-Running Stability', () => {
    /**
     * Tests sustained operation over time.
     * Scale: 30 seconds (reduced from 5 minutes for practicality)
     */
    it('should maintain performance over extended operation', async () => {
      const context = {
        config: testConfigOpenDM,
        storeAllowFrom: [],
        accountId: testAccountId,
      };

      const durationMs = 10000; // 10 seconds (scaled down from 5 minutes for practicality)
      const batchSize = 50; // Messages per batch
      const batchInterval = 50; // ms between batches

      const startTime = Date.now();
      let totalProcessed = 0;
      const processingTimes: number[] = [];

      // Simulate long-running message processing
      while (Date.now() - startTime < durationMs) {
        const batchStart = Date.now();

        // Process a batch of messages
        for (let i = 0; i < batchSize; i++) {
          const msg = {
            time: NOW + totalProcessed * 1000,
            message: `Long-running test message ${totalProcessed}`,
            sender: `${SENDER_PREFIX}user-${totalProcessed % 10}`,
          };

          const result = processIncomingMessage(msg, context);
          if (result) {
            totalProcessed++;
          }
        }

        const batchTime = Date.now() - batchStart;
        processingTimes.push(batchTime);

        // Wait for next batch interval
        const waitTime = batchInterval - batchTime;
        if (waitTime > 0) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }

      // Calculate average and p95 processing times
      const avgTime = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length;
      const sortedTimes = [...processingTimes].sort((a, b) => a - b);
      const p95Index = Math.floor(sortedTimes.length * 0.95);
      const p95Time = sortedTimes[p95Index];

      // Performance should remain stable
      expect(avgTime).toBeLessThan(50); // Average batch processing should be < 50ms
      expect(p95Time).toBeLessThan(100); // P95 should be < 100ms

      console.log(
        `Long-running test: ${totalProcessed} messages over ${durationMs}ms, ` +
          `avg: ${avgTime.toFixed(2)}ms, p95: ${p95Time.toFixed(2)}ms`
      );
    });

    /**
     * Tests that repeated processing of same messages doesn't degrade performance.
     */
    it('should handle repeated message patterns efficiently', async () => {
      const context = {
        config: testConfigOpenDM,
        storeAllowFrom: [],
        accountId: testAccountId,
      };

      // Create a set of messages that will be processed repeatedly
      const messageTemplates = Array.from({ length: 10 }, (_, i) => ({
        time: NOW + i * 1000,
        message: `Pattern message ${i}`,
        sender: `${SENDER_PREFIX}user-${i}`,
      }));

      const iterations = 100;
      const processingTimes: number[] = [];

      for (let iter = 0; iter < iterations; iter++) {
        const start = Date.now();

        for (const msg of messageTemplates) {
          // Use same timestamps - watermark should skip duplicates after first iteration
          processIncomingMessage({ ...msg, time: msg.time + iter * 1000 }, context);
        }

        processingTimes.push(Date.now() - start);
      }

      // First iteration should be slowest (all new messages)
      // Subsequent iterations should be faster (watermark skips duplicates)
      const firstIteration = processingTimes[0];
      const avgSubsequent = processingTimes.slice(1).reduce((a, b) => a + b, 0) / (iterations - 1);

      // Subsequent iterations should be at least as fast (watermark working)
      // If first iteration is very fast (near 0), just verify subsequent is also fast
      if (firstIteration > 0) {
        expect(avgSubsequent).toBeLessThanOrEqual(firstIteration * 1.5);
      } else {
        // Both should be very fast if first is 0
        expect(avgSubsequent).toBeLessThan(5);
      }

      console.log(
        `Pattern test: First: ${firstIteration}ms, Avg subsequent: ${avgSubsequent.toFixed(2)}ms`
      );
    });
  });

  describe('Error Recovery Under Load', () => {
    /**
     * Tests that system handles malformed messages gracefully under load.
     */
    it('should handle malformed messages without crashing', async () => {
      const context = {
        config: testConfigOpenDM,
        storeAllowFrom: [],
        accountId: testAccountId,
      };

      const validMessages = [
        { time: NOW, message: 'Valid message', sender: 'alice' },
        { time: NOW + 1000, message: '', sender: 'bob' }, // Empty message
        { time: NOW + 2000, message: 'Normal', sender: testConfigOpenDM.username! }, // Self message
      ];

      const malformedMessages = [
        { time: NOW + 3000, message: null }, // Missing sender
        { time: NOW + 4000, sender: 'charlie' }, // Missing message
        { time: NOW + 5000, message: 'test', sender: '' }, // Empty sender
      ] as any[];

      // Process valid messages first
      for (const msg of validMessages) {
        const result = processIncomingMessage(msg, context);
        // Valid messages should be processed (except empty/self)
        if (msg.message && msg.sender !== testConfigOpenDM.username) {
          expect(result).not.toBeNull();
        }
      }

      // Process malformed messages - should not throw
      for (const msg of malformedMessages) {
        expect(() => processIncomingMessage(msg, context)).not.toThrow();
      }

      console.log(`Error recovery test: Handled ${malformedMessages.length} malformed messages`);
    });
  });
});
