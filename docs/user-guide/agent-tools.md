# ZTM Agent Tools User Guide

This guide explains how to use the AI Agent Tools provided by the ZTM Chat plugin.

## What Are Agent Tools?

Agent Tools are special functions that OpenClaw AI Agents can invoke. These tools allow the AI Agent to query ZTM network status without manually executing commands.

## How to Use

### Using Through Chat

1. **Configure ZTM Chat Channel** - First configure the ZTM Agent connection settings
2. **Send a Message** - Send a message to the configured ZTM Chat channel
3. **AI Agent Invokes Automatically** - The AI Agent automatically calls appropriate tools as needed
4. **View Results** - The Agent returns the tool execution results

### Example Conversations

```
User: Is ZTM connected?

Agent: [Invokes ztm_status tool]
Agent: Status: Connected
       Agent: http://localhost:8080
       Mesh: my-mesh
       Username: my-bot

---

User: Show mesh network info

Agent: [Invokes ztm_mesh_info tool]
Agent: Mesh Info:
       {
         "connected": true,
         "meshName": "my-mesh",
         "peerCount": 3
       }

---

User: What ZTM nodes are online?

Agent: [Invokes ztm_peers tool]
Agent: Peers:
       - user1
       - user2
       - user3
```

## Available Tools

| Tool | Function | Example Questions |
|------|-----------|------------------|
| `ztm_status` | Get ZTM connection status | "Is ZTM connected?" / "Check status" |
| `ztm_mesh_info` | Get detailed mesh network info | "Show mesh network info" / "How's the network" |
| `ztm_peers` | List online nodes | "What nodes are online?" / "List peers" |

## Technical Details

### Tool Definition

Each Tool includes the following properties:

- **name**: Unique identifier (e.g., `ztm_status`)
- **label**: Display name (e.g., `ZTM Status`)
- **description**: Function description, helps AI Agent understand when to use it
- **parameters**: Parameter Schema (current tools have no parameters)
- **execute**: Execution function

### Architecture

```
User Message
    ↓
OpenClaw Agent
    ↓ (auto-select)
Agent Tool (ztm_status / ztm_mesh_info / ztm_peers)
    ↓
ZTM API Client
    ↓
ZTM Agent (HTTP)
    ↓
Return result to Agent
    ↓
Agent formats and returns to user
```

## Limitations

Current implementation limitations:

1. **Signal Cancellation** - Cannot cancel in-flight requests because ZTM API client doesn't support AbortSignal
2. **Parameters** - Current tools are parameter-less, status query only
3. **Permissions** - Tools are not restricted to owner use (suitable for read-only queries)

## FAQ

### Q: What if tool returns an error?

A: Check if ZTM Agent is running and configuration is correct. Use `ztm_status` tool to check connection status.

### Q: Can I invoke tools directly via CLI?

A: Currently, tools are for AI Agent use only. Trigger tool invocations through conversation with the Agent.

### Q: How do I add new Tools?

A: See the `docs/developer/adding-tools.md` developer guide.

## Related Documentation

- [Architecture](../architecture.md) - System architecture overview
- [Developer Guide](../developer/adding-tools.md) - Adding new Tools
- [Channel Configuration](./channel-configuration.md) - ZTM Chat configuration
