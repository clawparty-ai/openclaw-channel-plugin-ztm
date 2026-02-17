// Concurrency utilities for ZTM Chat
// Provides Semaphore for limiting concurrent operations

/**
 * Waiter entry in the semaphore queue
 * Uses a resolved flag to prevent race conditions in timeout scenarios
 */
interface Waiter {
  resolve: (value: boolean) => void;
  resolved: boolean; // Flag to prevent double-resolution
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
      throw new Error("Semaphore permits must be greater than 0");
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
      return new Promise<boolean>((resolve) => {
        this.waiters.push({
          resolve: (value) => resolve(value),
          resolved: false,
        });
      });
    }

    // With timeout, race between permit availability and timeout
    return new Promise<boolean>((resolve) => {
      const waiter: Waiter = {
        resolve: (value: boolean) => {
          // Mark as resolved before calling the actual resolve
          // This prevents double-resolution in race conditions
          waiter.resolved = true;
          clearTimeout(timeoutId);
          resolve(value);
        },
        resolved: false,
      };

      // Set up timeout handler
      const timeoutId = setTimeout(() => {
        // Check if this waiter is still in the queue and not yet resolved
        const index = this.waiters.indexOf(waiter);
        if (index !== -1 && !waiter.resolved) {
          // Remove from queue before resolving to prevent re-resolution
          this.waiters.splice(index, 1);
          // Now safe to resolve(false) - removed from queue so release() won't find it
          waiter.resolve(false);
        }
        // If already removed and resolved by release(), do nothing
      }, timeoutMs);

      // Add to queue after timeout is set up
      this.waiters.push(waiter);
    });
  }

  /**
   * Release a permit, making it available to waiting acquire calls
   *
   * Thread-safety: Uses resolved flag to prevent race conditions with timeout
   */
  release(): void {
    // Find the first unresolved waiter
    const waiter = this.waiters.find(w => !w.resolved);

    if (waiter) {
      // Mark as resolved BEFORE removing from queue to prevent race with timeout
      // This ensures timeout callback will see resolved=true and not double-resolve
      waiter.resolved = true;

      // Remove from queue before resolving
      const index = this.waiters.indexOf(waiter);
      if (index !== -1) {
        this.waiters.splice(index, 1);
      }

      // Now safe to resolve
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
 */
export function createSemaphore(permits: number): Semaphore {
  return new Semaphore(permits);
}
