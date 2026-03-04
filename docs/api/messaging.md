# Messaging API

The Messaging API provides the message processing pipeline for ZTM Chat plugin, including watching for new messages, processing them through validation and policy checks, dispatching to registered callbacks, and sending outbound messages.

## Overview

```
watcher.ts → processor.ts → dispatcher.ts → callbacks (AI Agent)
                      ↓
                   outbound.ts
```

## Table of Contents

- [Message Watcher](#message-watcher)
- [Message Processor](#message-processor)
- [Message Dispatcher](#message-dispatcher)
- [Outbound Messaging](#outbound-messaging)

## Message Watcher

### startMessageWatcher

Start message watcher using ZTM's Watch mechanism with Fibonacci backoff for error recovery.

```typescript
import { startMessageWatcher } from './messaging/watcher.js';

async function startMessageWatcher(
  state: AccountRuntimeState,
  context: MessagingContext,
  abortSignal?: AbortSignal
): Promise<void>
```

**Parameters:**
- `state: AccountRuntimeState` - Account runtime state with config and API client
- `context: MessagingContext` - Messaging context with repository dependencies
- `abortSignal?: AbortSignal` - Optional abort signal for graceful shutdown

**Returns:** `Promise<void>` - Resolves when the watcher starts

**Process:**
1. Seeds API client with persisted file timestamps
2. Performs initial sync of all existing messages
3. Starts a watch loop that polls for changes every 1 second
4. Uses Fibonacci backoff if watch errors occur (1s, 1s, 2s, 3s, 5s... capped at 30s)

**Example:**

```typescript
const messagingContext = container.get(DEPENDENCIES.MESSAGING_CONTEXT);
const abortController = new AbortSignal();

await startMessageWatcher(state, messagingContext, abortController.signal);

// Graceful shutdown
abortController.abort();
```

---

## Message Processor

### processIncomingMessage

Process an incoming message through the validation and policy pipeline.

```typescript
import { processIncomingMessage, type ProcessMessageContext } from './messaging/processor.js';

function processIncomingMessage(
  msg: { time: number; message: string; sender: string },
  context: ProcessMessageContext
): ZTMChatMessage | null
```

**Parameters:**
- `msg: { time: number; message: string; sender: string }` - Raw message object
- `context: ProcessMessageContext` - Processing context with config

**Process:**
1. Skips empty or whitespace-only messages
2. Skips messages from the bot itself (self-messages)
3. Uses watermark to skip already-processed messages
4. Applies DM policy to determine if message should be accepted

**Returns:** `ZTMChatMessage | null` - Normalized message or null if skipped

**Example:**

```typescript
const context: ProcessMessageContext = {
  config: { dmPolicy: 'pairing', allowFrom: [], username: 'bot' },
  storeAllowFrom: [],
  accountId: 'default'
};

const result = processIncomingMessage(
  { time: 1234567890, message: "Hello", sender: "alice" },
  context
);

// result: { id: "1234567890-alice", content: "Hello", sender: "alice", ... }
```

### ProcessMessageContext

```typescript
interface ProcessMessageContext {
  /** ZTM Chat configuration for policy evaluation */
  config: ZTMChatConfig;
  /** Persisted approved user list */
  storeAllowFrom?: string[];
  /** Account identifier for watermark tracking (default: "default") */
  accountId?: string;
  /** Optional group info for group messages */
  groupInfo?: { creator: string; group: string };
  /** Optional watermark store for testing */
  watermarkStore?: MessageStateStore;
}
```

### isValidMessage

Validate if a message object has required fields.

```typescript
function isValidMessage(
  msg: unknown
): msg is { time: number; message: string; sender: string }
```

**Parameters:**
- `msg: unknown` - The message object to validate

**Returns:** `boolean` - True if the message has all required fields

---

## Message Dispatcher

### notifyMessageCallbacks

Notify all registered message callbacks for a received message.

```typescript
import { notifyMessageCallbacks } from './messaging/dispatcher.js';

async function notifyMessageCallbacks(
  state: AccountRuntimeState,
  message: ZTMChatMessage,
  watermarkStore?: MessageStateStore
): Promise<void>
```

**Parameters:**
- `state: AccountRuntimeState` - Account runtime state containing callbacks
- `message: ZTMChatMessage` - Normalized message to dispatch
- `watermarkStore?: MessageStateStore` - Optional watermark store

**Process:**
1. Updates the last inbound timestamp
2. Executes all registered callbacks asynchronously with semaphore control
3. Handles callback errors gracefully
4. Updates watermark after successful processing

**Example:**

```typescript
const message: ZTMChatMessage = {
  id: '1234567890-alice',
  content: 'Hello',
  sender: 'alice',
  senderId: 'alice',
  timestamp: new Date(),
  peer: 'alice'
};

await notifyMessageCallbacks(state, message);
```

### getCallbackStats

Get statistics about registered callbacks.

```typescript
function getCallbackStats(state: AccountRuntimeState): {
  total: number;
  active: number;
}
```

**Parameters:**
- `state: AccountRuntimeState` - Account runtime state containing callbacks

**Returns:** Object with total and active callback counts

### hasCallbacks

Check if any callbacks are registered.

```typescript
function hasCallbacks(state: AccountRuntimeState): boolean
```

**Parameters:**
- `state: AccountRuntimeState` - Account runtime state containing callbacks

**Returns:** `boolean` - true if at least one callback is registered

### clearCallbacks

Clear all registered callbacks.

```typescript
function clearCallbacks(state: AccountRuntimeState): void
```

**Parameters:**
- `state: AccountRuntimeState` - Account runtime state containing callbacks

---

## Outbound Messaging

### sendZTMMessage

Send a message to a ZTM peer or group.

```typescript
import { sendZTMMessage } from './messaging/outbound.js';

async function sendZTMMessage(
  state: AccountRuntimeState,
  peer: string,
  content: string,
  groupInfo?: { creator: string; group: string }
): Promise<Result<boolean, ZTMSendError>>
```

**Parameters:**
- `state: AccountRuntimeState` - Account runtime state
- `peer: string` - The recipient peer identifier (for peer messages)
- `content: string` - The message content to send
- `groupInfo?: { creator: string; group: string }` - Optional group info for group messages

**Returns:** `Promise<Result<boolean, ZTMSendError>>` - Result indicating success or failure

**Example:**

```typescript
import { isSuccess } from './types/common.js';

// Send to peer
const result = await sendZTMMessage(state, 'alice', 'Hello!');
if (isSuccess(result)) {
  console.log('Message sent successfully');
} else {
  console.error('Failed:', result.error.message);
}

// Send to group
const groupResult = await sendZTMMessage(
  state,
  '',
  'Hello group!',
  { creator: 'admin', group: 'group-123' }
);
```

### generateMessageId

Generate a unique message ID for outbound messages.

```typescript
function generateMessageId(): string
```

**Returns:** A unique message ID string (format: `ztm-{timestamp}-{random}`)

**Example:**

```typescript
const messageId = generateMessageId();
// Result: "ztm-1700000000000-a1b2c3d4"
```

---

## Related Types

### ZTMChatMessage

```typescript
interface ZTMChatMessage {
  /** Unique message ID */
  id: string;
  /** Message content */
  content: string;
  /** Sender display name */
  sender: string;
  /** Sender ID */
  senderId: string;
  /** Message timestamp */
  timestamp: Date;
  /** Peer username */
  peer: string;
  /** Thread ID (optional) */
  thread?: string;
  /** Whether this is a group message */
  isGroup?: string;
  /** Group display name */
  groupName?: string;
  /** Group ID */
  groupId?: string;
  /** Group creator */
  groupCreator?: string;
}
```

### AccountRuntimeState

```typescript
interface AccountRuntimeState {
  accountId: string;
  config: ZTMChatConfig | null;
  chatReader: IChatReader | null;
  chatSender: IChatSender | null;
  discovery: IDiscovery | null;
  started: boolean;
  lastError: string | null;
  lastStartAt: Date | null;
  lastStopAt: Date | null;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  messageCallbacks: Set<MessageCallback>;
  callbackSemaphore: Semaphore;
  watchInterval: NodeJS.Timeout | null;
  watchErrorCount: number;
  pendingPairings: Map<string, Date>;
  allowFromCache: { value: string[]; timestamp: number } | null;
  groupPermissionCache: GroupPermissionLRUCache;
}
```
