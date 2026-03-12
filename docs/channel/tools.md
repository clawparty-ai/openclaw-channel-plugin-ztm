# Agent Tools

This document describes the agent tools for ZTM Chat channel.

## Overview

The agent tools provide AI agents with the ability to query ZTM network status and peer information. These tools are exposed through the OpenClaw agent runtime.

## Available Tools

### ztm_status

Get the current connection status of the ZTM Agent.

**Name:** `ztm_status`
**Label:** ZTM Status
**Description:** Get ZTM connection status for the configured agent

**Returns:**
```
Status: Connected/Disconnected
Agent: http://localhost:8080
Mesh: my-mesh
Username: my-bot
```

### ztm_mesh_info

Get detailed mesh network information.

**Name:** `ztm_mesh_info`
**Label:** ZTM Mesh Info
**Description:** Get detailed ZTM mesh network information

**Returns:**
```
Mesh Info:
{
  "connected": true,
  "meshName": "my-mesh",
  ...
}
```

### ztm_peers

List all peers in the ZTM mesh network.

**Name:** `ztm_peers`
**Label:** ZTM Peers
**Description:** List all peers in the ZTM mesh network

**Returns:**
```
Peers:
- user1
- user2
- user3
```

### ztm_send_peer_message

Send a direct message to a peer in the ZTM mesh network.

**Name:** `ztm_send_peer_message`
**Label:** ZTM Send Peer Message
**Description:** Send a direct message to a peer in the ZTM mesh network

**Parameters:**
- `peer` (string, required): Username of the peer to send message to
- `message` (string, required): Message text to send (max 4096 characters)

**Returns:**
```
Message sent to alice
```

**Error Messages:**
- `"Error: Peer username is required."` - Empty or whitespace-only peer
- `"Error: Message content is required."` - Empty or whitespace-only message
- `"Error: Peer username must be 64 characters or less"` - Peer too long
- `"Error: Message must be 4096 characters or less"` - Message too long

## Factory Function

The tools are created via a factory function that checks if the channel is configured:

```typescript
export const createZTMChatAgentTools: ChannelAgentToolFactory = ({ cfg }) => {
  const account = resolveZTMChatAccount({ cfg });
  const config = getZTMChatConfig(account);

  if (!config) {
    return []; // No tools if not configured
  }

  return [ztmStatusTool, ztmMeshInfoTool, ztmPeersTool, ztmSendPeerMessageTool];
};
```

## Integration

The agent tools are integrated into `ztmChatPlugin`:

```typescript
export const ztmChatPlugin: ChannelPlugin<ResolvedZTMChatAccount> = {
  // ... other properties
  agentTools: createZTMChatAgentTools,
};
```

## Testing

The agent tools include tests in `src/channel/tools.test.ts`:

- Exports `createZTMChatAgentTools` function
- Exports `ztmStatusTool` with correct name
- Exports `ztmMeshInfoTool` with correct name
- Exports `ztmPeersTool` with correct name
- Exports `ztmSendPeerMessageTool` with correct name

## Usage

When the ZTM Chat channel is configured, agents can use these tools:

```
Agent: What's the ZTM status?
Tool: ztm_status
Result: Status: Connected
        Agent: http://localhost:8080
        Mesh: my-mesh
        Username: my-bot
```

## See Also

- [Heartbeat Adapter](./heartbeat.md)
- [Onboarding Flow](../onboarding-flow.md)
- [Architecture](../architecture.md)
