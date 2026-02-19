// Concurrency utilities for ZTM Chat
// Provides Semaphore for limiting concurrent operations

/**
 * Waiter entry in the semaphore queue
 * Uses Promise internal state to prevent race conditions in timeout scenarios
 */
interface Waiter {
  promise: Promise<boolean>;
  resolve: (value: boolean) => void;
}

/**
 * Semaphore implementation for concurrency control
 * Limits the number of concurrent operations accessing a resource
 *
 * Thread-safety: This implementation is safe for single-threaded JavaScript
 * but uses proper synchronization to prevent race conditions in async scenarios.
 */
export class Semaphore {
  private permits: number;
  private waiters: Waiter[] = [];

  constructor(permits: number) {
    if (permits <= 0) {
      throw new Error('Semaphore permits must be greater than 0');
    }
    this.permits = permits;
  }

  /**
   * Acquire a permit, waiting if necessary until one is available or timeout expires
   * @param timeoutMs - Maximum time to wait in milliseconds (default: infinite)
   * @returns True if permit was acquired, false if timed out
   */
  async acquire(timeoutMs?: number): Promise<boolean> {
    // Fast path: permit available immediately
    if (this.permits > 0) {
      this.permits--;
      return true;
    }

    // If no timeout specified, wait indefinitely
    if (timeoutMs === undefined) {
      return new Promise<boolean>(resolve => {
        this.waiters.push({
          promise: Promise.resolve(true),
          resolve: value => resolve(value),
        });
      });
    }

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
        clearTimeout(timeoutId);
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
    }, timeoutMs);

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
   * @param timeoutMs - Optional timeout for acquiring permit (default: infinite)
   * @returns Result of fn, or throws if permit could not be acquired within timeout
   */
  async execute<T>(fn: () => Promise<T> | T, timeoutMs?: number): Promise<T> {
    const acquired = await this.acquire(timeoutMs);
    if (!acquired) {
      throw new Error(`Semaphore: failed to acquire permit within ${timeoutMs}ms`);
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
   * Get number of waiters queued for permits
   */
  queuedWaiters(): number {
    return this.waiters.length;
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
export function createSemaphore(permits: number): Semaphore {
  return new Semaphore(permits);
}
