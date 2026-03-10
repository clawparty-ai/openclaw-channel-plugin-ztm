/**
 * Concurrency utilities for ZTM Chat
 * @module utils/concurrency
 *
 * Provides Semaphore for limiting concurrent operations.
 * Used to control access to shared resources and prevent unbounded queue growth.
 *
 * Features:
 * - Configurable max queue size to prevent memory exhaustion
 * - Timeout support for acquire operations
 * - Automatic cleanup of stale waiters
 * - Thread-safe implementation for async scenarios
 */

// Concurrency utilities for ZTM Chat

/**
 * Waiter entry in the semaphore queue
 * Uses Promise internal state to prevent race conditions in timeout scenarios
 */
interface Waiter {
  promise: Promise<boolean>;
  resolve: (value: boolean) => void;
  timeoutId?: ReturnType<typeof setTimeout>; // Track timeout for cleanup
}

/**
 * Semaphore implementation for concurrency control
 * Limits the number of concurrent operations accessing a resource
 *
 * Features:
 * - Configurable max queue size to prevent unbounded growth
 * - Timeout support for acquire operations
 * - Automatic cleanup of stale waiters
 *
 * Thread-safety: This implementation is safe for single-threaded JavaScript
 * but uses proper synchronization to prevent race conditions in async scenarios.
 */
export class Semaphore {
  private permits: number;
  private waiters: Waiter[] = [];
  private readonly maxQueueSize: number;

  /**
   * Create a semaphore with the specified number of permits
   * @param permits - Number of concurrent permits (must be > 0)
   * @param maxQueueSize - Maximum number of waiters in queue (default: 1000)
   */
  constructor(permits: number, maxQueueSize: number = 1000) {
    if (permits <= 0) {
      throw new Error('Semaphore permits must be greater than 0');
    }
    if (maxQueueSize <= 0) {
      throw new Error('Semaphore maxQueueSize must be greater than 0');
    }
    this.permits = permits;
    this.maxQueueSize = maxQueueSize;
  }

  /**
   * Acquire a permit, waiting if necessary until one is available or timeout expires
   * @param timeoutMs - Maximum time to wait in milliseconds (default: infinite, but limited by queue size)
   * @returns True if permit was acquired, false if timed out or queue is full
   */
  async acquire(timeoutMs?: number): Promise<boolean> {
    // Fast path: permit available immediately
    if (this.permits > 0) {
      this.permits--;
      return true;
    }

    // Check queue capacity before adding waiter
    if (this.waiters.length >= this.maxQueueSize) {
      // Queue is full - reject new waiters to prevent unbounded growth
      return false;
    }

    // If no timeout specified, use default timeout to prevent indefinite waiting
    // This prevents stale waiters from accumulating in the queue
    const effectiveTimeoutMs = timeoutMs ?? this.maxQueueSize * 1000; // Default: 1000ms per waiter

    // With timeout: use Promise settled state to prevent race condition
    // The key fix: we resolve with a unique symbol to detect race condition
    let settleResolve: (value: boolean) => void;
    const promise = new Promise<boolean>(resolve => {
      settleResolve = resolve;
    });

    const waiter: Waiter = {
      promise,
      resolve: (value: boolean) => {
        // Clear timeout first to prevent timeout callback from also resolving
        if (waiter.timeoutId) {
          clearTimeout(waiter.timeoutId);
        }
        settleResolve(value);
      },
    };

    // Set up timeout handler - checks queue membership to detect race with release()
    const timeoutId = setTimeout(() => {
      // Only resolve if waiter is still in the queue (not handled by release())
      const index = this.waiters.indexOf(waiter);
      if (index !== -1) {
        this.waiters.splice(index, 1);
        waiter.resolve(false);
      }
      // If not in queue, release() already handled it - do nothing
    }, effectiveTimeoutMs);

    waiter.timeoutId = timeoutId;

    // Add to queue after timeout is set up
    this.waiters.push(waiter);

    return promise;
  }

  /**
   * Release a permit, making it available to waiting acquire calls
   *
   * Thread-safety: Removes from queue atomically before resolving
   * The timeout callback checks queue membership, so this prevents race condition
   */
  release(): void {
    // Remove first waiter from queue FIRST (atomic with respect to timeout check)
    const waiter = this.waiters.shift();

    if (waiter) {
      // Now safe to resolve - timeout will see waiter is not in queue
      waiter.resolve(true);
    } else {
      // No waiters, increment permits
      this.permits++;
    }
  }

  /**
   * Execute a function with a permit held, automatically releasing after completion
   * @param fn - Function to execute
   * @param timeoutMs - Optional timeout for acquiring permit
   * @returns Result of fn, or throws if permit could not be acquired within timeout
   */
  async execute<T>(fn: () => Promise<T> | T, timeoutMs?: number): Promise<T> {
    const acquired = await this.acquire(timeoutMs);
    if (!acquired) {
      throw new Error(`Semaphore: failed to acquire permit within ${timeoutMs ?? 'default'}ms`);
    }
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /**
   * Get current number of available permits
   */
  availablePermits(): number {
    return this.permits;
  }

  /**
   * Try to acquire a permit without blocking
   * @returns true if permit was acquired immediately, false otherwise
   */
  tryAcquire(): boolean {
    if (this.permits > 0) {
      this.permits--;
      return true;
    }
    return false;
  }

  /**
   * Get number of waiters queued for permits
   */
  queuedWaiters(): number {
    return this.waiters.length;
  }

  /**
   * Drain all waiters from the queue (useful for shutdown)
   * @returns Number of waiters that were drained
   */
  drain(): number {
    const count = this.waiters.length;
    for (const waiter of this.waiters) {
      if (waiter.timeoutId) {
        clearTimeout(waiter.timeoutId);
      }
      waiter.resolve(false);
    }
    this.waiters = [];
    return count;
  }
}

/**
 * Create a semaphore with the specified number of permits
 *
 * Factory function for creating a new Semaphore instance.
 * The semaphore limits the number of concurrent operations that can access
 * a shared resource.
 *
 * @param permits - Number of concurrent permits available (must be > 0)
 * @param maxQueueSize - Maximum queue size (default: 1000)
 * @returns A new Semaphore instance
 * @throws Error if permits is <= 0
 *
 * @example
 * // Create a semaphore that allows 3 concurrent operations
 * const semaphore = createSemaphore(3);
 *
 * // Use in async operations
 * await semaphore.acquire();
 * try {
 *   // Do work
 * } finally {
 *   semaphore.release();
 * }
 */
export function createSemaphore(permits: number, maxQueueSize?: number): Semaphore {
  return new Semaphore(permits, maxQueueSize);
}
