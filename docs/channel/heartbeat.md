# Heartbeat Adapter

This document describes the heartbeat adapter for ZTM Chat channel.

## Overview

The heartbeat adapter provides connection health checking for the ZTM Chat plugin. It allows OpenClaw to monitor the connectivity status of the ZTM Agent and mesh network.

## Interface

```typescript
export type ChannelHeartbeatAdapter = {
  checkReady?: (params: {
    cfg: OpenClawConfig;
    accountId?: string | null;
    deps?: ChannelHeartbeatDeps;
  }) => Promise<{
    ok: boolean;
    reason: string;
  }>;

  resolveRecipients?: (params: {
    cfg: OpenClawConfig;
    opts?: {
      to?: string;
      all?: boolean;
    };
  }) => {
    recipients: string[];
    source: string;
  };
};
```

## Implementation

### checkReady

The `checkReady` function verifies that the ZTM Agent is connected to the mesh network:

1. Resolves the account configuration
2. Creates an API client using the factory
3. Calls `getMeshInfo()` to check connection status
4. Returns `{ ok: boolean, reason: string }`

**Response:**

- `{ ok: true, reason: 'Connected' }` - Agent is connected
- `{ ok: false, reason: 'ZTM Agent is not connected to the mesh network' }` - Not connected
- `{ ok: false, reason: 'Agent unreachable: ...' }` - API error

### resolveRecipients

The `resolveRecipients` function determines heartbeat notification recipients:

- If `opts.to` is provided, returns that specific recipient
- If `opts.all` is true, returns all mesh peers
- Otherwise, returns empty recipients

## Integration

The heartbeat adapter is integrated into `ztmChatPlugin`:

```typescript
export const ztmChatPlugin: ChannelPlugin<ResolvedZTMChatAccount> = {
  // ... other properties
  heartbeat: ztmChatHeartbeatAdapter,
};
```

## Testing

The heartbeat adapter includes tests in `src/channel/heartbeat.test.ts`:

- `checkReady returns ok when mesh is connected`
- `checkReady returns error when not connected`
- `checkReady returns error when agent unreachable`
- `resolveRecipients returns explicit recipient`
- `resolveRecipients returns all peers`

## See Also

- [Onboarding Flow](../onboarding-flow.md)
- [Agent Tools](./tools.md)
- [Architecture](../architecture.md)
