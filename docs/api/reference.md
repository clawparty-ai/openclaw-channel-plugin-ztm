# ZTM Chat API Documentation

The ZTM Chat Plugin provides a complete API for communicating with the ZTM Agent, enabling P2P messaging, group management, and file operations.

## Overview

The API uses the **Result<T, E>** pattern for error handling. All operations return:
- **Success**: `{ ok: true, value: T }`
- **Failure**: `{ ok: false, error: E }`

This pattern provides clearer error handling compared to traditional approaches:
- `Promise<T | null>` - Cannot distinguish "not found" from "error"
- `Promise<boolean>` - Loses error details
- Silent failures (returning empty arrays)

## Table of Contents

- [Quick Start](#quick-start)
- [API Client](#api-client)
- [Core Types](#core-types)
- [Message Types](#message-types)
- [Error Types](#error-types)
- [Configuration Types](#configuration-types)

## Quick Start

```typescript
import { createZTMApiClient, type ZTMApiClient } from './api/ztm-api.js';
import { isSuccess } from './types/common.js';

const config = {
  agentUrl: 'http://localhost:3000',
  dmPolicy: 'allow',
  enableGroups: true,
};

const client: ZTMApiClient = createZTMApiClient(config);

// Send a message
const sendResult = await client.sendPeerMessage('alice', {
  time: Date.now(),
  message: 'Hello!',
  sender: 'me',
});

if (isSuccess(sendResult)) {
  console.log('Message sent:', sendResult.value);
} else {
  console.error('Failed:', sendResult.error.message);
}

// Get messages
const messagesResult = await client.getPeerMessages('alice');
if (isSuccess(messagesResult)) {
  messagesResult.value.forEach(msg => {
    console.log(`[${msg.sender}]: ${msg.message}`);
  });
}
```

## API Client

### createZTMApiClient

Creates a ZTM API client instance.

```typescript
import { createZTMApiClient } from './api/ztm-api.js';

function createZTMApiClient(
  config: ZTMChatConfig,
  deps?: Partial<ZTMApiClientDeps>
): ZTMApiClient
```

**Parameters:**
- `config: ZTMChatConfig` - ZTM Chat configuration
- `deps?: Partial<ZTMApiClientDeps>` - Optional dependency injection (for testing)

**Returns:** `ZTMApiClient` - API client instance

## Core Types

### ZTMApiClient

ZTM API client interface defining all available API methods.

```typescript
interface ZTMApiClient {
  // Mesh Operations
  getMeshInfo(): Promise<Result<ZTMMeshInfo, ZTMApiError>>;

  // User/Peer Discovery
  discoverUsers(): Promise<Result<ZTMUserInfo[], ZTMDiscoveryError>>;
  discoverPeers(): Promise<Result<ZTMPeer[], ZTMDiscoveryError>>;
  listUsers(): Promise<Result<ZTMUserInfo[], ZTMDiscoveryError>>;

  // Chat Operations
  getChats(): Promise<Result<ZTMChat[], ZTMReadError>>;
  getPeerMessages(peer: string, since?: number, before?: number): Promise<Result<ZTMMessage[], ZTMReadError>>;
  sendPeerMessage(peer: string, message: ZTMMessage): Promise<Result<boolean, ZTMSendError>>;

  // Group Operations
  getGroupMessages(creator: string, group: string): Promise<Result<ZTMMessage[], ZTMReadError>>;
  sendGroupMessage(creator: string, group: string, message: ZTMMessage): Promise<Result<boolean, ZTMSendError>>;

  // File Operations
  watchChanges(prefix: string): Promise<Result<WatchChangeItem[], ZTMReadError>>;
  seedFileMetadata(metadata: Record<string, { time: number; size: number }>): void;
  exportFileMetadata(): Record<string, { time: number; size: number }>;
}
```

## Message Types

### ZTMMessage

ZTM message interface - matches ZTM Agent API format.

```typescript
interface ZTMMessage {
  /** Message timestamp */
  time: number;
  /** Message content */
  message: string;
  /** Sender username */
  sender: string;
}
```

### ZTMChatMessage

Local normalized ZTM chat message format.

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
  /** Group display name (e.g., "Group-test1") */
  groupName?: string;
  /** Group ID (e.g., "98cfeaa5-...") */
  groupId?: string;
  /** Group creator */
  groupCreator?: string;
}
```

### RawZTMMessage

Raw ZTM message format (from API).

```typescript
interface RawZTMMessage {
  /** Message timestamp */
  time: number;
  /** Message content */
  message: string;
  /** Sender username */
  sender: string;
}
```

### ZTMChat

ZTM chat interface - matches `/apps/ztm/chat/api/chats` response.

```typescript
interface ZTMChat {
  /** Peer username (for DM) */
  peer?: string;
  /** Group creator */
  creator?: string;
  /** Group ID */
  group?: string;
  /** Chat display name */
  name?: string;
  /** Group member list */
  members?: string[];
  /** Creation time */
  time: number;
  /** Last update time */
  updated: number;
  /** Latest message */
  latest: ZTMMessage;
}
```

### ZTMPeer

ZTM Peer interface.

```typescript
interface ZTMPeer {
  /** Peer username */
  username: string;
  /** Peer endpoint (optional) */
  endpoint?: string;
}
```

### ZTMUserInfo

ZTM User Info interface.

```typescript
interface ZTMUserInfo {
  /** Username */
  username: string;
  /** User endpoint (optional) */
  endpoint?: string;
}
```

### ZTMMeshInfo

ZTM Mesh Info interface - matches `/api/meshes/{name}` response.

```typescript
interface ZTMMeshInfo {
  /** Mesh name */
  name: string;
  /** Whether connected */
  connected: boolean;
  /** Number of endpoints */
  endpoints: number;
  /** Error list (optional) */
  errors?: Array<{ time: string; message: string }>;
}
```

### WatchChangeItem

Storage change watch item.

```typescript
interface WatchChangeItem {
  /** Change type */
  type: 'peer' | 'group';
  /** Peer username (when type='peer') */
  peer?: string;
  /** Group creator (when type='group') */
  creator?: string;
  /** Group ID (when type='group') */
  group?: string;
  /** Group display name */
  name?: string;
}
```

## Error Types

All errors inherit from the `ZTMError` base class, providing structured error information.

### Error Class Hierarchy

```
ZTMError (Base Class)
|
+-- ZTMSendError       (Message Send Failed)
+-- ZTMWriteError      (Message Write Failed)
+-- ZTMReadError       (Message Read Failed)
+-- ZTMParseError      (Message Parse Failed)
+-- ZTMDiscoveryError   (Discovery Failed)
+-- ZTMApiError        (API Communication Failed)
+-- ZTMTimeoutError    (API Timeout)
+-- ZTMRuntimeError    (Runtime Not Initialized)
+-- ZTMConfigError     (Config Invalid)
```

### ZTMError

Base class for all ZTM errors.

```typescript
class ZTMError extends Error {
  constructor(
    /** Error context information */
    public readonly context: Record<string, unknown> = {},
    /** Original error cause */
    public readonly cause?: Error
  ) {}

  /** Get JSON representation */
  toJSON(): Record<string, unknown>;
}
```

### ZTMSendError

Thrown when sending a peer message fails.

```typescript
class ZTMSendError extends ZTMError {
  constructor({
    /** Username of the peer the message was sent to */
    peer: string;
    /** Timestamp of the failed message */
    messageTime: number;
    /** Message content preview (for logging) */
    contentPreview?: string;
    /** Underlying error cause */
    cause?: Error;
  })
}
```

**Context Properties:**
- `peer` - Target username
- `messageTime` - Message timestamp
- `contentPreview` - Message content preview (first 100 chars)
- `attemptedAt` - Attempt time (ISO format)

### ZTMReadError

Thrown when reading messages fails.

```typescript
class ZTMReadError extends ZTMError {
  constructor({
    /** Peer whose messages were being read */
    peer: string;
    /** Type of read operation */
    operation?: 'read' | 'list' | 'parse';
    /** Failed file path (optional) */
    filePath?: string;
    /** Underlying error cause */
    cause?: Error;
  })
}
```

### ZTMApiError

Thrown when ZTM Agent API communication fails.

```typescript
class ZTMApiError extends ZTMError {
  constructor({
    /** HTTP method that was attempted */
    method: string;
    /** API path that was requested */
    path: string;
    /** HTTP status code if available */
    statusCode?: number;
    /** HTTP status text if available */
    statusText?: string;
    /** Response body if available */
    responseBody?: string;
    /** Underlying error cause */
    cause?: Error;
  })
}
```

**Error Message Format:**
```
ZTM API error: POST /api/meshes/test-mesh/apps/ztm/chat/api/peers/alice/messages - 500 Internal Server Error: <cause>
```

### ZTMTimeoutError

Thrown when API request times out.

```typescript
class ZTMTimeoutError extends ZTMError {
  constructor({
    /** HTTP method */
    method: string;
    /** API path */
    path: string;
    /** Timeout in milliseconds */
    timeoutMs: number;
    /** Underlying error cause */
    cause?: Error;
  })
}
```

### ZTMDiscoveryError

Thrown when user/peer discovery operation fails.

```typescript
class ZTMDiscoveryError extends ZTMError {
  constructor({
    /** Type of discovery operation */
    operation?: 'discoverUsers' | 'discoverPeers' | 'scanStorage';
    /** Source of the discovery attempt */
    source?: string;
    /** Underlying error cause */
    cause?: Error;
  })
}
```

### ZTMConfigError

Thrown when configuration is invalid.

```typescript
class ZTMConfigError extends ZTMError {
  constructor({
    /** Invalid field name */
    field: string;
    /** Field value (optional) */
    value?: unknown;
    /** Reason for failure */
    reason: string;
  })
}
```

**Error Message Format:**
```
Invalid ZTM configuration for agentUrl: reason (got: value)
```

### ZTMRuntimeError

Thrown when runtime is not properly initialized.

```typescript
class ZTMRuntimeError extends ZTMError {
  constructor({
    /** Operation that failed */
    operation: string;
    /** Reason for failure */
    reason: string;
  })
}
```

## Configuration Types

### ZTMChatConfig

ZTM Chat plugin configuration.

```typescript
interface ZTMChatConfig {
  /** ZTM Agent URL */
  agentUrl: string;
  /** DM policy: "allow" | "deny" | "pairing" */
  dmPolicy?: 'allow' | 'deny' | 'pairing';
  /** Whitelist for pairing mode */
  allowFrom?: string[];
  /** Whether to enable group chats */
  enableGroups?: boolean;
  /** Whether to enable auto-reply */
  autoReply?: string;
  /** Message storage path */
  messagePath?: string;
  /** Custom polling interval (ms) */
  pollingInterval?: number;
  /** API request timeout (ms) */
  apiTimeout?: number;
}
```

### DMPolicy

DM policy enum.

```typescript
type DMPolicy = 'allow' | 'deny' | 'pairing';
```

| Value | Description |
|-------|-------------|
| `allow` | Allow all DM messages |
| `deny` | Deny all DM messages |
| `pairing` | Only allow paired users |

## Error Handling Examples

### Basic Error Handling

```typescript
import { isSuccess } from './types/common.js';

const result = await client.sendPeerMessage('alice', message);

if (isSuccess(result)) {
  console.log('Success:', result.value);
} else {
  console.error('Error:', result.error.message);
  console.error('Details:', result.error.context);
}
```

### Type Guard Error Handling

```typescript
import { ZTMApiError, ZTMSendError, ZTMReadError } from './types/errors.js';

const result = await client.getPeerMessages('alice');

if (!isSuccess(result)) {
  const error = result.error;

  if (error instanceof ZTMApiError) {
    // API communication error
    console.log('API Error:', error.context.statusCode);
  } else if (error instanceof ZTMSendError) {
    // Send error
    console.log('Send Error:', error.context.peer);
  } else if (error instanceof ZTMReadError) {
    // Read error
    console.log('Read Error:', error.context.peer);
  }
}
```

### Result Helper Functions

```typescript
import { tryCatch, tryCatchAsync } from './types/errors.js';

// Sync function wrapper
const result = tryCatch(() => JSON.parse(input));

// Async function wrapper
const asyncResult = await tryCatchAsync(async () => {
  const response = await fetch(url);
  return response.json();
});
```

## Constants

All constants are defined in `src/constants.ts`:

| Constant | Value | Description |
|----------|-------|-------------|
| `API_TIMEOUT_MS` | 30000 | API request timeout (30s) |
| `POLLING_INTERVAL_DEFAULT_MS` | 2000 | Default polling interval (2s) |
| `WATCH_INTERVAL_MS` | 1000 | Watch mode interval (1s) |
| `PAIRING_MAX_AGE_MS` | 3600000 | Pairing request expiry (1 hour) |
| `RETRY_INITIAL_DELAY_MS` | 1000 | Retry initial delay (1s) |
| `RETRY_MAX_DELAY_MS` | 10000 | Retry max delay (10s) |
| `MAX_MESSAGE_LENGTH` | 10000 | Max message length (10KB) |
| `MAX_PEERS_PER_ACCOUNT` | 100 | Max peers per account |
| `MAX_CHATS_PER_POLL` | 100 | Max chats per poll |
