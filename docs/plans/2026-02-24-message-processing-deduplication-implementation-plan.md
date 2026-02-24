# Message Processing Deduplication Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor duplicate message processing logic using Strategy Pattern to eliminate DRY violations in the messaging pipeline.

**Architecture:** Create a unified `processAndNotify` function that uses strategy pattern to handle both peer and group messages. The strategy interface defines `normalize()` and `getGroupInfo()` methods, with concrete implementations for each message type.

**Tech Stack:** TypeScript, Vitest (testing), Strategy Pattern

---

## Pre-requisites

Before starting, verify the existing test suite passes:

```bash
cd /Users/linyang/workspace/flomesh-projects/openclaw-channel-plugin-ztm
npm test -- --run
```

---

## Task 1: Create Strategy Module Files

**Files:**
- Create: `src/messaging/strategies/mod.ts`
- Create: `src/messaging/strategies/message-strategies.ts`
- Create: `src/messaging/strategies/message-strategies.test.ts`

### Step 1: Create strategies directory

Run:
```bash
mkdir -p src/messaging/strategies
```

### Step 2: Create mod.ts barrel export

Create file: `src/messaging/strategies/mod.ts`

```typescript
export * from './message-strategies.js';
```

### Step 3: Commit

```bash
git add src/messaging/strategies/
git commit -m "feat: create strategies directory structure"
```

---

## Task 2: Write Unit Tests for Strategy Interface (TDD)

**Files:**
- Test: `src/messaging/strategies/message-strategies.test.ts`

### Step 1: Write failing tests

Create `src/messaging/strategies/message-strategies.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getMessageStrategy,
  processAndNotify,
} from './message-strategies.js';
import { isGroupChat, extractSender, validateChatMessage } from '../message-processor-helpers.js';
import { processPeerMessage, processGroupMessage, handlePeerPolicyCheck } from '../message-processor-helpers.js';
import { notifyMessageCallbacks } from '../dispatcher.js';
import type { ZTMChat } from '../../types/api.js';
import type { AccountRuntimeState } from '../../runtime/state.js';

// Mock dependencies
vi.mock('../message-processor-helpers.js', () => ({
  isGroupChat: vi.fn(),
  extractSender: vi.fn((chat: ZTMChat) => chat.latest?.sender || chat.peer || ''),
  validateChatMessage: vi.fn(),
  processPeerMessage: vi.fn(),
  processGroupMessage: vi.fn(),
  handlePeerPolicyCheck: vi.fn(),
}));

vi.mock('../dispatcher.js', () => ({
  notifyMessageCallbacks: vi.fn(),
}));

describe('getMessageStrategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return PeerMessageStrategy for peer chat', () => {
    const peerChat: ZTMChat = { peer: 'alice', latest: { time: 123, message: 'hi', sender: 'alice' } };
    (isGroupChat as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const strategy = getMessageStrategy(peerChat);

    expect(isGroupChat).toHaveBeenCalledWith(peerChat);
    // Strategy should have normalize and getGroupInfo methods
    expect(typeof strategy.normalize).toBe('function');
    expect(typeof strategy.getGroupInfo).toBe('function');
    expect(strategy.getGroupInfo(peerChat)).toBeNull();
  });

  it('should return GroupMessageStrategy for group chat', () => {
    const groupChat: ZTMChat = {
      creator: 'admin',
      group: 'group1',
      name: 'TestGroup',
      latest: { time: 123, message: 'hello', sender: 'bob' }
    };
    (isGroupChat as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const strategy = getMessageStrategy(groupChat);

    expect(isGroupChat).toHaveBeenCalledWith(groupChat);
    expect(strategy.getGroupInfo(groupChat)).toEqual({ creator: 'admin', group: 'group1' });
  });
});

describe('processAndNotify', () => {
  const mockState = {
    accountId: 'test-account',
    config: { username: 'test-bot' },
  } as unknown as AccountRuntimeState;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return false when chat validation fails', async () => {
    const chat: ZTMChat = { peer: 'alice', latest: { time: 123, message: 'hi' } };
    (validateChatMessage as ReturnType<typeof vi.fn>).mockReturnValue({ valid: false, reason: 'invalid_peer' });

    const result = await processAndNotify(chat, mockState, []);

    expect(result).toBe(false);
    expect(notifyMessageCallbacks).not.toHaveBeenCalled();
  });

  it('should process peer chat and notify callbacks', async () => {
    const chat: ZTMChat = { peer: 'alice', latest: { time: 123, message: 'hi', sender: 'alice' } };
    const normalizedMessage = { peer: 'alice', time: 123, message: 'hi', sender: 'alice' };

    (validateChatMessage as ReturnType<typeof vi.fn>).mockReturnValue({ valid: true });
    (isGroupChat as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (processPeerMessage as ReturnType<typeof vi.fn>).mockReturnValue(normalizedMessage);
    (notifyMessageCallbacks as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (handlePeerPolicyCheck as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const result = await processAndNotify(chat, mockState, []);

    expect(result).toBe(true);
    expect(processPeerMessage).toHaveBeenCalled();
    expect(notifyMessageCallbacks).toHaveBeenCalledWith(mockState, normalizedMessage);
    expect(handlePeerPolicyCheck).toHaveBeenCalledWith('alice', mockState, [], 'New message');
  });

  it('should process group chat and notify callbacks', async () => {
    const chat: ZTMChat = {
      creator: 'admin',
      group: 'group1',
      name: 'TestGroup',
      latest: { time: 123, message: 'hello', sender: 'bob' }
    };
    const normalizedMessage = { isGroup: true, groupId: 'group1', groupCreator: 'admin', time: 123, message: 'hello', sender: 'bob' };

    (validateChatMessage as ReturnType<typeof vi.fn>).mockReturnValue({ valid: true });
    (isGroupChat as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (processGroupMessage as ReturnType<typeof vi.fn>).mockReturnValue(normalizedMessage);
    (notifyMessageCallbacks as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const result = await processAndNotify(chat, mockState, []);

    expect(result).toBe(true);
    expect(processGroupMessage).toHaveBeenCalled();
    expect(notifyMessageCallbacks).toHaveBeenCalledWith(mockState, normalizedMessage);
    // Group messages should NOT trigger peer policy check
    expect(handlePeerPolicyCheck).not.toHaveBeenCalled();
  });

  it('should return false when normalization returns null', async () => {
    const chat: ZTMChat = { peer: 'alice', latest: { time: 123, message: 'hi', sender: 'alice' } };

    (validateChatMessage as ReturnType<typeof vi.fn>).mockReturnValue({ valid: true });
    (isGroupChat as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (processPeerMessage as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const result = await processAndNotify(chat, mockState, []);

    expect(result).toBe(false);
    expect(notifyMessageCallbacks).not.toHaveBeenCalled();
  });
});
```

