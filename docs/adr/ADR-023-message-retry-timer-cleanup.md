# ADR-023: Message Retry Timer Cleanup

## Status

Accepted

## Date

2026-02-26

## Context

When message sending fails and needs retry, the system uses `setTimeout` to schedule retry attempts. Without proper cleanup:

- Timers accumulate during retries
- Memory leaks occur over time
- Stale timers may fire after shutdown, causing unexpected behavior
- Resource exhaustion in long-running deployments

### Current Implementation Evidence

- Timer tracking map added to `src/messaging/outbound.ts`
- `retryTimers` Map tracks pending retries by message ID
- Cleanup on shutdown via `clearAllRetries()`

## Decision

Track all retry timers and ensure proper cleanup:

```typescript
// outbound.ts - Timer tracking
interface RetryTimer {
  messageId: string;
  timerId: ReturnType<typeof setTimeout>;
  attemptNumber: number;
  scheduledAt: number;
}

// Track all active retry timers
const retryTimers = new Map<string, RetryTimer>();

/**
 * Schedule a message retry with exponential backoff.
 *
 * @param messageId - Unique message identifier
 * @param attemptNumber - Current retry attempt (1-based)
 * @param content - Message content to send
 * @param targetPeerId - Target peer
 */
function scheduleRetry(
  messageId: string,
  attemptNumber: number,
  content: string,
  targetPeerId: string
): void {
  // Clear any existing timer for this message
  cancelRetry(messageId);

  // Calculate delay with exponential backoff
  const baseDelay = 1000; // 1 second
  const maxDelay = 30000; // 30 seconds
  const delay = Math.min(baseDelay * Math.pow(2, attemptNumber - 1), maxDelay);

  const timerId = setTimeout(async () => {
    try {
      await sendMessage(content, targetPeerId);
    } catch (error) {
      if (attemptNumber < MAX_RETRY_ATTEMPTS) {
        scheduleRetry(messageId, attemptNumber + 1, content, targetPeerId);
      } else {
        // Max retries reached, notify failure
        notifyFailure(messageId, error);
      }
    } finally {
      retryTimers.delete(messageId);
    }
  }, delay);

  retryTimers.set(messageId, {
    messageId,
    timerId,
    attemptNumber,
    scheduledAt: Date.now(),
  });
}

/**
 * Cancel a pending retry.
 *
 * @param messageId - Message to cancel retry for
 */
function cancelRetry(messageId: string): void {
  const timer = retryTimers.get(messageId);
  if (timer) {
    clearTimeout(timer.timerId);
    retryTimers.delete(messageId);
  }
}

/**
 * Clear all pending retries (used on shutdown).
 */
function clearAllRetries(): void {
  for (const timer of retryTimers.values()) {
    clearTimeout(timer.timerId);
  }
  retryTimers.clear();
}
```

### Shutdown Integration

```typescript
// gateway.ts - Cleanup on shutdown
class Gateway {
  async shutdown(): Promise<void> {
    // Clear all pending message retries
    clearAllRetries();

    // Stop the message watcher
    await this.watcher?.stop();

    // Close connections
    await this.apiClient?.disconnect();
  }
}
```

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| **No tracking** | Simpler code | Memory leaks, resource exhaustion | Unacceptable |
| **WeakMap** | Auto-cleanup | Unpredictable timing | Not reliable |
| **Timer tracking (chosen)** | Full control, explicit | Slight complexity | Best reliability |

## Key Trade-offs

- **Memory vs reliability**: Slight memory overhead for guaranteed cleanup
- **Complexity vs safety**: More code but prevents resource leaks
- **Graceful vs force**: Allow in-flight retries to complete or cancel

## Related Decisions

- **ADR-019**: Error Handling Strategy - Retry logic
- **ADR-017**: Message Processing Pipeline

## Consequences

### Positive

- **No memory leaks**: Timers are properly cleaned up
- **Controlled shutdown**: All resources released on exit
- **Debugging support**: Timer metadata available for diagnostics
- **Resource management**: Prevents exhaustion in long-running processes

### Negative

- **Code complexity**: Additional tracking logic required
- **Timer overhead**: Each retry uses a timer resource
- **Cleanup responsibility**: Must call cleanup functions

## References

- `src/messaging/outbound.ts` - Retry timer implementation
- `src/channel/gateway.ts` - Shutdown handler
