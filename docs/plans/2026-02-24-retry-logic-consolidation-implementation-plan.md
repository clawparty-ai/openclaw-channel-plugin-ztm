# Retry Logic Consolidation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate duplicate retry logic from `gateway.ts` and `retry.ts` into a unified, configurable `RetryableErrorChecker` class.

**Architecture:** Create a configurable class-based approach with a default instance. Replace both existing functions with a single unified function that uses union of both implementations' patterns.

**Tech Stack:** TypeScript, Vitest

---

## Task 1: Add RetryableErrorChecker Class to retry.ts

**Files:**
- Modify: `src/utils/retry.ts:1-250`
- Test: `src/utils/retry.test.ts`

**Step 1: Add interface and imports**

After line 33 (after the constants import), add:

```typescript
// Error types for retry classification
import { ZTMTimeoutError, ZTMApiError } from '../types/errors.js';

/**
 * Configuration for RetryableErrorChecker
 */
export interface RetryableErrorConfig {
  /** HTTP status codes that indicate retryable errors (e.g., 429, 500-599) */
  retryableStatusCodes: number[];

  /** Regex patterns to match retryable error messages */
  retryableErrorPatterns: RegExp[];

  /** Error types that should never be retried */
  nonRetryableErrorTypes: Array<new (...args: unknown[]) => Error>;

  /** Error types that are always retryable */
  retryableErrorTypes: Array<new (...args: unknown[]) => Error>;
}

/**
 * Default retryable error configuration
 */
export const DEFAULT_RETRYABLE_ERROR_CONFIG: RetryableErrorConfig = {
  retryableStatusCodes: [429, 500, 502, 503, 504],
  retryableErrorPatterns: [
    /timeout/i,
    /network/i,
    /econnrefused/i,
    /etimedout/i,
    /enotfound/i,
    /econnreset/i,
    /aborterror/i,
    /fetch/i
  ],
  nonRetryableErrorTypes: [],
  retryableErrorTypes: [ZTMTimeoutError, ZTMApiError]
};
```

**Step 2: Add RetryableErrorChecker class**

After the config (around line 55), add:

```typescript
/**
 * Class to determine if an error is retryable
 */
export class RetryableErrorChecker {
  constructor(private config: RetryableErrorConfig) {}

  /**
   * Check if an error is retryable
   * @param error - The error to check
   * @returns true if the error should be retried
   */
  isRetryable(error: unknown): boolean {
    // Handle non-Error objects
    if (!(error instanceof Error)) {
      return false;
    }

    // Check non-retryable types first
    for (const Type of this.config.nonRetryableErrorTypes) {
      if (error instanceof Type) {
        return false;
      }
    }

    // Check explicitly retryable types
    for (const Type of this.config.retryableErrorTypes) {
      if (error instanceof Type) {
        return this.checkRetryableSubconditions(error);
      }
    }

    // Check error message patterns
    const message = error.message.toLowerCase();
    for (const pattern of this.config.retryableErrorPatterns) {
      if (pattern.test(message)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check subconditions for retryable error types (e.g., status codes)
   */
  private checkRetryableSubconditions(error: Error): boolean {
    // For ZTMApiError, check status code
    if (error instanceof ZTMApiError) {
      const statusCode = error.context.statusCode as number | undefined;
      if (statusCode !== undefined) {
        return this.config.retryableStatusCodes.includes(statusCode);
      }
      // If no status code, be conservative and allow retry
      return true;
    }

    // For ZTMTimeoutError, always retry
    if (error instanceof ZTMTimeoutError) {
      return true;
    }

    return true;
  }
}

/**
 * Default retryable error checker instance
 */
export const defaultRetryChecker = new RetryableErrorChecker(DEFAULT_RETRYABLE_ERROR_CONFIG);

/**
 * Unified function to check if an error is retryable
 * @param error - The error to check
 * @returns true if the error should be retried
 */
export function isRetryableError(error: unknown): boolean {
  return defaultRetryChecker.isRetryable(error);
}
```

