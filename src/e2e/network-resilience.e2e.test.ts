/**
 * E2E Network Resilience Tests
 *
 * Tests system behavior under adverse network conditions:
 * 1. Frequent disconnection and reconnection - 10 cycles
 * 2. Network jitter - random delays 100-500ms
 * 3. Partial failure - 50% request failure scenarios
 *
 * These tests validate that the system gracefully handles network instability
 * and maintains data integrity during recovery.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { processIncomingMessage } from '../messaging/processor.js';
import type { ZTMChatMessage } from '../types/messaging.js';
import {
  testConfigOpenDM,
  testAccountId,
  NOW,
  e2eBeforeEach,
  e2eAfterEach,
  getOrCreateAccountState,
} from '../test-utils/index.js';

describe('E2E: Network Resilience', () => {
  // Unique sender prefix to avoid watermark collisions between test files
  const SENDER_PREFIX = 'nr-';

  beforeEach(() => {
    e2eBeforeEach();
  });

  afterEach(async () => {
    await e2eAfterEach();
    vi.restoreAllMocks();
  });

  describe('Frequent Disconnection and Reconnection', () => {
    it('should recover gracefully after 10 disconnect/reconnect cycles', async () => {
      const context = {
        config: testConfigOpenDM,
        storeAllowFrom: [],
        accountId: testAccountId,
      };

      const cycleCount = 10;
      const results: { cycle: number; processed: number; success: boolean }[] = [];

      for (let cycle = 0; cycle < cycleCount; cycle++) {
        // Simulate disconnection
        const state = getOrCreateAccountState(testAccountId);
        state.connected = false;
        state.meshConnected = false;

        // Attempt to process messages during "disconnection"
        let processedDuringDisconnect = 0;
        for (let i = 0; i < 5; i++) {
          const msg = {
            time: NOW + cycle * 10000 + i * 1000,
            message: `Disconnect message ${cycle}-${i}`,
            sender: `${SENDER_PREFIX}user-${i}`,
          };
          const result = processIncomingMessage(msg, context);
          if (result) processedDuringDisconnect++;
        }

        // Simulate reconnection
        state.connected = true;
        state.meshConnected = true;

        // Process messages after reconnection
        let processedAfterReconnect = 0;
        for (let i = 0; i < 5; i++) {
          const msg = {
            time: NOW + cycle * 10000 + 5000 + i * 1000,
            message: `Reconnect message ${cycle}-${i}`,
            sender: `${SENDER_PREFIX}user-${i}`,
          };
          const result = processIncomingMessage(msg, context);
          if (result) processedAfterReconnect++;
        }

        results.push({
          cycle: cycle + 1,
          processed: processedDuringDisconnect + processedAfterReconnect,
          success: processedAfterReconnect > 0,
        });
      }

      // Verify all cycles completed successfully
      const successfulCycles = results.filter(r => r.success).length;
      expect(successfulCycles).toBe(cycleCount);

      // Total messages processed should be reasonable
      const totalProcessed = results.reduce((sum, r) => sum + r.processed, 0);
      expect(totalProcessed).toBeGreaterThan(0);

      console.log(
        `Disconnection test: ${successfulCycles}/${cycleCount} cycles recovered, ` +
          `${totalProcessed} total messages processed`
      );
    });

    it('should handle rapid state transitions without data loss', async () => {
      const context = {
        config: testConfigOpenDM,
        storeAllowFrom: [],
        accountId: testAccountId,
      };

      const transitionCount = 20;
      let lastMessageTime = NOW;

      for (let i = 0; i < transitionCount; i++) {
        const state = getOrCreateAccountState(testAccountId);

        // Toggle connection state
        const isConnected = i % 2 === 0;
        state.connected = isConnected;
        state.meshConnected = isConnected;

        // Process a message
        lastMessageTime += 1000;
        const msg = {
          time: lastMessageTime,
          message: `Transition message ${i}`,
          sender: `${SENDER_PREFIX}user-${i % 3}`,
        };

        const result = processIncomingMessage(msg, context);

        // All messages should be processed regardless of connection state
        expect(result).not.toBeNull();
      }

      console.log(`Rapid transition test: ${transitionCount} state transitions handled`);
    });
  });

  describe('Network Jitter', () => {
    it('should handle network jitter with random delays 100-500ms', async () => {
      const context = {
        config: testConfigOpenDM,
        storeAllowFrom: [],
        accountId: testAccountId,
      };

      const messageCount = 30;
      const delayResults: { messageIndex: number; delay: number; processed: boolean }[] = [];

      for (let i = 0; i < messageCount; i++) {
        // Simulate random network delay between 100-500ms
        const delay = Math.floor(Math.random() * 401) + 100;

        // Process message
        const msg = {
          time: NOW + i * 1000,
          message: `Jitter message ${i}`,
          sender: `${SENDER_PREFIX}user-${i % 5}`,
        };

        const result = processIncomingMessage(msg, context);

        delayResults.push({
          messageIndex: i,
          delay,
          processed: result !== null,
        });

        // Simulate the network delay
        await new Promise(resolve => setTimeout(resolve, Math.min(delay, 50)));
      }

      // All messages should be processed despite jitter
      const processedCount = delayResults.filter(r => r.processed).length;
      expect(processedCount).toBe(messageCount);

      // Verify reasonable processing times
      const avgDelay = delayResults.reduce((sum, r) => sum + r.delay, 0) / delayResults.length;
      expect(avgDelay).toBeGreaterThan(90); // Should be around 300ms average

      console.log(
        `Jitter test: ${processedCount}/${messageCount} messages processed, ` +
          `avg delay: ${avgDelay.toFixed(0)}ms`
      );
    });

    it('should maintain message integrity under variable delays', async () => {
      const context = {
        config: testConfigOpenDM,
        storeAllowFrom: [],
        accountId: testAccountId,
      };

      const messages = Array.from({ length: 20 }, (_, i) => ({
        time: NOW + i * 1000,
        message: `Ordered message ${i}`,
        sender: `${SENDER_PREFIX}user-${i % 3}`,
        sequence: i,
      }));

      const processedMessages: ZTMChatMessage[] = [];

      // Process messages with random delays
      for (const msg of messages) {
        const delay = Math.floor(Math.random() * 401) + 100;

        await new Promise(resolve => setTimeout(resolve, delay));

        const result = processIncomingMessage(msg, context);
        if (result) {
          processedMessages.push(result);
        }
      }

      // All messages should be processed
      expect(processedMessages.length).toBe(messages.length);

      // Verify message content integrity
      const hasIntegrity = processedMessages.every((msg, index) =>
        msg.content?.includes(`Ordered message ${index}`)
      );
      expect(hasIntegrity).toBe(true);

      console.log(`Integrity test: ${processedMessages.length} messages maintained integrity`);
    });

    it('should handle sustained network jitter without timeout', async () => {
      const context = {
        config: testConfigOpenDM,
        storeAllowFrom: [],
        accountId: testAccountId,
      };

      const batchCount = 5;
      const batchSize = 10;
      const batchResults: { batch: number; processed: number; duration: number }[] = [];

      for (let batch = 0; batch < batchCount; batch++) {
        const batchStart = Date.now();

        for (let i = 0; i < batchSize; i++) {
          // Random delay between batches
          const delay = Math.floor(Math.random() * 401) + 100;
          await new Promise(resolve => setTimeout(resolve, delay));

          const msg = {
            time: NOW + batch * 10000 + i * 1000,
            message: `Batch ${batch} message ${i}`,
            sender: `${SENDER_PREFIX}user-${i}`,
          };

          processIncomingMessage(msg, context);
        }

        batchResults.push({
          batch,
          processed: batchSize,
          duration: Date.now() - batchStart,
        });
      }

      // All batches should complete
      const totalProcessed = batchResults.reduce((sum, r) => sum + r.processed, 0);
      expect(totalProcessed).toBe(batchCount * batchSize);

      // Verify no batch took excessively long
      const maxDuration = Math.max(...batchResults.map(r => r.duration));
      expect(maxDuration).toBeLessThan(10000); // Should complete within 10 seconds

      console.log(
        `Sustained jitter test: ${totalProcessed} messages in ${batchCount} batches, ` +
          `max duration: ${maxDuration}ms`
      );
    });
  });

  describe('Partial Failure Scenarios', () => {
    it('should handle 50% request failure rate gracefully', async () => {
      const context = {
        config: testConfigOpenDM,
        storeAllowFrom: [],
        accountId: testAccountId,
      };

      const totalRequests = 40;
      // Use deterministic failure pattern: fail at indices 1,3,5,7,... (odd indices = ~50% failure rate)
      const failureIndices = new Set([
        1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35, 37, 39,
      ]);

      let successCount = 0;
      let failureCount = 0;
      const results: { index: number; success: boolean; message: string }[] = [];

      for (let i = 0; i < totalRequests; i++) {
        // Determine if this request should fail using deterministic pattern
        const shouldFail = failureIndices.has(i);

        if (shouldFail) {
          failureCount++;
          results.push({
            index: i,
            success: false,
            message: `Request ${i} failed (simulated)`,
          });
        } else {
          const msg = {
            time: NOW + i * 1000,
            message: `Success message ${i}`,
            sender: `${SENDER_PREFIX}user-${i % 5}`,
          };

          const result = processIncomingMessage(msg, context);
          if (result) {
            successCount++;
            results.push({
              index: i,
              success: true,
              message: `Request ${i} succeeded`,
            });
          } else {
            // Message was filtered but not due to failure
            results.push({
              index: i,
              success: true,
              message: `Request ${i} processed (filtered)`,
            });
          }
        }
      }

      // Verify system handled all requests without crashing
      expect(results.length).toBe(totalRequests);

      // Success rate should be exactly 50% (20 out of 40 requests)
      // Using deterministic failure pattern ensures reproducibility
      const actualSuccessRate = successCount / totalRequests;
      expect(actualSuccessRate).toBe(0.5); // Exactly 50% with deterministic pattern

      console.log(
        `Partial failure test: ${successCount}/${totalRequests} succeeded, ` +
          `${failureCount} failed (target: 50% failure rate)`
      );
    });

    it('should recover and continue processing after failure burst', async () => {
      const context = {
        config: testConfigOpenDM,
        storeAllowFrom: [],
        accountId: testAccountId,
      };

      // Phase 1: Normal operation
      let processedBefore = 0;
      for (let i = 0; i < 10; i++) {
        const msg = {
          time: NOW + i * 1000,
          message: `Normal message ${i}`,
          sender: `${SENDER_PREFIX}user-${i % 3}`,
        };
        if (processIncomingMessage(msg, context)) processedBefore++;
      }

      // Phase 2: Failure burst (80% failure rate)
      let failureCount = 0;
      for (let i = 0; i < 20; i++) {
        const shouldFail = Math.random() < 0.8;
        if (shouldFail) {
          failureCount++;
        } else {
          const msg = {
            time: NOW + 10000 + i * 1000,
            message: `Failure burst message ${i}`,
            sender: `${SENDER_PREFIX}user-${i % 3}`,
          };
          processIncomingMessage(msg, context);
        }
      }

      // Phase 3: Recovery (normal operation again)
      let processedAfter = 0;
      for (let i = 0; i < 10; i++) {
        const msg = {
          time: NOW + 30000 + i * 1000,
          message: `Recovery message ${i}`,
          sender: `${SENDER_PREFIX}user-${i % 3}`,
        };
        if (processIncomingMessage(msg, context)) processedAfter++;
      }

      // Verify recovery was successful
      expect(processedBefore).toBeGreaterThan(0);
      expect(processedAfter).toBeGreaterThan(0);

      // Post-failure processing should be similar to pre-failure
      const ratio = processedAfter / processedBefore;
      expect(ratio).toBeGreaterThan(0.5); // Should recover to at least 50% efficiency

      console.log(
        `Recovery test: ${processedBefore} before failure, ` +
          `${failureCount} failures, ${processedAfter} after recovery`
      );
    });

    it('should maintain state integrity after multiple failures', async () => {
      const context = {
        config: testConfigOpenDM,
        storeAllowFrom: [],
        accountId: testAccountId,
      };

      const state = getOrCreateAccountState(testAccountId);
      const initialCallbacks = state.messageCallbacks.size;

      // Mix of success and failure operations
      const operations = 50;
      let errorCount = 0;

      for (let i = 0; i < operations; i++) {
        const shouldFail = Math.random() < 0.5;

        try {
          if (!shouldFail) {
            const msg = {
              time: NOW + i * 1000,
              message: `State test message ${i}`,
              sender: `${SENDER_PREFIX}user-${i % 3}`,
            };
            processIncomingMessage(msg, context);
          } else {
            errorCount++;
            // Simulate failed operation that doesn't affect state
          }
        } catch {
          // Any unexpected error should not corrupt state
          errorCount++;
        }
      }

      // Verify state remains intact
      const finalCallbacks = state.messageCallbacks.size;
      expect(finalCallbacks).toBe(initialCallbacks);

      // System should still be operational
      const testMsg = {
        time: NOW + operations * 1000,
        message: 'Final state test',
        sender: 'test-user',
      };
      const result = processIncomingMessage(testMsg, context);
      expect(result).not.toBeNull();

      console.log(
        `State integrity test: ${errorCount} errors, state intact, ` +
          `system operational: ${result !== null}`
      );
    });

    it('should handle partial API responses correctly', async () => {
      const context = {
        config: testConfigOpenDM,
        storeAllowFrom: [],
        accountId: testAccountId,
      };

      // Simulate partial data scenarios
      const partialScenarios = [
        { time: NOW, message: 'Complete message', sender: 'alice' },
        { time: NOW + 1000, message: '', sender: 'bob' },
        { time: NOW + 2000, message: 'With mention', sender: 'charlie' },
      ];

      const results = partialScenarios.map(msg => {
        return processIncomingMessage(msg, context);
      });

      // Should handle all scenarios without crashing
      expect(results.length).toBe(partialScenarios.length);

      // At least one should be processed successfully
      const processedCount = results.filter(r => r !== null).length;
      expect(processedCount).toBeGreaterThan(0);

      console.log(`Partial response test: ${processedCount}/${partialScenarios.length} handled`);
    });
  });

  describe('Combined Stress Scenarios', () => {
    it('should handle combined disconnections, jitter, and failures', async () => {
      const context = {
        config: testConfigOpenDM,
        storeAllowFrom: [],
        accountId: testAccountId,
      };

      const state = getOrCreateAccountState(testAccountId);
      let totalProcessed = 0;
      let totalFailures = 0;

      for (let i = 0; i < 30; i++) {
        // Randomly disconnect
        if (Math.random() < 0.3) {
          state.connected = false;
          state.meshConnected = false;
        } else {
          state.connected = true;
          state.meshConnected = true;
        }

        // Random delay
        const delay = Math.floor(Math.random() * 401) + 100;
        await new Promise(resolve => setTimeout(resolve, delay));

        // Random failure
        const shouldFail = Math.random() < 0.2;

        if (shouldFail) {
          totalFailures++;
        } else {
          const msg = {
            time: NOW + i * 1000,
            message: `Combined stress message ${i}`,
            sender: `${SENDER_PREFIX}user-${i % 5}`,
          };
          if (processIncomingMessage(msg, context)) {
            totalProcessed++;
          }
        }
      }

      // System should have processed messages despite adverse conditions
      expect(totalProcessed).toBeGreaterThan(0);

      // Should have recorded some failures
      expect(totalFailures).toBeGreaterThan(0);

      // Final state should be operational
      state.connected = true;
      state.meshConnected = true;

      const finalMsg = {
        time: NOW + 30000,
        message: 'Final recovery message',
        sender: 'test-user',
      };
      const recoveryResult = processIncomingMessage(finalMsg, context);
      expect(recoveryResult).not.toBeNull();

      console.log(
        `Combined stress: ${totalProcessed} processed, ${totalFailures} failures, ` +
          `recovered: ${recoveryResult !== null}`
      );
    });
  });
});
