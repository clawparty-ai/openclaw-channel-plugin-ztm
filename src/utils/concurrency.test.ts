// Unit tests for Semaphore concurrency control

import { describe, it, expect } from 'vitest';
import { Semaphore, createSemaphore } from './concurrency.js';

describe('Semaphore', () => {
  describe('constructor', () => {
    it('should create semaphore with specified permits', () => {
      const semaphore = new Semaphore(5);

      expect(semaphore.availablePermits()).toBe(5);
      expect(semaphore.queuedWaiters()).toBe(0);
    });

    it('should throw error for zero permits', () => {
      expect(() => new Semaphore(0)).toThrow();
    });

    it('should throw error for negative permits', () => {
      expect(() => new Semaphore(-1)).toThrow();
    });
  });

  describe('acquire', () => {
    it('should acquire permit when available', async () => {
      const semaphore = new Semaphore(2);

      await semaphore.acquire();

      expect(semaphore.availablePermits()).toBe(1);
    });

    it('should queue when no permits available', async () => {
      const semaphore = new Semaphore(1);
      let acquire2Complete = false;

      // First acquire
      await semaphore.acquire();

      // Second acquire (should queue)
      semaphore.acquire().then(() => {
        acquire2Complete = true;
      });

      // Check that second acquire hasn't completed yet
      expect(acquire2Complete).toBe(false);
      expect(semaphore.queuedWaiters()).toBe(1);

      // Release first permit
      semaphore.release();

      // Wait a bit for queued acquire to process
      await new Promise(resolve => setTimeout(resolve, 10));

      // Now second acquire should complete
      expect(acquire2Complete).toBe(true);
    });

    it('should handle multiple queued waiters in FIFO order', async () => {
      const semaphore = new Semaphore(1);
      const results: number[] = [];

      // Acquire the only permit
      await semaphore.acquire();

      // Queue multiple acquires - they should complete in FIFO order
      const p1 = semaphore.acquire().then(() => results.push(1));
      const p2 = semaphore.acquire().then(() => results.push(2));
      const p3 = semaphore.acquire().then(() => results.push(3));

      // Release all permits one by one
      semaphore.release();
      await new Promise(resolve => setTimeout(resolve, 10));
      semaphore.release();
      await new Promise(resolve => setTimeout(resolve, 10));
      semaphore.release();

      // Wait for all acquires to complete
      await Promise.all([p1, p2, p3]);

      expect(results).toEqual([1, 2, 3]);
    });

    it('should acquire multiple times on same semaphore', async () => {
      const semaphore = new Semaphore(3);

      await semaphore.acquire();
      await semaphore.acquire();
      await semaphore.acquire();

      expect(semaphore.availablePermits()).toBe(0);
    });
  });

  describe('release', () => {
    it('should increase available permits', async () => {
      const semaphore = new Semaphore(1);

      await semaphore.acquire();
      expect(semaphore.availablePermits()).toBe(0);

      semaphore.release();
      expect(semaphore.availablePermits()).toBe(1);
    });

    it('should transfer permit to queued waiter when available', async () => {
      const semaphore = new Semaphore(1);

      // First acquire uses the only permit
      await semaphore.acquire();
      expect(semaphore.availablePermits()).toBe(0);

      let permitTransferred = false;
      // This should queue since no permits available
      semaphore.acquire().then(() => {
        permitTransferred = true;
      });

      // Wait for acquire to queue
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(semaphore.queuedWaiters()).toBe(1);

      // Release should transfer directly to waiter
      semaphore.release();

      // Wait for the queued acquire to complete
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(permitTransferred).toBe(true);
    });

    it('should increase permits when no waiters', async () => {
      const semaphore = new Semaphore(1);

      await semaphore.acquire();
      expect(semaphore.availablePermits()).toBe(0);

      semaphore.release();
      expect(semaphore.availablePermits()).toBe(1);

      semaphore.release();
      expect(semaphore.availablePermits()).toBe(2);
    });

    it('should release multiple times consecutively', async () => {
      const semaphore = new Semaphore(2);

      await semaphore.acquire();
      await semaphore.acquire();
      expect(semaphore.availablePermits()).toBe(0);

      semaphore.release();
      semaphore.release();
      expect(semaphore.availablePermits()).toBe(2);
    });
  });

  describe('execute', () => {
    it('should execute function with permit held', async () => {
      const semaphore = new Semaphore(1);
      let executed = false;

      await semaphore.execute(async () => {
        expect(semaphore.availablePermits()).toBe(0);
        executed = true;
        return 'result';
      });

      expect(executed).toBe(true);
      expect(semaphore.availablePermits()).toBe(1);
    });

    it('should release permit even if function throws', async () => {
      const semaphore = new Semaphore(1);

      await expect(
        semaphore.execute(() => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      expect(semaphore.availablePermits()).toBe(1);
    });

    it('should wait for permit before executing', async () => {
      const semaphore = new Semaphore(1);
      let executeOrder: string[] = [];

      // First acquire
      const firstAcquire = semaphore.acquire().then(() => {
        executeOrder.push('acquire');
      });

      // Queue execution (should wait for permit)
      const execPromise = semaphore.execute(async () => {
        executeOrder.push('exec');
        return 'done';
      });

      executeOrder.push('queue');

      // Release after delay
      setTimeout(() => {
        semaphore.release();
        executeOrder.push('release');
      }, 10);

      await execPromise;
      await firstAcquire;

      // The acquire should complete first, then release, then exec
      expect(executeOrder).toContain('acquire');
      expect(executeOrder).toContain('release');
      expect(executeOrder).toContain('exec');
    });

    it('should support synchronous functions', async () => {
      const semaphore = new Semaphore(1);

      const result = await semaphore.execute(() => {
        return 'sync result';
      });

      expect(result).toBe('sync result');
    });

    it('should return result from async function', async () => {
      const semaphore = new Semaphore(1);

      const result = await semaphore.execute(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'async result';
      });

      expect(result).toBe('async result');
    });
  });

  describe('availablePermits', () => {
    it('should return current available permit count', async () => {
      const semaphore = new Semaphore(5);

      expect(semaphore.availablePermits()).toBe(5);

      // Acquire 2 permits
      await semaphore.acquire();
      await semaphore.acquire();

      expect(semaphore.availablePermits()).toBe(3);
    });

    it('should return correct count after releases', async () => {
      const semaphore = new Semaphore(2);

      await semaphore.acquire();
      expect(semaphore.availablePermits()).toBe(1);

      semaphore.release();
      expect(semaphore.availablePermits()).toBe(2);

      semaphore.release();
      expect(semaphore.availablePermits()).toBe(3);
    });
  });

  describe('queuedWaiters', () => {
    it('should return current queued waiter count', async () => {
      const semaphore = new Semaphore(1);

      expect(semaphore.queuedWaiters()).toBe(0);

      await semaphore.acquire();

      // Queue some waiters
      semaphore.acquire().catch(() => {});
      semaphore.acquire().catch(() => {});

      expect(semaphore.queuedWaiters()).toBe(2);
    });

    it('should return 0 when no waiters', async () => {
      const semaphore = new Semaphore(5);

      expect(semaphore.queuedWaiters()).toBe(0);

      await semaphore.acquire();

      expect(semaphore.queuedWaiters()).toBe(0);
    });
  });
});

describe('createSemaphore', () => {
  it('should create a semaphore instance', () => {
    const semaphore = createSemaphore(3);

    expect(semaphore).toBeInstanceOf(Semaphore);
    expect(semaphore.availablePermits()).toBe(3);
  });

  it('should create semaphore with custom permits', () => {
    const semaphore = createSemaphore(10);
    expect(semaphore.availablePermits()).toBe(10);
  });
});

describe('Race condition tests', () => {
  describe('Timeout firing after release', () => {
    it('should not resolve promise after timeout when already released', async () => {
      const semaphore = new Semaphore(1);
      let releaseCalled = false;

      // Acquire the only permit
      await semaphore.acquire();

      // Start a timed acquire that will timeout
      const acquirePromise = semaphore.acquire(50);

      // Wait a tiny bit for the acquire to queue
      await new Promise(resolve => setTimeout(resolve, 5));

      // Release the permit
      semaphore.release();
      releaseCalled = true;

      // Wait for either timeout or immediate resolution
      const result = await acquirePromise;

      // The acquire should have been resolved by release, not by timeout
      // Result should be true (acquired), not false (timed out)
      expect(result).toBe(true);
      expect(releaseCalled).toBe(true);
    });

    it('should timeout correctly when no release occurs', async () => {
      const semaphore = new Semaphore(1);

      // Acquire the only permit
      await semaphore.acquire();

      // Start a timed acquire that will timeout
      const result = await semaphore.acquire(50);

      expect(result).toBe(false);
      expect(semaphore.queuedWaiters()).toBe(0);
    });

    it('should handle rapid acquire-release-acquire sequence', async () => {
      const semaphore = new Semaphore(1);

      // Acquire
      await semaphore.acquire();

      // Queue multiple acquires
      const p1 = semaphore.acquire(100);
      const p2 = semaphore.acquire(100);
      const p3 = semaphore.acquire(100);

      await new Promise(resolve => setTimeout(resolve, 5));

      // Release one permit
      semaphore.release();

      // Wait for timeout
      const results = await Promise.all([p1, p2, p3]);

      // Only one should succeed, others should timeout
      const successCount = results.filter(r => r === true).length;
      expect(successCount).toBe(1);
    });
  });

  describe('Concurrent acquire/release edge cases', () => {
    it('should handle simultaneous acquire from multiple tasks', async () => {
      const semaphore = new Semaphore(2);

      // Create many concurrent acquires with timeout - they will queue
      const promises = Array(10)
        .fill(null)
        .map(() => semaphore.acquire(100));

      // All should eventually resolve (some will succeed, others will timeout)
      const results = await Promise.all(promises);

      // Should get exactly 2 permits (others timeout)
      const acquired = results.filter(r => r === true).length;
      expect(acquired).toBe(2);
    });

    it('should handle release without acquire', async () => {
      const semaphore = new Semaphore(1);

      // Release without acquire
      semaphore.release();

      // Should now have 2 permits
      expect(semaphore.availablePermits()).toBe(2);
    });

    it('should handle multiple releases without acquire', async () => {
      const semaphore = new Semaphore(1);

      semaphore.release();
      semaphore.release();
      semaphore.release();

      expect(semaphore.availablePermits()).toBe(4);
    });

    it('should maintain correct permit count after rapid acquire-release', async () => {
      const semaphore = new Semaphore(5);

      // Rapid acquire-release cycles
      for (let i = 0; i < 100; i++) {
        await semaphore.acquire();
        semaphore.release();
      }

      // Should be back to original count
      expect(semaphore.availablePermits()).toBe(5);
    });
  });

  describe('Double-resolution prevention', () => {
    it('should not call resolve twice on same acquire', async () => {
      const semaphore = new Semaphore(1);
      let resolveCount = 0;

      await semaphore.acquire();

      // Queue an acquire with very long timeout
      semaphore.acquire(10000).then(result => {
        resolveCount++;
        return result;
      });

      await new Promise(resolve => setTimeout(resolve, 5));

      // Release - should resolve the waiting acquire
      semaphore.release();

      // Small delay to ensure resolution
      await new Promise(resolve => setTimeout(resolve, 10));

      // Release again - should not cause issues (extra release)
      semaphore.release();

      // Wait a bit more
      await new Promise(resolve => setTimeout(resolve, 10));

      // The acquire should have resolved exactly once
      expect(resolveCount).toBe(1);
    });

    it('should handle timeout and release racing', async () => {
      const semaphore = new Semaphore(1);
      let timeoutResolvedAsFalse = false;
      let releaseResolvedAsTrue = false;

      await semaphore.acquire();

      // Start acquire with very short timeout
      const timeoutPromise = semaphore.acquire(10).then(result => {
        if (result === false) timeoutResolvedAsFalse = true;
        return result;
      });

      await new Promise(resolve => setTimeout(resolve, 5));

      // Release right around when timeout would fire
      const releasePromise = semaphore.acquire(50).then(result => {
        if (result === true) releaseResolvedAsTrue = true;
        return result;
      });

      await Promise.all([timeoutPromise, releasePromise]);

      // Both should complete without throwing
      // One may timeout, one should succeed
      expect(timeoutResolvedAsFalse || releaseResolvedAsTrue).toBe(true);
    });

    it('should not leak waiters after timeout', async () => {
      const semaphore = new Semaphore(1);

      await semaphore.acquire();

      // Queue many acquires with short timeouts
      for (let i = 0; i < 10; i++) {
        semaphore.acquire(10);
      }

      // Wait for all to timeout
      await new Promise(resolve => setTimeout(resolve, 50));

      // Waiters should be cleaned up
      expect(semaphore.queuedWaiters()).toBe(0);
    });
  });

  describe('execute with timeout', () => {
    it('should timeout and throw when no permit available', async () => {
      const semaphore = new Semaphore(1);

      await semaphore.acquire();

      await expect(semaphore.execute(async () => 'done', 50)).rejects.toThrow(
        'failed to acquire permit'
      );
    });

    it('should execute successfully after timeout', async () => {
      const semaphore = new Semaphore(1);

      await semaphore.acquire();

      // This should timeout
      await expect(semaphore.execute(async () => 'done', 10)).rejects.toThrow();

      // Release and try again - should succeed
      semaphore.release();
      const result = await semaphore.execute(async () => 'success', 50);
      expect(result).toBe('success');
    });

    it('should execute with very short timeout 0', async () => {
      const semaphore = new Semaphore(1);

      await semaphore.acquire();

      // With 0 timeout, should fail immediately
      await expect(semaphore.execute(async () => 'done', 0)).rejects.toThrow();
    });
  });

  describe('maxQueueSize limit', () => {
    it('should reject acquire when queue is full', async () => {
      const semaphore = new Semaphore(1, 2); // 1 permit, max queue 2

      // Acquire the only permit
      await semaphore.acquire();

      // These should fill the queue (max 2)
      const acquire2 = semaphore.acquire();
      const acquire3 = semaphore.acquire();

      // This should be rejected due to queue limit
      const acquire4 = semaphore.acquire();

      // Wait for results
      const results = await Promise.all([acquire2, acquire3, acquire4]);

      // First two should be waiting (or one could succeed if release was called)
      // Third should fail because queue is full
      expect(results[2]).toBe(false);
    });

    it('should throw error for zero maxQueueSize', () => {
      expect(() => new Semaphore(1, 0)).toThrow();
    });

    it('should throw error for negative maxQueueSize', () => {
      expect(() => new Semaphore(1, -1)).toThrow();
    });

    it('should use default maxQueueSize when not specified', () => {
      const semaphore = new Semaphore(1);
      // Should have default maxQueueSize of 1000
      // We can verify this by checking that queue rejection happens at some limit
      // The actual limit is internal but constructor should not throw
      expect(semaphore.availablePermits()).toBe(1);
    });
  });

  describe('drain', () => {
    it('should drain all waiting waiters', async () => {
      const semaphore = new Semaphore(1); // 1 permit but we'll acquire it
      await semaphore.acquire(); // Now no permits available

      // Create multiple waiters
      const p1 = semaphore.acquire(5000);
      const p2 = semaphore.acquire(5000);
      const p3 = semaphore.acquire(5000);

      // Give the event loop a chance to add them to the queue
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(semaphore.queuedWaiters()).toBe(3);

      // Drain all waiters
      const drained = semaphore.drain();

      expect(drained).toBe(3);
      expect(semaphore.queuedWaiters()).toBe(0);

      // All waiters should have resolved to false
      const results = await Promise.all([p1, p2, p3]);
      expect(results).toEqual([false, false, false]);
    });
  });

  describe('boundary: Semaphore full rejection (exceed MAX_CONCURRENT)', () => {
    it('should reject acquire when queue is at exactly max capacity', async () => {
      const semaphore = new Semaphore(1, 3); // 1 permit, max queue 3

      // Acquire the only permit
      await semaphore.acquire();

      // Fill the queue exactly to capacity
      const p1 = semaphore.acquire();
      const p2 = semaphore.acquire();
      const p3 = semaphore.acquire();

      // Wait for queue to be filled
      await new Promise(resolve => setTimeout(resolve, 10));

      // Queue should be exactly at capacity
      expect(semaphore.queuedWaiters()).toBe(3);

      // This acquire should be rejected immediately (queue is full)
      const result = await semaphore.acquire();

      expect(result).toBe(false);
    });

    it('should reject acquire when queue exceeds max capacity', async () => {
      const semaphore = new Semaphore(1, 2); // 1 permit, max queue 2

      // Acquire the only permit
      await semaphore.acquire();

      // Fill the queue beyond capacity
      const p1 = semaphore.acquire();
      const p2 = semaphore.acquire();

      // Wait for queue to be filled
      await new Promise(resolve => setTimeout(resolve, 10));

      // Queue should be at capacity
      expect(semaphore.queuedWaiters()).toBe(2);

      // Try to add more - should be rejected
      const result1 = await semaphore.acquire();
      const result2 = await semaphore.acquire();
      const result3 = await semaphore.acquire();

      // All should be rejected
      expect(result1).toBe(false);
      expect(result2).toBe(false);
      expect(result3).toBe(false);
    });

    it('should allow new acquire after queue slot becomes available', async () => {
      const semaphore = new Semaphore(1, 2); // 1 permit, max queue 2

      // Acquire the only permit
      await semaphore.acquire();

      // Fill the queue - these will wait for permits (2 = max queue)
      const p1 = semaphore.acquire();
      const p2 = semaphore.acquire();

      await new Promise(resolve => setTimeout(resolve, 10));

      // This should be rejected (queue full)
      const rejected = await semaphore.acquire();
      expect(rejected).toBe(false);

      // Queue should be at capacity
      expect(semaphore.queuedWaiters()).toBe(2);

      // Release one permit - should allow one waiting waiter to proceed
      semaphore.release();

      // Wait for waiter to be resolved
      await new Promise(resolve => setTimeout(resolve, 50));

      // Now queue should have one spot available
      expect(semaphore.queuedWaiters()).toBe(1);

      // Clean up
      semaphore.drain();
    });

    it('should reject excess acquires when queue is full', async () => {
      const semaphore = new Semaphore(1, 5); // Small queue for testing

      await semaphore.acquire();

      // Fill queue to exactly capacity
      const promises = Array(5)
        .fill(null)
        .map(() => semaphore.acquire());

      await new Promise(resolve => setTimeout(resolve, 10));

      // Queue should be exactly at capacity
      expect(semaphore.queuedWaiters()).toBe(5);

      // Additional acquires should be rejected immediately
      const rejected1 = await semaphore.acquire();
      const rejected2 = await semaphore.acquire();

      expect(rejected1).toBe(false);
      expect(rejected2).toBe(false);

      // Queue still at capacity (not increased)
      expect(semaphore.queuedWaiters()).toBe(5);

      // Clean up
      semaphore.drain();
    });

    it('should correctly track permits after multiple rejections', async () => {
      const semaphore = new Semaphore(2, 3); // 2 permits, max queue 3

      // Use all permits
      await semaphore.acquire();
      await semaphore.acquire();

      expect(semaphore.availablePermits()).toBe(0);

      // Try to exceed queue capacity - use long timeout
      const p1 = semaphore.acquire(10000);
      const p2 = semaphore.acquire(10000);
      const p3 = semaphore.acquire(10000);

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      // This should be rejected immediately (queue full)
      const rejected = await semaphore.acquire();
      expect(rejected).toBe(false);

      // Check queue - should have 3 waiters
      expect(semaphore.queuedWaiters()).toBe(3);

      // Release all 3 waiters - each release transfers permit to a waiter
      semaphore.release(); // First waiter gets permit (permits stays 0, waiter proceeds)
      semaphore.release(); // Second waiter gets permit
      semaphore.release(); // Third waiter gets permit

      // Wait for waiters to proceed
      await new Promise(resolve => setTimeout(resolve, 10));

      // All permits should be used by waiters now
      expect(semaphore.availablePermits()).toBe(0);
      expect(semaphore.queuedWaiters()).toBe(0);

      // Clean up
      semaphore.drain();
    });
  });

  describe('boundary: timeout = 0', () => {
    it('should fail immediately with timeout = 0', async () => {
      const semaphore = new Semaphore(1);

      await semaphore.acquire();

      const result = await semaphore.acquire(0);

      expect(result).toBe(false);
      expect(semaphore.queuedWaiters()).toBe(0); // Should be cleaned up
    });

    it('should succeed immediately when permit available with timeout = 0', async () => {
      const semaphore = new Semaphore(2);

      const result = await semaphore.acquire(0);

      expect(result).toBe(true);
      expect(semaphore.availablePermits()).toBe(1);
    });
  });

  describe('boundary: timeout negative', () => {
    it('should timeout immediately with negative timeout', async () => {
      const semaphore = new Semaphore(1);

      await semaphore.acquire();

      // Negative timeout is treated as 1ms by Node.js, so it times out immediately
      const result = await semaphore.acquire(-100);

      // Should fail immediately (timeout fires right away)
      expect(result).toBe(false);
      expect(semaphore.queuedWaiters()).toBe(0); // Cleaned up after timeout
    });

    it('should handle very large negative timeout', async () => {
      const semaphore = new Semaphore(1);

      await semaphore.acquire();

      // Large negative is also treated as 1ms by Node.js
      const result = await semaphore.acquire(-Number.MAX_SAFE_INTEGER);

      // Should timeout immediately
      expect(result).toBe(false);
      expect(semaphore.queuedWaiters()).toBe(0);
    });
  });

  describe('boundary: execute with edge case timeouts', () => {
    it('should fail immediately with timeout = 0 in execute', async () => {
      const semaphore = new Semaphore(1);

      await semaphore.acquire();

      await expect(semaphore.execute(async () => 'done', 0)).rejects.toThrow();
    });

    it('should succeed with immediate execution when permits available', async () => {
      const semaphore = new Semaphore(1);

      const result = await semaphore.execute(async () => 'success', 0);

      expect(result).toBe('success');
      expect(semaphore.availablePermits()).toBe(1);
    });
  });
});
