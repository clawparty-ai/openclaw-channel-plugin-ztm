// Concurrency utilities for ZTM Chat
// Provides Semaphore for limiting concurrent operations

/**
 * Semaphore implementation for concurrency control
 * Limits the number of concurrent operations accessing a resource
 */
export class Semaphore {
  private permits: number;
  private waiters: Array<{ resolve: () => void }> = [];

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
    if (this.permits > 0) {
      this.permits--;
      return true;
    }

    // If no timeout specified, wait indefinitely
    if (timeoutMs === undefined) {
      return new Promise((resolve) => {
        this.waiters.push({ resolve: () => resolve(true) });
      });
    }

    // With timeout, race between permit availability and timeout
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        // Check if this waiter is still in the queue
        const index = this.waiters.findIndex(w => w.resolve === timedResolve);
        if (index !== -1) {
          this.waiters.splice(index, 1);
        }
        resolve(false);
      }, timeoutMs);

      const timedResolve = () => {
        clearTimeout(timeoutId);
        resolve(true);
      };

      this.waiters.push({ resolve: timedResolve });
    });
  }

  /**
   * Release a permit, making it available to waiting acquire calls
   */
  release(): void {
    if (this.waiters.length === 0) {
      this.permits++;
      return;
    }
    // If there are waiters, transfer the permit directly
    const waiter = this.waiters.shift();
    waiter?.resolve();
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
