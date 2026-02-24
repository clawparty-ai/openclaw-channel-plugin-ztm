# Message Processing Code Deduplication Design

## Overview

Refactor duplicate message processing logic in the messaging pipeline using the Strategy Pattern to eliminate DRY violations across `chat-processor.ts` and `message-processor-helpers.ts`.

## Problem Statement

### Current Duplication

Three functions implement similar message normalization + notification patterns:

| Location | Function | Lines |
|----------|----------|-------|
| `src/messaging/chat-processor.ts` | `processAndNotifyChat` | 75-139 |
| `src/messaging/message-processor-helpers.ts` | `processAndNotifyPeerMessages` | 269-280 |
| `src/messaging/message-processor-helpers.ts` | `processAndNotifyGroupMessages` | 292-305 |

### Duplicate Pattern

```typescript
// In all three locations:
const normalized = isGroup
  ? processIncomingMessage(..., { groupInfo })
  : processIncomingMessage(..., {});

if (normalized) {
  await notifyMessageCallbacks(state, enrichedMessage);
}
```

### Impact

- **Maintenance burden**: Bug fixes require changes in multiple places
- **Risk of inconsistency**: Different behaviors may emerge over time
- **Testing complexity**: Same logic tested in multiple test files

## Design

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    processAndNotify (Unified)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐    ┌─────────────────────────────────┐   │
│  │ getMessageStrategy│───▶│    MessageProcessingStrategy   │   │
│  │   (Factory)      │    │         (Interface)            │   │
│  └──────────────────┘    └─────────────────────────────────┘   │
│                                    ▲                            │
│                    ┌───────────────┴───────────────┐           │
│                    │                               │           │
│          ┌─────────▼─────────┐       ┌────────────▼────────┐   │
│          │ PeerMessageStrategy│       │GroupMessageStrategy│   │
│          └───────────────────┘       └────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### New File Structure

```
src/messaging/
├── strategies/
│   ├── mod.ts                 # Barrel export
│   ├── message-strategies.ts  # Strategy interface + implementations
│   └── message-strategies.test.ts  # Unit tests
```

### Key Components

#### 1. Strategy Interface

```typescript
export interface MessageProcessingStrategy {
  /**
   * Normalize raw message through validation and policy pipeline
   */
  normalize(
    msg: RawMessage,
    ctx: ProcessingContext
  ): ZTMChatMessage | null;

  /**
   * Extract group metadata from chat, or null for peer messages
   */
  getGroupInfo(chat: ZTMChat): GroupInfo | null;
}
```

#### 2. Processing Context

```typescript
export interface ProcessingContext {
  state: AccountRuntimeState;
  storeAllowFrom: string[];
  groupInfo?: GroupInfo;
  groupName?: string;
}
```

#### 3. Strategy Implementations

**PeerMessageStrategy**
- Uses `processPeerMessage()` for normalization
- Returns `null` from `getGroupInfo()`
- Triggers DM policy check after notification

**GroupMessageStrategy**
- Uses `processGroupMessage()` for normalization
- Returns group metadata from `getGroupInfo()`
- No policy check needed

#### 4. Unified Processing Function

```typescript
/**
 * Unified message processing and notification.
 * Replaces: processAndNotifyChat, processAndNotifyPeerMessages, processAndNotifyGroupMessages
 */
export async function processAndNotify(
  chat: ZTMChat,
  state: AccountRuntimeState,
  storeAllowFrom: string[]
): Promise<boolean> {
  // 1. Validate chat
  const validation = validateChatMessage(chat, state.config);
  if (!validation.valid) return false;

  // 2. Get appropriate strategy
  const strategy = getMessageStrategy(chat);

  // 3. Prepare raw message
  const rawMsg: RawMessage = {
    time: chat.latest!.time,
    message: chat.latest!.message,
    sender: extractSender(chat)
  };

  // 4. Build context
  const ctx: ProcessingContext = {
    state,
    storeAllowFrom,
    groupInfo: strategy.getGroupInfo(chat) ?? undefined,
    groupName: chat.name
  };

  // 5. Normalize
  const normalized = strategy.normalize(rawMsg, ctx);
  if (!normalized) return false;

  // 6. Notify callbacks
  await notifyMessageCallbacks(state, normalized);

  // 7. Handle peer policy (only for peer messages)
  if (!strategy.getGroupInfo(chat)) {
    await handlePeerPolicyCheck(chat.peer!, state, storeAllowFrom, 'New message');
  }

  return true;
}
```

#### 5. Factory Function

```typescript
export function getMessageStrategy(chat: ZTMChat): MessageProcessingStrategy {
  return isGroupChat(chat)
    ? new GroupMessageStrategy()
    : new PeerMessageStrategy();
}
```

### Backward Compatibility

The old functions will be removed entirely:
- `processAndNotifyChat` → replaced by `processAndNotify`
- `processAndNotifyPeerMessages` → integrated into new architecture
- `processAndNotifyGroupMessages` → integrated into new architecture

All 8 call sites (including tests) must be updated.

### Error Handling

- Validation failures return `false` (no error thrown)
- Normalization failures return `false` (message filtered by policy)
- Callback notification errors propagate (caller handles)
- Policy check errors propagate

## Testing Strategy

### Unit Tests

**Test File**: `src/messaging/strategies/message-strategies.test.ts`

| Test Suite | Coverage |
|------------|----------|
| `PeerMessageStrategy` | normalize() for valid/invalid/sender-filtered messages |
| `GroupMessageStrategy` | normalize() with groupInfo, self-message filtering |
| `getMessageStrategy` | Returns correct strategy based on chat type |
| `processAndNotify` | Full flow, validation, error propagation |

### Integration Tests

Existing test files update to use new API:
- `src/messaging/watcher.test.ts`
- `src/messaging/message-processor-helpers.test.ts`
- `src/messaging/chat-processor.test.ts`

### Test Data

```typescript
// Test fixtures needed
const peerChat: ZTMChat = { peer: 'alice', latest: { time: 123, message: 'hi', sender: 'alice' } };
const groupChat: ZTMChat = { creator: 'admin', group: 'group1', name: 'TestGroup', latest: { time: 123, message: 'hello', sender: 'bob' } };
```

## Implementation Order

1. **Create strategy file** - `src/messaging/strategies/message-strategies.ts`
2. **Write unit tests** - Strategy interface and implementations
3. **Implement unified function** - `processAndNotify`
4. **Update call sites** - Replace old function calls
5. **Update integration tests** - Fix test assertions
6. **Run full test suite** - Verify no regressions

## Files to Modify

| File | Action |
|------|--------|
| `src/messaging/strategies/mod.ts` | Create |
| `src/messaging/strategies/message-strategies.ts` | Create |
| `src/messaging/strategies/message-strategies.test.ts` | Create |
| `src/messaging/chat-processor.ts` | Remove `processAndNotifyChat`, add re-export |
| `src/messaging/message-processor-helpers.ts` | Remove duplicate functions |
| `src/messaging/watcher.ts` | Update call sites |
| `src/messaging/watcher.test.ts` | Update tests |
| `src/messaging/message-processor-helpers.test.ts` | Update tests |
| `src/messaging/chat-processor.test.ts` | Update tests |

## Success Criteria

1. ✅ Zero code duplication in message processing pipeline
2. ✅ All existing functionality preserved
3. ✅ All tests pass after refactoring
4. ✅ Strategy pattern enables easy extension for new message types
5. ✅ Code review confirms clean architecture