### Step 2: Run tests to verify they fail

Run:
```bash
npm test -- src/messaging/strategies/message-strategies.test.ts --run
```

Expected: FAIL - "getMessageStrategy is not defined", "processAndNotify is not defined"

### Step 3: Commit

```bash
git add src/messaging/strategies/message-strategies.test.ts
git commit -m "test: add failing unit tests for message strategies"
```

---

## Task 3: Implement Strategy Interface and Implementations

**Files:**
- Modify: `src/messaging/strategies/message-strategies.ts`

### Step 1: Write minimal implementation

Create `src/messaging/strategies/message-strategies.ts`:

```typescript
/**
 * Message Processing Strategies
 * @module messaging/strategies
 * Strategy Pattern implementation for unified message processing
 */

import type { ZTMChat } from '../../types/api.js';
import type { ZTMChatMessage } from '../../types/messaging.js';
import type { AccountRuntimeState } from '../../runtime/state.js';
import { isGroupChat, extractSender, validateChatMessage, processPeerMessage, processGroupMessage, handlePeerPolicyCheck } from '../message-processor-helpers.js';
import { notifyMessageCallbacks } from '../dispatcher.js';

/**
 * Raw message structure before normalization
 */
interface RawMessage {
  time: number;
  message: string;
  sender: string;
}

/**
 * Group metadata
 */
interface GroupInfo {
  creator: string;
  group: string;
}

/**
 * Context for message processing
 */
interface ProcessingContext {
  state: AccountRuntimeState;
  storeAllowFrom: string[];
  groupInfo?: GroupInfo;
  groupName?: string;
}

/**
 * Strategy interface for message processing
 */
export interface MessageProcessingStrategy {
  normalize(msg: RawMessage, ctx: ProcessingContext): ZTMChatMessage | null;
  getGroupInfo(chat: ZTMChat): GroupInfo | null;
}

/**
 * Peer message processing strategy
 */
class PeerMessageStrategy implements MessageProcessingStrategy {
  normalize(msg: RawMessage, ctx: ProcessingContext): ZTMChatMessage | null {
    return processPeerMessage(msg, ctx.state, ctx.storeAllowFrom);
  }

  getGroupInfo(_chat: ZTMChat): GroupInfo | null {
    return null;
  }
}

/**
 * Group message processing strategy
 */
class GroupMessageStrategy implements MessageProcessingStrategy {
  normalize(msg: RawMessage, ctx: ProcessingContext): ZTMChatMessage | null {
    return processGroupMessage(
      msg,
      ctx.state,
      ctx.storeAllowFrom,
      ctx.groupInfo!,
      ctx.groupName
    );
  }

  getGroupInfo(chat: ZTMChat): GroupInfo | null {
    if (chat.creator && chat.group) {
      return { creator: chat.creator, group: chat.group };
    }
    return null;
  }
}

/**
 * Factory function to get appropriate strategy based on chat type
 */
export function getMessageStrategy(chat: ZTMChat): MessageProcessingStrategy {
  return isGroupChat(chat)
    ? new GroupMessageStrategy()
    : new PeerMessageStrategy();
}

/**
 * Unified message processing and notification.
 * Replaces: processAndNotifyChat, processAndNotifyPeerMessages, processAndNotifyGroupMessages
 *
 * @param chat - The ZTM chat to process
 * @param state - Account runtime state
 * @param storeAllowFrom - Allowed senders list
 * @returns True if message was processed, false otherwise
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

### Step 2: Run tests to verify they pass

Run:
```bash
npm test -- src/messaging/strategies/message-strategies.test.ts --run
```

Expected: PASS

### Step 3: Commit

```bash
git add src/messaging/strategies/message-strategies.ts
git commit -m "feat: implement message processing strategies"
```

---

## Task 4: Update chat-processor.ts

**Files:**
- Modify: `src/messaging/chat-processor.ts:75-139`

### Step 1: Replace processAndNotifyChat with re-export

Replace the `processAndNotifyChat` function (lines 75-139) with a re-export from strategies:

```typescript
// Re-export unified function from strategies
export { processAndNotify } from './strategies/message-strategies.js';
export { getMessageStrategy } from './strategies/message-strategies.js';
```

### Step 2: Run tests to verify

Run:
```bash
npm test -- src/messaging/chat-processor.test.ts --run
```

Expected: FAIL - tests still reference old processAndNotifyChat

### Step 3: Commit

```bash
git add src/messaging/chat-processor.ts
git commit -m "refactor: replace processAndNotifyChat with re-export from strategies"
```

---

## Task 5: Update message-processor-helpers.ts

**Files:**
- Modify: `src/messaging/message-processor-helpers.ts:269-305`

### Step 1: Remove duplicate functions

Remove these two functions:
- `processAndNotifyPeerMessages` (lines 269-280)
- `processAndNotifyGroupMessages` (lines 292-305)

Replace with re-export from strategies:

```typescript
// Re-export unified function from strategies
export { processAndNotify } from './strategies/message-strategies.js';
```

### Step 2: Run tests to verify

Run:
```bash
npm test -- src/messaging/message-processor-helpers.test.ts --run
```

Expected: FAIL - tests reference removed functions

### Step 3: Commit

```bash
git add src/messaging/message-processor-helpers.ts
git commit -m "refactor: remove duplicate processAndNotify* functions, re-export from strategies"
```

---

## Task 6: Update watcher.ts call sites

**Files:**
- Modify: `src/messaging/watcher.ts`

### Step 1: Update imports

In `src/messaging/watcher.ts`, update imports:

```typescript
// Before:
import { processAndNotifyChat } from './chat-processor.js';
import {
  processAndNotifyPeerMessages,
  processAndNotifyGroupMessages,
} from './message-processor-helpers.js';

