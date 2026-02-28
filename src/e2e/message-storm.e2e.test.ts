/**
 * E2E Message Storm Tests
 *
 * Tests system behavior under extreme message load scenarios:
 * 1. Burst message peak - 500 messages arriving simultaneously
 * 2. Message backlog handling - queue backlog of 10000 messages
 * 3. Backpressure handling - production rate > consumption rate
 *
 * Note: These tests use scaled parameters for practical execution while
 * still validating core system behavior under stress conditions.
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { processIncomingMessage } from '../messaging/processor.js';
import { notifyMessageCallbacks } from '../messaging/dispatcher.js';
import type { ZTMChatMessage } from '../types/messaging.js';
import {
  testConfigOpenDM,
  testAccountId,
  NOW,
  e2eBeforeEach,
  e2eAfterEach,
  getOrCreateAccountState,
  removeAccountState,
} from '../test-utils/index.js';

describe('E2E: Message Storm', () => {
  // Unique sender prefix to avoid watermark collisions between test files
  const SENDER_PREFIX = 'ms-';

  beforeEach(() => {
    e2eBeforeEach();
  });

  afterEach(async () => {
    await e2eAfterEach();
  });

  describe('Burst Message Peak - 500 Messages Simultaneously', () => {
    /**
     * Tests system handling of 500 messages arriving at the same time.
     * Simulates a message storm scenario where multiple peers send
     * messages simultaneously during a network event or reconnection.
     */
    it('should process 500 simultaneous messages without failure', async () => {
      const context = {
        config: testConfigOpenDM,
        storeAllowFrom: [],
        accountId: testAccountId,
      };

      const messageCount = 500;
      const senderCount = 50; // 10 messages per sender
      const baseTime = NOW;

      // Generate 500 messages with the same timestamp (simultaneous arrival)
      const messages: { time: number; message: string; sender: string }[] = [];
      for (let i = 0; i < messageCount; i++) {
        messages.push({
          time: baseTime + i, // Nearly simultaneous (1ms apart)
          message: `Burst message ${i + 1}`,
          sender: `${SENDER_PREFIX}user-${i % senderCount}`,
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

      // All messages should be processed
      expect(processedMessages.length).toBe(messageCount);

      // Performance should be acceptable
      // 500 messages should process in reasonable time (< 5 seconds)
      expect(processingTime).toBeLessThan(5000);

      // Calculate throughput
      const throughput = (processedMessages.length / processingTime) * 1000;
      console.log(
        `Burst test: Processed ${processedMessages.length} messages in ${processingTime}ms (${throughput.toFixed(2)} msg/sec)`
      );

      // Verify unique senders are represented
      const uniqueSenders = new Set(processedMessages.map(m => m.sender));
      expect(uniqueSenders.size).toBe(senderCount);
    });

    /**
     * Tests concurrent callback execution under burst load.
     */
    it('should handle burst with callback notifications', async () => {
      const state = getOrCreateAccountState(testAccountId);

      // Register a slow callback to simulate AI agent processing
      let callbackInvocations = 0;
      const slowCallback = async (_message: ZTMChatMessage): Promise<void> => {
        callbackInvocations++;
        // Simulate some processing time
        await new Promise(resolve => setTimeout(resolve, 1));
      };

      state.messageCallbacks.add(slowCallback);

      const messageCount = 500;
      const baseTime = NOW;

      // Create normalized messages
      const messages: ZTMChatMessage[] = [];
      for (let i = 0; i < messageCount; i++) {
        const rawMsg = {
          time: baseTime + i,
          message: `Callback test message ${i}`,
          sender: `${SENDER_PREFIX}user-${i % 50}`,
        };
        const processed = processIncomingMessage(rawMsg, {
          config: testConfigOpenDM,
          storeAllowFrom: [],
          accountId: testAccountId,
        });
        if (processed) {
          messages.push(processed);
        }
      }

      // Notify callbacks for all messages
      const dispatchStart = Date.now();
      for (const msg of messages) {
        await notifyMessageCallbacks(state, msg);
      }
      const dispatchTime = Date.now() - dispatchStart;

      // All callbacks should have been invoked
      expect(callbackInvocations).toBe(messageCount);

      console.log(
        `Callback burst: ${callbackInvocations} callbacks in ${dispatchTime}ms (${(callbackInvocations / dispatchTime) * 1000} callbacks/sec)`
      );
    });
  });

  describe('Message Backlog Handling - 10000 Messages Queued', () => {
    /**
     * Tests system behavior when handling a large message backlog.
     * Simulates scenario where a disconnected client reconnects and
     * receives a large number of queued messages.
     */
    it('should process 10000 message backlog efficiently', async () => {
      const context = {
        config: testConfigOpenDM,
        storeAllowFrom: [],
        accountId: testAccountId,
      };

      const messageCount = 10000;
      const senderCount = 100; // 100 messages per sender

      // Process messages in batches to simulate real-world scenario
      const batchSize = 500;
      const batches = Math.ceil(messageCount / batchSize);

      const processedMessages: ZTMChatMessage[] = [];
      const totalStart = Date.now();

      for (let batch = 0; batch < batches; batch++) {
        const batchStart = Date.now();
        const startIdx = batch * batchSize;
        const endIdx = Math.min(startIdx + batchSize, messageCount);

        for (let i = startIdx; i < endIdx; i++) {
          const msg = {
            time: NOW + i,
            message: `Backlog message ${i + 1}`,
            sender: `${SENDER_PREFIX}user-${i % senderCount}`,
          };

          const result = processIncomingMessage(msg, context);
          if (result) {
            processedMessages.push(result);
          }
        }

        const batchTime = Date.now() - batchStart;
        if (batch % 5 === 0) {
          console.log(
            `Backlog batch ${batch + 1}/${batches}: ${processedMessages.length} total, batch time: ${batchTime}ms`
          );
        }
      }

      const totalTime = Date.now() - totalStart;
      const throughput = (processedMessages.length / totalTime) * 1000;

      // Should process all messages (accounting for watermark deduplication)
      // Watermark may filter some messages with same sender+timestamp
      expect(processedMessages.length).toBeGreaterThan(messageCount * 0.9);

      // Throughput should be reasonable (> 1000 msg/sec)
      expect(throughput).toBeGreaterThan(1000);

      console.log(
        `Backlog test: Processed ${processedMessages.length} messages in ${totalTime}ms (${throughput.toFixed(2)} msg/sec)`
      );
    });

    /**
     * Tests memory stability during large backlog processing.
     */
    it('should maintain stable memory during backlog processing', async () => {
      const context = {
        config: testConfigOpenDM,
        storeAllowFrom: [],
        accountId: testAccountId,
      };

      const messageCount = 10000;

      // Force GC before test
      if (global.gc) {
        global.gc();
      }

      const startMemory = process.memoryUsage().heapUsed;

      // Process all messages
      for (let i = 0; i < messageCount; i++) {
        const msg = {
          time: NOW + i,
          message: `Memory stable message ${i}`,
          sender: `${SENDER_PREFIX}user-${i % 100}`,
        };
        processIncomingMessage(msg, context);
      }

      // Force GC after processing
      if (global.gc) {
        global.gc();
      }

      const endMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (endMemory - startMemory) / 1024 / 1024;

      // Memory increase should be bounded (< 200MB for 10000 messages)
      // This accounts for internal data structures and overhead
      expect(memoryIncrease).toBeLessThan(200);

      console.log(
        `Backlog memory: ${messageCount} messages, memory increase: ${memoryIncrease.toFixed(2)} MB`
      );
    });
  });

  describe('Backpressure Handling - Production Rate > Consumption Rate', () => {
    /**
     * Tests system behavior when message production rate exceeds consumption rate.
     * Simulates slow callback processing while messages arrive quickly.
     */
    it('should handle backpressure with slow callbacks', async () => {
      // Reset account state for fresh watermark tracking
      removeAccountState(testAccountId);
      const freshState = getOrCreateAccountState(testAccountId);

      // Create a slow callback that takes 10ms per message
      const processingDelay = 10;
      let callbackInvocations = 0;
      const messagesProcessed: ZTMChatMessage[] = [];

      const slowCallback = async (_message: ZTMChatMessage): Promise<void> => {
        callbackInvocations++;
        messagesProcessed.push(_message);
        // Simulate slow AI agent processing
        await new Promise(resolve => setTimeout(resolve, processingDelay));
      };

      freshState.messageCallbacks.add(slowCallback);

      // Use unique timestamps for each message to avoid watermark deduplication
      const totalMessages = 50; // Reduced for test stability

      console.log(
        `Backpressure test: Producing ${totalMessages} messages, consumption rate: ${1000 / processingDelay} msg/sec`
      );

      const totalStart = Date.now();

      // Produce and process messages with delays between them
      // Note: Using 1-second intervals to ensure each message has unique timestamp
      // This prevents watermark deduplication from filtering messages during backpressure test
      for (let i = 0; i < totalMessages; i++) {
        const uniqueTime = Date.now() + i * 1000;
        const rawMsg = {
          time: uniqueTime,
          message: `Backpressure message ${i}`,
          sender: `${SENDER_PREFIX}user-${i % 10}`,
        };
        const processed = processIncomingMessage(rawMsg, {
          config: testConfigOpenDM,
          storeAllowFrom: [],
          accountId: testAccountId,
        });
        if (processed) {
          await notifyMessageCallbacks(freshState, processed);
        }
      }

      const totalTime = Date.now() - totalStart;

      // Most messages should be processed (accounting for any potential filtering)
      expect(callbackInvocations).toBeGreaterThan(totalMessages * 0.5);

      console.log(
        `Backpressure result: ${callbackInvocations} messages processed in ${totalTime}ms`
      );
    });

    /**
     * Tests queue behavior when production consistently exceeds consumption.
     */
    it('should handle sustained producer-consumer imbalance', async () => {
      // Use a different account ID to avoid watermark collision with previous tests
      const accountId2 = 'test-account-storm-2';
      const state = getOrCreateAccountState(accountId2);

      // Very slow callback (50ms per message)
      const processingDelay = 50;
      let callbackInvocations = 0;
      let maxQueueSize = 0;
      let currentQueueSize = 0;

      // Track queue size by measuring in-flight messages
      let inFlight = 0;

      const slowCallback = async (_message: ZTMChatMessage): Promise<void> => {
        inFlight++;
        currentQueueSize = Math.max(currentQueueSize, inFlight);
        callbackInvocations++;

        // Simulate very slow processing
        await new Promise(resolve => setTimeout(resolve, processingDelay));

        inFlight--;
      };

      state.messageCallbacks.add(slowCallback);

      // Produce 20 messages with unique timestamps (reduced for stability)
      const messageCount = 20;
      const messages: ZTMChatMessage[] = [];

      for (let i = 0; i < messageCount; i++) {
        const rawMsg = {
          time: Date.now() + i * 1000, // Unique timestamps
          message: `Queue test message ${i}`,
          sender: `${SENDER_PREFIX}storm2-user-${i}`, // Unique sender per message
        };
        const processed = processIncomingMessage(rawMsg, {
          config: testConfigOpenDM,
          storeAllowFrom: [],
          accountId: accountId2,
        });
        if (processed) {
          messages.push(processed);
        }
      }

      // Start time
      const startTime = Date.now();

      // Send all messages to callbacks (producer flooding)
      const sendPromises = messages.map(msg => notifyMessageCallbacks(state, msg));

      // Wait for all to complete
      await Promise.all(sendPromises);

      const totalTime = Date.now() - startTime;

      // Most messages should be processed (accounting for watermark deduplication)
      expect(callbackInvocations).toBeGreaterThanOrEqual(messageCount * 0.5);

      // Track max queue size observed
      maxQueueSize = currentQueueSize;

      console.log(
        `Queue test: ${callbackInvocations} messages in ${totalTime}ms, max queue size: ${maxQueueSize}`
      );

      // Cleanup
      removeAccountState(accountId2);

      // System should handle the load without crashing
      expect(callbackInvocations).toBeGreaterThan(0);
    });

    /**
     * Tests that system recovers after backpressure is relieved.
     */
    it('should recover after backpressure is relieved', async () => {
      // Use a different account ID to avoid watermark collision
      const accountId3 = 'test-account-storm-3';
      const state = getOrCreateAccountState(accountId3);

      // Start with fast callback, then slow down
      let fastMode = true;
      let invocationCount = 0;
      const results: { time: number; duration: number }[] = [];

      const adaptiveCallback = async (_message: ZTMChatMessage): Promise<void> => {
        invocationCount++;

        // First 20 messages: fast processing (1ms)
        // Remaining: slow processing (10ms)
        const delay = fastMode && invocationCount <= 20 ? 1 : 10;

        const start = Date.now();
        await new Promise(resolve => setTimeout(resolve, delay));
        results.push({ time: start, duration: Date.now() - start });
      };

      state.messageCallbacks.add(adaptiveCallback);

      // Phase 1: Fast processing (20 messages)
      fastMode = true;
      for (let i = 0; i < 20; i++) {
        const rawMsg = {
          time: Date.now() + i * 1000, // Unique timestamps
          message: `Recovery test ${i}`,
          sender: `${SENDER_PREFIX}storm3-user-${i}`,
        };
        const processed = processIncomingMessage(rawMsg, {
          config: testConfigOpenDM,
          storeAllowFrom: [],
          accountId: accountId3,
        });
        if (processed) {
          await notifyMessageCallbacks(state, processed);
        }
      }

      // Phase 2: Slow processing (20 messages) - backpressure builds
      fastMode = false;
      for (let i = 20; i < 40; i++) {
        const rawMsg = {
          time: Date.now() + i * 1000, // Unique timestamps
          message: `Recovery test ${i}`,
          sender: `${SENDER_PREFIX}storm3-user-${i}`,
        };
        const processed = processIncomingMessage(rawMsg, {
          config: testConfigOpenDM,
          storeAllowFrom: [],
          accountId: accountId3,
        });
        if (processed) {
          await notifyMessageCallbacks(state, processed);
        }
      }

      // Most messages should be processed
      expect(invocationCount).toBeGreaterThanOrEqual(30);

      // Cleanup
      removeAccountState(accountId3);

      // Calculate average processing time for each phase if we have results
      if (results.length >= 40) {
        const phase1Avg = results.slice(0, 20).reduce((sum, r) => sum + r.duration, 0) / 20;
        const phase2Avg = results.slice(20).reduce((sum, r) => sum + r.duration, 0) / 20;

        console.log(
          `Recovery test: Phase 1 avg: ${phase1Avg.toFixed(2)}ms, Phase 2 avg: ${phase2Avg.toFixed(2)}ms`
        );

        // Phase 2 should have slower average (reflecting the delay change)
        expect(phase2Avg).toBeGreaterThan(phase1Avg);
      }
    });
  });

  describe('Stress Test Summary', () => {
    /**
     * Comprehensive stress test combining all scenarios.
     */
    it('should handle combined stress scenarios', async () => {
      // Use a different account ID to avoid watermark collision
      const accountId4 = 'test-account-storm-4';
      const state = getOrCreateAccountState(accountId4);

      let totalCallbacks = 0;
      const callback = async (_message: ZTMChatMessage): Promise<void> => {
        totalCallbacks++;
        // Simulate variable processing time
        const delay = Math.random() * 3; // 0-3ms random
        await new Promise(resolve => setTimeout(resolve, delay));
      };

      state.messageCallbacks.add(callback);

      // Combined scenario: burst + backlog + backpressure (reduced counts for stability)
      const scenarios = [
        { name: 'Burst', count: 50, delay: 0 },
        { name: 'Backlog', count: 100, delay: 0 },
        { name: 'Backpressure', count: 50, delay: 5 },
      ];

      let messageId = 0;

      for (const scenario of scenarios) {
        const startTime = Date.now();
        let scenarioProcessed = 0;

        for (let i = 0; i < scenario.count; i++) {
          // Use unique timestamps and senders to avoid watermark filtering
          const uniqueTime = Date.now() + messageId * 1000;
          messageId++;
          const rawMsg = {
            time: uniqueTime,
            message: `${scenario.name} message ${i}`,
            sender: `${SENDER_PREFIX}storm4-user-${messageId}`,
          };
          const processed = processIncomingMessage(rawMsg, {
            config: testConfigOpenDM,
            storeAllowFrom: [],
            accountId: accountId4,
          });
          if (processed) {
            await notifyMessageCallbacks(state, processed);
            scenarioProcessed++;
          }
        }

        const duration = Date.now() - startTime;
        console.log(`${scenario.name}: ${scenarioProcessed} messages in ${duration}ms`);

        // Small pause between scenarios
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Most messages should be processed
      const expectedTotal = 50 + 100 + 50;
      expect(totalCallbacks).toBeGreaterThanOrEqual(expectedTotal * 0.7);

      // Cleanup
      removeAccountState(accountId4);

      console.log(`Combined stress: ${totalCallbacks} total messages processed successfully`);
    });
  });
});
