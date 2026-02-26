# Runtime API

The Runtime API provides runtime management functions for ZTM Chat plugin, including runtime provider, account state management, and message state persistence.

## Overview

The runtime layer manages:
- Plugin runtime initialization
- Account state lifecycle (create, update, remove)
- Message watermarks for deduplication
- Caching for permissions and pairing

## Table of Contents

- [Runtime Provider](#runtime-provider)
- [Account State Manager](#account-state-manager)
- [Message State Store](#message-state-store)
- [Cache Management](#cache-management)

---

## Runtime Provider

### RuntimeProvider

Interface for runtime provider enabling dependency injection.

```typescript
interface RuntimeProvider {
  setRuntime(runtime: PluginRuntime): void;
  getRuntime(): PluginRuntime;
  isInitialized(): boolean;
}
```

### createRuntimeProvider

Create a new RuntimeProvider instance.

```typescript
import { createRuntimeProvider } from './runtime/runtime.js';

function createRuntimeProvider(): RuntimeProvider
```

**Returns:** A new RuntimeProvider instance

**Example:**

```typescript
const provider = createRuntimeProvider();
provider.setRuntime(pluginRuntime);

if (provider.isInitialized()) {
  const rt = provider.getRuntime();
}
```

### getDefaultRuntimeProvider

Get the default runtime provider.

```typescript
import { getDefaultRuntimeProvider } from './runtime/runtime.js';

function getDefaultRuntimeProvider(): RuntimeProvider
```

**Returns:** The default RuntimeProvider singleton

### setZTMRuntime

Set the ZTM runtime (uses default provider).

```typescript
import { setZTMRuntime } from './runtime/runtime.js';

function setZTMRuntime(next: PluginRuntime): void
```

**Parameters:**
- `next: PluginRuntime` - The runtime to use

**Example:**

```typescript
setZTMRuntime(pluginRuntime);
```

### getZTMRuntime

Get the ZTM runtime (uses default provider).

```typescript
import { getZTMRuntime } from './runtime/runtime.js';

function getZTMRuntime(): PluginRuntime
```

**Returns:** The current runtime instance

**Throws:** Error if runtime not initialized

### isRuntimeInitialized

Check if runtime is initialized.

```typescript
import { isRuntimeInitialized } from './runtime/runtime.js';

function isRuntimeInitialized(): boolean
```

**Returns:** true if runtime has been set

---

## Account State Manager

### AccountStateManager

Class for explicit state ownership with clear lifecycle management.

```typescript
import { AccountStateManager, getAccountStateManager } from './runtime/state.js';

const manager = getAccountStateManager();
```

#### Methods

##### getOrCreate

Get or create account state.

```typescript
manager.getOrCreate(accountId: string): AccountRuntimeState
```

**Parameters:**
- `accountId: string` - Unique identifier for the account

**Returns:** AccountRuntimeState for the specified account

##### remove

Remove account state and clean up resources.

```typescript
manager.remove(accountId: string): void
```

**Parameters:**
- `accountId: string` - The account identifier to remove

**Cleanup includes:**
- Clearing watch intervals
- Aborting watch abort controllers
- Clearing message callbacks
- Clearing pending pairings
- Clearing group permission cache

##### getAll

Get all states.

```typescript
manager.getAll(): Map<string, AccountRuntimeState>
```

**Returns:** Map of accountId to AccountRuntimeState

##### cleanupExpiredPairings

Clean up expired pending pairings from all accounts.

```typescript
manager.cleanupExpiredPairings(): number
```

**Returns:** Total number of expired pairings removed

**Enforces:**
- Time-based expiry (PAIRING_MAX_AGE_MS = 1 hour)
- Size-based limit (MAX_PAIRINGS_PER_ACCOUNT)

##### getAllowFromCache

Get cached allowFrom store or refresh if expired.

```typescript
async manager.getAllowFromCache(
  accountId: string,
  rt: PluginRuntime | (() => PluginRuntime)
): Promise<string[] | null>
```

**Parameters:**
- `accountId: string` - The account identifier
- `rt: PluginRuntime | (() => PluginRuntime)` - ZTM runtime

**Returns:** Promise resolving to allowFrom string array, or null if fetch failed

**Features:**
- TTL-based caching (ALLOW_FROM_CACHE_TTL_MS)
- Request coalescing to prevent cache stampede
- Graceful degradation on errors

##### clearAllowFromCache

Clear the allowFrom cache for an account.

```typescript
manager.clearAllowFromCache(accountId: string): void
```

##### getGroupPermissionCached

Get cached group permission or compute and cache if not present.

```typescript
manager.getGroupPermissionCached(
  accountId: string,
  creator: string,
  group: string,
  config: ZTMChatConfig
): GroupPermissions
```

**Parameters:**
- `accountId: string` - The account identifier
- `creator: string` - Group creator username
- `group: string` - Group ID
- `config: ZTMChatConfig` - ZTM Chat configuration

**Returns:** GroupPermissions for the specified group

##### clearGroupPermissionCache

Clear the group permission cache for an account.

```typescript
manager.clearGroupPermissionCache(accountId: string): void
```

##### initializeRuntime

Initialize runtime for an account.

```typescript
async manager.initializeRuntime(
  config: ZTMChatConfig,
  accountId: string
): Promise<boolean>
```

**Parameters:**
- `config: ZTMChatConfig` - ZTM Chat configuration
- `accountId: string` - Unique identifier for the account

**Returns:** Promise resolving to true if initialization succeeded

**Process:**
1. Creates or retrieves the account state
2. Initializes the ZTM API client
3. Attempts to connect to the mesh (with retries)
4. Sets up state for message processing

##### stopRuntime

Stop runtime for an account.

```typescript
async manager.stopRuntime(accountId: string): Promise<void>
```

**Parameters:**
- `accountId: string` - The account identifier to stop

**Process:**
1. Clears any watch intervals
2. Aborts watch abort controllers
3. Clears message callbacks
4. Clears caches
5. Marks the account as disconnected

---

## Module-Level Functions

### getAccountStateManager

Get the AccountStateManager singleton instance.

```typescript
import { getAccountStateManager } from './runtime/state.js';

function getAccountStateManager(): AccountStateManager
```

**Returns:** The AccountStateManager singleton instance

### getOrCreateAccountState

Get an existing account state or create a new one.

```typescript
import { getOrCreateAccountState } from './runtime/state.js';

function getOrCreateAccountState(accountId: string): AccountRuntimeState
```

**Parameters:**
- `accountId: string` - Unique identifier for the account

**Returns:** AccountRuntimeState for the specified account

**Example:**

```typescript
const state = getOrCreateAccountState('default');
console.log('Account started:', state.started);
```

### removeAccountState

Remove an account state and clean up resources.

```typescript
import { removeAccountState } from './runtime/state.js';

function removeAccountState(accountId: string): void
```

**Parameters:**
- `accountId: string` - The account identifier to remove

### getAllAccountStates

Get all account states as a Map.

```typescript
import { getAllAccountStates } from './runtime/state.js';

function getAllAccountStates(): Map<string, AccountRuntimeState>
```

**Returns:** Map of accountId to AccountRuntimeState

**Example:**

```typescript
const allStates = getAllAccountStates();
for (const [accountId, state] of allStates) {
  console.log(`${accountId}: ${state.started ? 'running' : 'stopped'}`);
}
```

### initializeRuntime

Initialize runtime for an account.

```typescript
import { initializeRuntime } from './runtime/state.js';

async function initializeRuntime(
  config: ZTMChatConfig,
  accountId: string
): Promise<boolean>
```

**Parameters:**
- `config: ZTMChatConfig` - ZTM Chat configuration
- `accountId: string` - Unique identifier for the account

**Returns:** Promise resolving to true if initialization succeeded

### stopRuntime

Stop runtime for an account.

```typescript
import { stopRuntime } from './runtime/runtime.js';

async function stopRuntime(accountId: string): Promise<void>
```

**Parameters:**
- `accountId: string` - The account identifier to stop

**Note:** The account state is NOT removed - call removeAccountState() to fully clean up.

### getAllowFromCache

Get cached allowFrom store or refresh if expired.

```typescript
import { getAllowFromCache } from './runtime/state.js';

async function getAllowFromCache(
  accountId: string,
  rt: PluginRuntime | (() => PluginRuntime)
): Promise<string[] | null>
```

### clearAllowFromCache

Clear the allowFrom cache for an account.

```typescript
import { clearAllowFromCache } from './runtime/state.js';

function clearAllowFromCache(accountId: string): void
```

### cleanupExpiredPairings

Clean up expired pending pairings from all accounts.

```typescript
import { cleanupExpiredPairings } from './runtime/state.js';

function cleanupExpiredPairings(): number
```

**Returns:** Total number of expired pairings removed

---

## Message State Store

### MessageStateStore

Interface for persistent message state operations.

```typescript
interface MessageStateStore {
  ensureLoaded(): Promise<void>;
  isLoaded(): boolean;
  getWatermark(accountId: string, key: string): number;
  getGlobalWatermark(accountId: string): number;
  setWatermark(accountId: string, key: string, time: number): void;
  setWatermarkAsync(accountId: string, key: string, time: number): Promise<void>;
  flush(): void;
  flushAsync(): Promise<void>;
  dispose(): void;
}
```

### getAccountMessageStateStore

Get a MessageStateStore for a specific account.

```typescript
import { getAccountMessageStateStore } from './runtime/store.js';

function getAccountMessageStateStore(accountId: string): MessageStateStore
```

**Parameters:**
- `accountId: string` - The account identifier

**Returns:** Isolated MessageStateStore for the account

**Example:**

```typescript
const store = getAccountMessageStateStore('default');

// Get watermark
const watermark = store.getWatermark('default', 'alice');
console.log('Last processed message time:', watermark);

// Set watermark
store.setWatermark('default', 'alice', Date.now());

// Flush to disk
store.flush();
```

### createMessageStateStore

Factory function to create MessageStateStore instances.

```typescript
import { createMessageStateStore } from './runtime/store.js';

function createMessageStateStore(
  statePath: string,
  fsImpl?: FileSystem,
  loggerImpl?: Logger
): MessageStateStore
```

**Parameters:**
- `statePath: string` - Required path to the state file
- `fsImpl?: FileSystem` - Optional file system implementation for testing
- `loggerImpl?: Logger` - Optional logger implementation for testing

**Returns:** New MessageStateStore instance

### disposeMessageStateStore

Dispose all account-specific stores.

```typescript
import { disposeMessageStateStore } from './runtime/store.js';

function disposeMessageStateStore(): void
```

---

## Store Methods Detail

### getWatermark

Get the last-processed message timestamp for a key.

```typescript
store.getWatermark(accountId: string, key: string): number
```

**Parameters:**
- `accountId: string` - The account identifier
- `key: string` - The watermark key (e.g., "alice" or "group:admin/group-123")

**Returns:** The watermark timestamp, or 0 if not found

### getGlobalWatermark

Get the global watermark (max across all keys) for an account.

```typescript
store.getGlobalWatermark(accountId: string): number
```

**Parameters:**
- `accountId: string` - The account identifier

**Returns:** The maximum watermark timestamp across all keys, or 0

### setWatermark

Update the watermark for a key (only advances forward).

```typescript
store.setWatermark(accountId: string, key: string, time: number): void
```

**Parameters:**
- `accountId: string` - The account identifier
- `key: string` - The watermark key
- `time: number` - The timestamp to set

**Note:** Watermark only advances, never decreases

### setWatermarkAsync

Async version with atomic check-and-update.

```typescript
async store.setWatermarkAsync(
  accountId: string,
  key: string,
  time: number
): Promise<void>
```

**Use when:**
- Calling from async contexts where race conditions may occur
- Multiple concurrent updates need to be prevented

### flush

Flush any pending writes immediately.

```typescript
store.flush(): void
```

**Use on:** Shutdown or before critical operations

### flushAsync

Async flush for graceful shutdown.

```typescript
async store.flushAsync(): Promise<void>
```

### dispose

Dispose of resources - call on plugin unload.

```typescript
store.dispose(): void
```

---

## Related Types

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
  watchAbortController?: AbortController;
}
```

### GroupPermissions

```typescript
type GroupPermissions = {
  allowed: boolean;
  reason?: string;
};
```

### MessageStateData

```typescript
interface MessageStateData {
  // Per-account → per-peer → last processed message timestamp
  accounts: Record<string, Record<string, number>>;
}
```