// After:
import { processAndNotify } from './strategies/message-strategies.js';
```

### Step 2: Update function calls

Replace all occurrences:
- `processAndNotifyChat(...)` → `processAndNotify(...)`
- `processAndNotifyPeerMessages(...)` → (remove - batch processing handled differently)
- `processAndNotifyGroupMessages(...)` → (remove - batch processing handled differently)

Note: For batch processing (multiple messages), you'll need to iterate and call `processAndNotify` for each:

```typescript
// Before:
await processAndNotifyPeerMessages(messages, state, storeAllowFrom);

// After:
for (const msg of messages) {
  const chat = { peer: peerId, latest: msg };
  await processAndNotify(chat, state, storeAllowFrom);
}
```

### Step 3: Run tests to verify

Run:
```bash
npm test -- src/messaging/watcher.test.ts --run
```

Expected: FAIL - tests mock old functions

### Step 4: Commit

```bash
git add src/messaging/watcher.ts
git commit -m "refactor: update watcher.ts to use unified processAndNotify"
```

---

## Task 7: Update watcher.test.ts

**Files:**
- Modify: `src/messaging/watcher.test.ts`

### Step 1: Update mocks

Update the mocks to reference new function:

```typescript
// Before:
processAndNotifyChat: vi.fn(() => Promise.resolve(true)),
processAndNotifyPeerMessages: vi.fn(() => Promise.resolve()),
processAndNotifyGroupMessages: vi.fn(() => {}),

