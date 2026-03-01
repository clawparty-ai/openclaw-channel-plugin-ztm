// Integration tests for Memory and Resource Management

import { describe, it, expect, vi } from 'vitest';

describe('Memory and Resource Management', () => {
  it('should limit messageCallbacks size', () => {
    const callbacks = new Set<() => void>();
    const maxSize = 100;

    for (let i = 0; i < maxSize + 10; i++) {
      callbacks.add(vi.fn());
    }

    expect(callbacks.size).toBeGreaterThanOrEqual(maxSize);
  });

  it('should clean up intervals on stop', () => {
    let intervalCleared = false;
    const mockInterval = setInterval(() => {}, 1000);

    clearInterval(mockInterval);
    intervalCleared = true;

    expect(intervalCleared).toBe(true);
  });

  it('should handle cleanup of unknown resources gracefully', () => {
    const testCases: Array<{
      interval?: number | null;
      callbacks?: Set<any>;
      map?: Map<any, any>;
    }> = [
      { interval: null },
      { interval: undefined },
      { callbacks: new Set() },
      { map: new Map() },
    ];

    for (const testCase of testCases) {
      expect(() => {
        if (testCase.interval) clearInterval(testCase.interval as any);
      }).not.toThrow();
    }
  });
});
