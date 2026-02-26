# Channel API

The Channel API provides the OpenClaw plugin definition and gateway functions for managing ZTM Chat accounts, including account lifecycle, message sending, and status management.

## Overview

| Module | Entry File | Responsibility |
|--------|------------|----------------|
| Plugin | `src/channel/plugin.ts` | Register channel with OpenClaw |
| Gateway | `src/channel/gateway.ts` | Account lifecycle management |
| Config | `src/channel/config.ts` | Account configuration resolution |

## Table of Contents

- [Plugin Definition](#plugin-definition)
- [Gateway Functions](#gateway-functions)
- [Account Lifecycle](#account-lifecycle)

## Plugin Definition

### ztmChatPlugin

The main plugin definition implementing the `ChannelPlugin` interface.

```typescript
import { ztmChatPlugin } from './channel/plugin.js';

const plugin = ztmChatPlugin;
```

**Plugin Metadata:**

| Property | Value |
|----------|-------|
| `id` | `ztm-chat` |
| `label` | `ZTM Chat` |
| `selectionLabel` | `ZTM Chat (P2P)` |
| `blurb` | Decentralized P2P messaging via ZTM network |
| `aliases` | `['ztm', 'ztmp2p']` |

**Capabilities:**

```typescript
interface ChannelCapabilities {
  chatTypes: ['direct', 'group'];
  reactions: false;
  threads: false;
  media: false;
  nativeCommands: false;
  blockStreaming: true;
}
```

### Plugin Sections

The plugin is organized into several sections:

#### config

Account configuration resolution.

```typescript
config: {
  listAccountIds: (cfg) => string[];
  resolveAccount: (cfg, accountId) => ResolvedZTMChatAccount;
  defaultAccountId: (cfg) => string;
  isConfigured: (account) => boolean;
  describeAccount: (account) => ChannelAccountDescription;
  resolveAllowFrom: ({ cfg, accountId }) => string[];
  formatAllowFrom: ({ allowFrom }) => string[];
}
```

#### security

DM policy and warning collection.

```typescript
security: {
  resolveDmPolicy: (context) => DMPolicyConfig;
  collectWarnings: (accounts) => string[];
}
```

#### outbound

Message sending configuration.

```typescript
outbound: {
  deliveryMode: 'direct';
  sendText: async ({ to, text, accountId }) => SendResult;
}
```

#### status

Runtime status and health checks.

```typescript
status: {
  defaultRuntime: ChannelRuntimeStatus;
  collectStatusIssues: (accounts) => ChannelStatusIssue[];
  buildChannelSummary: (accounts) => ChannelSummary;
  probeAccount: ({ account, timeoutMs }) => ProbeResult;
  buildAccountSnapshot: ({ account }) => ChannelAccountSnapshot;
}
```

#### directory

User and peer discovery.

```typescript
directory: {
  self: () => DirectoryUser;
  listPeers: () => Promise<DirectoryPeer[]>;
  listGroups: () => Promise<DirectoryGroup[]>;
}
```

#### gateway

Account lifecycle management.

```typescript
gateway: {
  startAccount: async (ctx) => Promise<void>;
  logoutAccount: async ({ accountId, cfg }) => Promise<LogoutResult>;
}
```

---

## Gateway Functions

### startAccountGateway

Start the ZTM Chat account gateway.

```typescript
import { startAccountGateway } from './channel/gateway.js';

async function startAccountGateway(ctx: {
  account: { config: ZTMChatConfig; accountId: string };
  log?: {
    info: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
  };
  cfg?: Record<string, unknown>;
  setStatus?: (status: {
    accountId: string;
    running: boolean;
    lastStartAt?: number;
    lastStopAt?: number;
  }) => void;
}): Promise<() => Promise<void>>
```

**Parameters:**
- `ctx.account.config: ZTMChatConfig` - ZTM Chat configuration
- `ctx.account.accountId: string` - Unique account identifier
- `ctx.log?: Logger` - Optional logger with info/warn/error methods
- `ctx.cfg?: OpenClawConfig` - OpenClaw configuration
- `ctx.setStatus?: Function` - Status update callback

**Returns:** `Promise<() => Promise<void>>` - Cleanup function to call on shutdown

**Pipeline Steps:**

The gateway uses a Pipeline pattern with 7 sequential steps:
1. `validate_config` - Validate account configuration
2. `validate_connectivity` - Check ZTM Agent connectivity
3. `load_permit` - Load permit file
4. `join_mesh` - Join ZTM mesh network
5. `initialize_runtime` - Initialize runtime state
6. `preload_message_state` - Load persisted message state
7. `setup_callbacks` - Setup message callbacks and watcher

**Example:**

```typescript
const cleanup = await startAccountGateway({
  account: {
    config: {
      agentUrl: 'http://localhost:3000',
      username: 'bot-user',
      meshName: 'my-mesh',
      dmPolicy: 'pairing'
    },
    accountId: 'default'
  },
  log: {
    info: (msg) => console.log(msg),
    warn: (msg) => console.warn(msg),
    error: (msg) => console.error(msg)
  }
});

// Account is now running...

// When shutting down:
await cleanup();
```

### logoutAccountGateway

Logout and cleanup an account.

```typescript
import { logoutAccountGateway } from './channel/gateway.js';

async function logoutAccountGateway({
  accountId,
  cfg
}: {
  accountId: string;
  cfg?: unknown;
}): Promise<{ cleared: boolean }>
```

**Parameters:**
- `accountId: string` - The account ID to logout
- `cfg?: unknown` - OpenClaw configuration (optional)

**Returns:** `{ cleared: boolean }` - Whether the account was cleared

**Example:**

```typescript
const result = await logoutAccountGateway({
  accountId: 'default'
});

console.log('Account cleared:', result.cleared);
```

### sendTextGateway

Send a text message through the gateway.

```typescript
import { sendTextGateway } from './channel/gateway.js';

async function sendTextGateway({
  to,
  text,
  accountId
}: {
  to: string;
  text: string;
  accountId?: string;
}): Promise<{
  channel: string;
  ok: boolean;
  messageId: string;
  error?: string;
}>
```

**Parameters:**
- `to: string` - The recipient (peer username)
- `text: string` - The message text to send
- `accountId?: string` - Optional account ID (defaults to 'default')

**Returns:** Send result with channel, success status, message ID, and optional error

**Example:**

```typescript
const result = await sendTextGateway({
  to: 'alice',
  text: 'Hello from ZTM!',
  accountId: 'default'
});

if (result.ok) {
  console.log('Message sent:', result.messageId);
} else {
  console.error('Failed:', result.error);
}
```

### probeAccountGateway

Probe an account to check connectivity.

```typescript
import { probeAccountGateway } from './channel/gateway.js';

async function probeAccountGateway({
  account,
  timeoutMs
}: {
  account: { config: ZTMChatConfig };
  timeoutMs?: number;
}): Promise<{
  ok: boolean;
  error: string | null;
  meshConnected: boolean;
  meshInfo?: ZTMMeshInfo;
}>
```

**Parameters:**
- `account: { config: ZTMChatConfig }` - Account with configuration
- `timeoutMs?: number` - Timeout in milliseconds (default: 5000)

**Returns:** Probe result with connectivity status

**Example:**

```typescript
const result = await probeAccountGateway({
  account: { config: ztmConfig },
  timeoutMs: 5000
});

console.log('Mesh connected:', result.meshConnected);
if (result.meshInfo) {
  console.log('Endpoints:', result.meshInfo.endpoints);
}
```

### collectStatusIssues

Collect status issues for configured accounts.

```typescript
import { collectStatusIssues } from './channel/gateway.js';

function collectStatusIssues(accounts: ChannelAccountSnapshot[]): ChannelStatusIssue[]
```

**Parameters:**
- `accounts: ChannelAccountSnapshot[]` - Array of account snapshots

**Returns:** Array of status issues

**Example:**

```typescript
const issues = collectStatusIssues(accounts);

issues.forEach(issue => {
  console.log(`[${issue.level}] ${issue.message}`);
});
```

---

## Account Lifecycle

### Lifecycle Flow

```
┌─────────────────┐
│   Start Account │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Validate Config  │───▶ Return Error
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│Validate Network │───▶ Return Error
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Load Permit   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Join Mesh     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│Initialize Runtime│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Preload Message │
│     State       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Setup Callbacks│
│  & Start Watch │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Account Ready  │
│  (Promise Pending)│
└─────────────────┘
```

### State Management

Account runtime state is managed through the `AccountStateManager` class:

```typescript
import {
  getAccountStateManager,
  getOrCreateAccountState,
  removeAccountState,
  getAllAccountStates,
  initializeRuntime,
  stopRuntime
} from './runtime/state.js';

// Get manager
const manager = getAccountStateManager();

// Create or get account state
const state = getOrCreateAccountState('default');

// Get all account states
const allStates = getAllAccountStates();

// Initialize runtime
await initializeRuntime(config, 'default');

// Stop runtime
await stopRuntime('default');

// Remove account state
removeAccountState('default');
```

---

## Related Types

### ZTMChatConfig

```typescript
interface ZTMChatConfig {
  /** ZTM Agent URL */
  agentUrl: string;
  /** Bot username */
  username: string;
  /** Mesh name */
  meshName?: string;
  /** DM policy: "allow" | "deny" | "pairing" */
  dmPolicy?: 'allow' | 'deny' | 'pairing';
  /** Whitelist for pairing mode */
  allowFrom?: string[];
  /** Whether to enable group chats */
  enableGroups?: boolean;
  /** Auto-reply message */
  autoReply?: string;
  /** Message storage path */
  messagePath?: string;
  /** Custom polling interval (ms) */
  pollingInterval?: number;
  /** API request timeout (ms) */
  apiTimeout?: number;
}
```

### ChannelStatusIssue

```typescript
interface ChannelStatusIssue {
  channel: string;
  accountId: string;
  kind: 'config' | 'intent' | 'permissions' | 'auth' | 'runtime';
  level?: 'error' | 'warn' | 'info';
  message: string;
}
```
