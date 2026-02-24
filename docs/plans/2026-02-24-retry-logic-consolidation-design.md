# Retry Logic Consolidation Design

## Date: 2026-02-24

## Status: Approved

## Problem

There are two nearly identical functions determining if an error is retryable:

1. **gateway.ts** (`isRetryableError` at lines 334-363)
   - Checks `ZTMTimeoutError`, `ZTMApiError` (429, 5xx)
   - Pattern matching: timeout, network, ECONNREFUSED, ETIMEDOUT, ENOTFOUND

2. **retry.ts** (`isRetriableError` at lines 160-179)
   - Checks `isAuthError()` first (excludes auth errors)
   - Pattern matching: timeout, fetch, network, econnrefused, enotfound, etimedout, econnreset, aborterror

**Issues:**
- Code duplication with slight differences
- Inconsistent behavior between the two implementations
- Maintenance burden - changes must be made in two places

## Solution

Create a unified, configurable `RetryableErrorChecker` class in `src/utils/retry.ts`.

### Architecture

```
src/utils/retry.ts
├── RetryableErrorChecker class (new)
│   ├── constructor(config: RetryableErrorConfig)
│   ├── isRetryable(error: unknown): boolean
│   └── checkRetryableSubconditions(error: Error): boolean
├── RetryableErrorConfig interface (new)
├── defaultRetryChecker: RetryableErrorChecker (default instance)
└── isRetryableError(error: unknown): boolean (unified function)
```

### Configuration Interface

```typescript
interface RetryableErrorConfig {
  /** HTTP status codes that indicate retryable errors (e.g., 429, 500-599) */
  retryableStatusCodes: number[];

  /** Regex patterns to match retryable error messages */
  retryableErrorPatterns: RegExp[];

  /** Error types that should never be retried */
  nonRetryableErrorTypes: ErrorConstructor[];

  /** Error types that are always retryable */
  retryableErrorTypes: ErrorConstructor[];
}
```

### Default Configuration

```typescript
const DEFAULT_RETRY_CONFIG: RetryableErrorConfig = {
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

### Implementation Logic

The `isRetryable()` method performs checks in order:

1. **Check non-retryable types first** - If error is instance of any type in `nonRetryableErrorTypes`, return `false`
2. **Check retryable types** - If error is instance of any type in `retryableErrorTypes`, use `checkRetryableSubconditions()`
3. **Check status code** - For `ZTMApiError`, check if status code is in `retryableStatusCodes`
4. **Check error message patterns** - If error message matches any pattern in `retryableErrorPatterns`, return `true`
5. **Default** - Return `false`

## Migration

1. Add `RetryableErrorChecker` class and config to `retry.ts`
2. Export `isRetryableError` function using `defaultRetryChecker`
3. Update `gateway.ts` to import from `retry.ts` instead of local definition
4. Remove local `isRetryableError` function from `gateway.ts`
5. Remove old `isRetriableError` function from `retry.ts`

## Testing Strategy

### Unit Tests

| Test Case | Expected Result |
|-----------|-----------------|
| ZTMTimeoutError | true |
| ZTMApiError (statusCode: 429) | true |
| ZTMApiError (statusCode: 500) | true |
| ZTMApiError (statusCode: 400) | false |
| ZTMApiError (statusCode: undefined) | false |
| ZTMApiError (auth error) | false |
| Error with "timeout" in message | true |
| Error with "network" in message | true |
| Error with "ECONNREFUSED" in message | true |
| Error with "other" in message | false |
| null | false |
| undefined | false |
| Non-Error object | false |
| Empty error message | false |
| Error with special characters | false |

### Integration Tests

| Test Scenario | Verification |
|---------------|--------------|
| fetchWithRetry fails then succeeds | Retry mechanism works |
| Max retries exceeded | Gives up after max attempts |
| Retry interval increases | Exponential backoff works |

## Trade-offs

- **Pros**: Single source of truth, consistent behavior, configurable
- **Cons**: Migration requires updating call sites (no backward compatibility)

## Decision

Approved: Use configurable approach with union of both implementations' patterns.