// After:
processAndNotify: vi.fn(() => Promise.resolve(true)),
```

### Step 2: Update test assertions

Replace all references:
- `processAndNotifyChat` → `processAndNotify`
- Remove `processAndNotifyPeerMessages` and `processAndNotifyGroupMessages` assertions

### Step 3: Run tests to verify

Run:
```bash
npm test -- src/messaging/watcher.test.ts --run
```

Expected: PASS

### Step 4: Commit

```bash
git add src/messaging/watcher.test.ts
git commit -m "test: update watcher tests for unified processAndNotify"
```

---

## Task 8: Update chat-processor.test.ts

**Files:**
- Modify: `src/messaging/chat-processor.test.ts`

### Step 1: Update imports and test references

Update import:
```typescript
// Before:
import { processChatMessage, processAndNotifyChat } from './chat-processor.js';

// After:
import { processChatMessage, processAndNotify } from './chat-processor.js';
```

Replace all `processAndNotifyChat` with `processAndNotify` in test descriptions and assertions.

### Step 2: Run tests to verify

Run:
```bash
npm test -- src/messaging/chat-processor.test.ts --run
```

Expected: PASS

### Step 3: Commit

```bash
git add src/messaging/chat-processor.test.ts
git commit -m "test: update chat-processor tests for unified processAndNotify"
```

---

## Task 9: Update message-processor-helpers.test.ts

**Files:**
- Modify: `src/messaging/message-processor-helpers.test.ts`

### Step 1: Update imports

```typescript
// Before:
import {
  processAndNotifyPeerMessages,
  processAndNotifyGroupMessages,
} from './message-processor-helpers.js';

// After: (these functions no longer exist, import from strategies)
import { processAndNotify } from './message-processor-helpers.js';
```

### Step 2: Update test cases

Replace test suites:
- `processAndNotifyPeerMessages` → test `processAndNotify` with peer chats
- `processAndNotifyGroupMessages` → test `processAndNotify` with group chats

### Step 3: Run tests to verify

Run:
```bash
npm test -- src/messaging/message-processor-helpers.test.ts --run
```

Expected: PASS

### Step 4: Commit

```bash
git add src/messaging/message-processor-helpers.test.ts
git commit -m "test: update helpers tests for unified processAndNotify"
```

---

## Task 10: Run Full Test Suite

### Step 1: Run all tests

Run:
```bash
npm test -- --run
```

Expected: All tests pass (may have 2-3 pre-existing failures in e2e tests)

### Step 2: Commit

```bash
git commit -m "test: run full test suite - all passing"
```

---

## Task 11: Verify No Code Duplication

### Step 1: Check for remaining duplication

Run:
```bash
grep -n "processIncomingMessage" src/messaging/chat-processor.ts src/messaging/message-processor-helpers.ts
```

Expected: Only in `processor.ts` (the normalization function)

### Step 2: Commit final state

```bash
git commit -m "refactor: complete message processing deduplication - zero duplication achieved"
```

---

## Summary

After completing all tasks:
- ✅ New strategy module at `src/messaging/strategies/`
- ✅ Unified `processAndNotify` function replaces 3 duplicate functions
- ✅ All 8+ call sites updated
- ✅ All tests passing
- ✅ Zero code duplication in message processing pipeline
