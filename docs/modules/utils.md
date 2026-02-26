# Utils Module

The Utils module provides utility functions used throughout the ZTM Chat plugin.

## Purpose

- Concurrency control (semaphores)
- Retry logic with exponential backoff
- Structured logging
- Input validation
- Result type handling
- Error handling

## Key Exports

| Export | Description |
|--------|-------------|
| `Semaphore` | Concurrency control semaphore |
| `retry` | Retry with exponential backoff |
| `logger` | Structured logging utility |
| `validate` | Input validation utilities |
| `Result` | Result type for error handling |
| `success` | Create success result |
| `failure` | Create failure result |
| `isSuccess` | Check if result is success |
| `resolvePath` | Resolve file paths |
| `ZTMError` | Base error class |
| `isNetworkError` | Check if error is network error |
| `syncTime` | Time synchronization utilities |
| `ConnectionStatus` | Connection status type |
| `MessageDirection` | Message direction type |
| `PairingStatus` | Pairing status type |

## Utility Categories

### Concurrency
- `Semaphore` - Rate limiting concurrent operations
- `withLock` - Acquire lock before operation

### Retry
- `retry` - Retry with exponential backoff
- `retryWithCondition` - Conditional retry

### Logging
- `logger` - Structured logger with levels
- Debug, info, warn, error logging

### Validation
- `validateString` - String validation
- `validateNumber` - Number validation
- `validateObject` - Object validation

### Result Type
- `Result<T, E>` - Either success or error
- `AsyncResult<T, E>` - Async result type
- `isSuccess` - Type guard for success

### Error Handling
- `ZTMError` - Base error class
- Custom error types
- Error code mapping

## Source Files

- `src/utils/concurrency.ts` - Semaphore implementation
- `src/utils/retry.ts` - Retry utilities
- `src/utils/logger.ts` - Logging
- `src/utils/validation.ts` - Validation
- `src/utils/result.ts` - Result type
- `src/utils/paths.ts` - Path resolution
- `src/utils/error.ts` - Error handling
- `src/utils/guards.ts` - Type guards
- `src/utils/sync-time.ts` - Time sync

## Usage Example

```typescript
import { retry, logger, success, failure } from './utils/index.js';

// Retry with backoff
const result = await retry(3, async () => {
  return await api.call();
});

// Result type
const result = someOperation();
if (isSuccess(result)) {
  console.log(result.value);
} else {
  console.error(result.error);
}

// Logging
logger.info('Message processed', { messageId: '123' });
```

## Related Documentation

- [ADR-004 - Result Error Handling](../adr/ADR-004-result-error-handling.md)
- [ADR-007 - Dual Semaphore Concurrency](../adr/ADR-007-dual-semaphore-concurrency.md)
- [API Types - Common](../api/types.md#common-types)