**Step 3: Run typecheck to verify**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/utils/retry.ts
git commit -m "feat: add RetryableErrorChecker class and unified isRetryableError function"
```

---

## Task 2: Add Comprehensive Unit Tests for isRetryableError

**Files:**
- Modify: `src/utils/retry.test.ts`

**Step 1: Add test cases for all error types**

Replace the existing `isRetriableError` test section with comprehensive tests:

```typescript
describe('isRetryableError', () => {
  // ZTM-specific error types
  describe('ZTMTimeoutError', () => {
    it('should return true for ZTMTimeoutError', () => {
      const error = new ZTMTimeoutError('Request timeout');
      expect(isRetryableError(error)).toBe(true);
    });
  });

  describe('ZTMApiError', () => {
    it('should return true for 429 (rate limit)', () => {
      const error = new ZTMApiError('Rate limited', { statusCode: 429 });
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for 500 (server error)', () => {
      const error = new ZTMApiError('Internal server error', { statusCode: 500 });
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for 502 (bad gateway)', () => {
      const error = new ZTMApiError('Bad gateway', { statusCode: 502 });
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for 503 (service unavailable)', () => {
      const error = new ZTMApiError('Service unavailable', { statusCode: 503 });
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for 504 (gateway timeout)', () => {
      const error = new ZTMApiError('Gateway timeout', { statusCode: 504 });
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return false for 400 (bad request)', () => {
      const error = new ZTMApiError('Bad request', { statusCode: 400 });
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return false for 401 (unauthorized)', () => {
      const error = new ZTMApiError('Unauthorized', { statusCode: 401 });
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return false for 403 (forbidden)', () => {
      const error = new ZTMApiError('Forbidden', { statusCode: 403 });
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return true for undefined statusCode (assume retryable)', () => {
      const error = new ZTMApiError('API error', {});
      expect(isRetryableError(error)).toBe(true);
    });
  });

  // Standard Error patterns
  describe('Error message patterns', () => {
    it('should return true for timeout in message', () => {
      const error = new Error('Request timeout');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for NETWORK error in message', () => {
      const error = new Error('NETWORK error');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for ECONNREFUSED', () => {
      const error = new Error('ECONNREFUSED');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for ETIMEDOUT', () => {
      const error = new Error('ETIMEDOUT');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for ENOTFOUND', () => {
      const error = new Error('ENOTFOUND');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for econnreset', () => {
      const error = new Error('econnreset');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for AbortError', () => {
      const error = new Error('AbortError');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for fetch failed', () => {
      const error = new Error('fetch failed');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return false for unrelated error', () => {
      const error = new Error('Some unrelated error');
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return false for validation error', () => {
      const error = new Error('Validation failed');
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return false for unauthorized', () => {
      const error = new Error('Unauthorized');
      expect(isRetryableError(error)).toBe(false);
    });
  });

  // Boundary cases
  describe('boundary cases', () => {
    it('should return false for null', () => {
      expect(isRetryableError(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isRetryableError(undefined)).toBe(false);
    });

    it('should return false for non-Error object', () => {
      expect(isRetryableError({ message: 'test' })).toBe(false);
    });

    it('should return false for string', () => {
      expect(isRetryableError('error string')).toBe(false);
    });

    it('should return false for number', () => {
      expect(isRetryableError(404)).toBe(false);
    });

    it('should handle empty error message', () => {
      const error = new Error('');
      expect(isRetryableError(error)).toBe(false);
    });

    it('should handle error with special characters', () => {
      const error = new Error('Error: [ECONNREFUSED] @ localhost:8080');
      expect(isRetryableError(error)).toBe(true);
    });
  });
});
```

**Step 2: Run tests**

Run: `npm test -- src/utils/retry.test.ts`
Expected: PASS with all new tests

**Step 3: Commit**

```bash
git add src/utils/retry.test.ts
git commit -m "test: add comprehensive unit tests for isRetryableError"
```

---

## Task 3: Update gateway.ts to Use Unified Function

**Files:**
- Modify: `src/channel/gateway.ts:334-363`
- No test changes needed (existing tests cover the behavior)

**Step 1: Remove local isRetryableError function**

Delete the local `isRetryableError` function (lines 334-363) from gateway.ts.

**Step 2: Add import for unified function**

Add to the imports at the top of gateway.ts:

```typescript
import { isRetryableError } from '../utils/retry.js';
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Run tests**

Run: `npm test -- src/channel/gateway.test.ts` (if exists) or full test suite
Expected: PASS

**Step 5: Commit**

```bash
git add src/channel/gateway.ts
git commit -m "refactor: use unified isRetryableError from retry.ts"
```

---

## Task 4: Remove Old isRetriableError Function from retry.ts

**Files:**
- Modify: `src/utils/retry.ts:160-179`

**Step 1: Remove old function**

Delete the old `isRetriableError` function (lines 160-179).

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Run tests**

Run: `npm test -- src/utils/retry.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/utils/retry.ts
git commit -m "refactor: remove duplicate isRetriableError function"
```

---

## Task 5: Verify Full Test Suite

**Step 1: Run full test suite**

Run: `npm test`
Expected: All 2482 tests pass

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Run lint**

Run: `npm run lint`
Expected: PASS (warnings OK)

**Step 4: Commit**

```bash
git add .
git commit -m "refactor: complete retry logic consolidation"
```

---

## Summary

| Task | Description | Files Modified |
|------|-------------|----------------|
| 1 | Add RetryableErrorChecker class | retry.ts |
| 2 | Add comprehensive unit tests | retry.test.ts |
| 3 | Update gateway.ts to use unified function | gateway.ts |
| 4 | Remove old isRetriableError | retry.ts |
| 5 | Verify full test suite | - |
