# TypeScript Type Reference

This document provides a complete listing of all public TypeScript type definitions in the ZTM Chat Plugin.

## Type Index

- [Basic Types](#basic-types)
- [API Types](#api-types)
- [Configuration Types](#configuration-types)
- [Message Types](#message-types)
- [Error Types](#error-types)
- [Runtime Types](#runtime-types)

## Basic Types

### Result<T, E>

Result type for API responses and error handling.

```typescript
type Result<T, E = Error> = Success<T> | Failure<E>;

interface Success<T> {
  ok: true;
  value: T;
}

interface Failure<E> {
  ok: false;
  error: E;
}
```

**Usage Example:**

```typescript
import { success, failure, isSuccess } from './types/common.js';

function divide(a: number, b: number): Result<number, Error> {
  if (b === 0) {
    return failure(new Error('Division by zero'));
  }
  return success(a / b);
}

const result = divide(10, 2);
if (isSuccess(result)) {
  console.log(result.value); // 5
}
```

## API Types

### ZTMApiClient

Main ZTM API client interface.

```typescript
interface ZTMApiClient {
  // ==================== Mesh Operations ====================

  /** Get current mesh information */
  getMeshInfo(): Promise<Result<ZTMMeshInfo, ZTMApiError>>;

  // ==================== User/Peer Discovery ====================

  /** Discover available users in the mesh */
  discoverUsers(): Promise<Result<ZTMUserInfo[], ZTMDiscoveryError>>;

  /** Discover available peers */
  discoverPeers(): Promise<Result<ZTMPeer[], ZTMDiscoveryError>>;

  /** Discover active peers by scanning shared storage */
  listUsers(): Promise<Result<ZTMUserInfo[], ZTMDiscoveryError>>;

  // ==================== Chat Operations ====================

  /** Get all chats */
  getChats(): Promise<Result<ZTMChat[], ZTMReadError>>;

  /** Get messages from a specific peer */
  getPeerMessages(
    peer: string,
    since?: number,
    before?: number
  ): Promise<Result<ZTMMessage[], ZTMReadError>>;

  /** Send a message to a peer */
  sendPeerMessage(
    peer: string,
    message: ZTMMessage
  ): Promise<Result<boolean, ZTMSendError>>;

  // ==================== Group Operations ====================

  /** Get messages from a group */
  getGroupMessages(
    creator: string,
    group: string
  ): Promise<Result<ZTMMessage[], ZTMReadError>>;

  /** Send a message to a group */
  sendGroupMessage(
    creator: string,
    group: string,
    message: ZTMMessage
  ): Promise<Result<boolean, ZTMSendError>>;

  // ==================== File Operations ====================

  /** Watch for changes in storage */
  watchChanges(prefix: string): Promise<Result<WatchChangeItem[], ZTMReadError>>;

  /** Seed file metadata from persisted state (call before first watchChanges) */
  seedFileMetadata(metadata: Record<string, { time: number; size: number }>): void;

  /** Export current file metadata for persistence */
  exportFileMetadata(): Record<string, { time: number; size: number }>;
}
```

### ZTMMessage

ZTM message (matches ZTM Agent API format).

```typescript
interface ZTMMessage {
  /** Message timestamp (milliseconds) */
  time: number;
  /** Message content */
  message: string;
  /** Sender username */
  sender: string;
}
```

### ZTMPeer

ZTM Peer.

```typescript
interface ZTMPeer {
  /** Peer username */
  username: string;
  /** Peer endpoint URL */
  endpoint?: string;
}
```

### ZTMUserInfo

ZTM User Information.

```typescript
interface ZTMUserInfo {
  /** Username */
  username: string;
  /** User endpoint URL */
  endpoint?: string;
}
```

### ZTMMeshInfo

ZTM Mesh Information (matches `/api/meshes/{name}` response).

```typescript
interface ZTMMeshInfo {
  /** Mesh name */
  name: string;
  /** Whether connected */
  connected: boolean;
  /** Number of endpoints */
  endpoints: number;
  /** Error list */
  errors?: Array<{
    /** Error time */
    time: string;
    /** Error message */
    message: string;
  }>;
}
```

### ZTMChat

ZTM Chat (matches `/apps/ztm/chat/api/chats` response).

```typescript
interface ZTMChat {
  /** Peer username (for DM) */
  peer?: string;
  /** Group creator (for group) */
  creator?: string;
  /** Group ID (for group) */
  group?: string;
  /** Chat display name */
  name?: string;
  /** Group member list */
  members?: string[];
  /** Creation timestamp */
  time: number;
  /** Last update timestamp */
  updated: number;
  /** Latest message */
  latest: ZTMMessage;
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

### ZTMApiClientDeps

Dependencies for ZTMApiClient.

```typescript
interface ZTMApiClientDeps {
  /** Logger */
  logger: {
    info: (msg: string, ...args: unknown[]) => void;
    warn: (msg: string, ...args: unknown[]) => void;
    error: (msg: string, ...args: unknown[]) => void;
    debug: (msg: string, ...args: unknown[]) => void;
  };
  /** Fetch function */
  fetch: typeof fetch;
  /** Fetch with retry function */
  fetchWithRetry: typeof fetch;
}
```

## Configuration Types

### ZTMChatConfig

ZTM Chat plugin configuration.

```typescript
interface ZTMChatConfig {
  /** ZTM Agent URL (required) */
  agentUrl: string;
  /** DM policy */
  dmPolicy?: 'allow' | 'deny' | 'pairing';
  /** Whitelist for pairing mode */
  allowFrom?: string[];
  /** Whether to enable group chats */
  enableGroups?: boolean;
  /** Whether to enable auto-reply */
  autoReply?: boolean;
  /** Message storage path */
  messagePath?: string;
  /** Custom polling interval (ms) */
  pollingInterval?: number;
  /** API request timeout (ms) */
  apiTimeout?: number;
}
```

### DMPolicy

DM policy type.

```typescript
type DMPolicy = 'allow' | 'deny' | 'pairing';
```

| Value | Description |
|-------|-------------|
| `allow` | Allow all DM messages |
| `deny` | Deny all DM messages |
| `pairing` | Only allow paired users |

### ExtendedZTMChatConfig

Extended ZTM Chat configuration (runtime use).

```typescript
interface ExtendedZTMChatConfig extends ZTMChatConfig {
  /** Effective configuration values */
  effective: {
    agentUrl: string;
    dmPolicy: 'allow' | 'deny' | 'pairing';
    enableGroups: boolean;
    autoReply: boolean;
    messagePath: string;
    pollingInterval: number;
    apiTimeout: number;
  };
}
```

## Message Types

### ZTMChatMessage

Local normalized ZTM chat message.

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
  /** Thread ID */
  thread?: string;
  /** Whether this is a group message */
  isGroup?: boolean;
  /** Group display name (e.g., "Group-test1") */
  groupName?: string;
  /** Group ID (e.g., "98cfeaa5-...") */
  groupId?: string;
  /** Group creator */
  groupCreator?: string;
}
```

### MessageCheckResult

Message check result.

```typescript
interface MessageCheckResult {
  /** Whether processing is allowed */
  allowed: boolean;
  /** Reason */
  reason?: 'allowed' | 'denied' | 'pending' | 'whitelisted';
  /** Action to take */
  action?: 'process' | 'ignore' | 'request_pairing';
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

## Error Types

### ZTMError

Base class for all ZTM errors.

```typescript
abstract class ZTMError extends Error {
  /** Error context information */
  readonly context: Record<string, unknown>;
  /** Original error cause */
  readonly cause?: Error;

  /** Get JSON representation */
  toJSON(): Record<string, unknown>;
}
```

### ZTMSendError

Message send failed.

```typescript
class ZTMSendError extends ZTMError {
  constructor(params: {
    peer: string;
    messageTime: number;
    contentPreview?: string;
    cause?: Error;
  });
}
```

### ZTMReadError

Message read failed.

```typescript
class ZTMReadError extends ZTMError {
  constructor(params: {
    peer: string;
    operation?: 'read' | 'list' | 'parse';
    filePath?: string;
    cause?: Error;
  });
}
```

### ZTMWriteError

Message write failed.

```typescript
class ZTMWriteError extends ZTMError {
  constructor(params: {
    peer: string;
    messageTime: number;
    filePath: string;
    cause?: Error;
  });
}
```

### ZTMParseError

Message parse failed.

```typescript
class ZTMParseError extends ZTMError {
  constructor(params: {
    peer: string;
    filePath: string;
    parseDetails?: string;
    cause?: Error;
  });
}
```

### ZTMApiError

API communication failed.

```typescript
class ZTMApiError extends ZTMError {
  constructor(params: {
    method: string;
    path: string;
    statusCode?: number;
    statusText?: string;
    responseBody?: string;
    cause?: Error;
  });
}
```

### ZTMTimeoutError

API request timed out.

```typescript
class ZTMTimeoutError extends ZTMError {
  constructor(params: {
    method: string;
    path: string;
    timeoutMs: number;
    cause?: Error;
  });
}
```

### ZTMDiscoveryError

User/Peer discovery failed.

```typescript
class ZTMDiscoveryError extends ZTMError {
  constructor(params: {
    operation?: 'discoverUsers' | 'discoverPeers' | 'scanStorage';
    source?: string;
    cause?: Error;
  });
}
```

### ZTMConfigError

Configuration invalid.

```typescript
class ZTMConfigError extends ZTMError {
  constructor(params: {
    field: string;
    value?: unknown;
    reason: string;
  });
}
```

### ZTMRuntimeError

Runtime not initialized.

```typescript
class ZTMRuntimeError extends ZTMError {
  constructor(params: {
    operation: string;
    reason: string;
  });
}
```

## Runtime Types

### AccountRuntimeState

Account runtime state.

```typescript
interface AccountRuntimeState {
  /** Account ID */
  accountId: string;
  /** Account configuration */
  config: ExtendedZTMChatConfig;
  /** API client */
  apiClient: ZTMApiClient | null;
  /** Whether connected */
  connected: boolean;
  /** Whether mesh is connected */
  meshConnected: boolean;
  /** Set of message callback functions */
  messageCallbacks: Set<(message: ZTMChatMessage) => void | Promise<void>>;
  /** Watch mode interval ID */
  watchInterval: NodeJS.Timeout | null;
  /** Polling interval ID */
  pollingInterval: NodeJS.Timeout | null;
  /** List of allowed message sources */
  allowFrom: string[];
  /** Group info cache */
  groupInfoCache: Map<string, GroupInfo>;
  /** Whether message is being processed */
  processing: boolean;
  /** Last error */
  lastError: string | null;
  /** Message watermark (latest processed message timestamp) */
  messageWatermark: number;
}
```

### GroupInfo

Group information.

```typescript
interface GroupInfo {
  /** Group ID */
  groupId: string;
  /** Group creator */
  creator: string;
  /** Group name */
  name: string;
  /** Member list */
  members: string[];
}
```

### MessageStateStore

Message state store interface.

```typescript
interface MessageStateStore {
  /** Get watermark */
  getWatermark(peer: string): number | undefined;
  /** Set watermark */
  setWatermark(peer: string, time: number): void;
  /** Get all watermarks */
  getAllWatermarks(): Record<string, number>;
  /** Clear watermark */
  clearWatermark(peer: string): void;
  /** Get file metadata */
  getFileMetadata(path: string): { time: number; size: number } | undefined;
  /** Set file metadata */
  setFileMetadata(path: string, metadata: { time: number; size: number }): void;
  /** Get all file metadata */
  getAllFileMetadata(): Record<string, { time: number; size: number }>;
}
```
