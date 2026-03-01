# Tool Usage Examples

This document provides practical examples of how to use and test the ZTM Chat Agent Tools.

## Overview

The ZTM Chat plugin provides three agent tools that allow AI Agents to query ZTM network status:
- `ztm_status` - Get connection status
- `ztm_mesh_info` - Get detailed mesh information
- `ztm_peers` - List online peers

## Testing Tools via CLI

### Direct Tool Invocation

You can test tools directly by importing them in your code:

```typescript
import { createZTMChatAgentTools } from './src/channel/tools.js';

// Create tools with configuration
const tools = createZTMChatAgentTools({
  cfg: {
    accounts: [{
      accountId: 'my-account',
      agentUrl: 'http://localhost:8080',
      meshName: 'my-mesh',
      username: 'my-bot',
    }]
  }
});

// Execute the status tool
const statusTool = tools.find(t => t.name === 'ztm_status');
if (statusTool) {
  const result = await statusTool.execute('test-call-id', {});
  console.log(result.content[0].text);
}
```

## Integration with OpenClaw Agent

### How It Works

When the ZTM Chat channel is configured in OpenClaw:

1. **Configuration** - The channel is registered with ZTM connection details
2. **Tool Discovery** - OpenClaw discovers tools via the `agentTools` factory
3. **Agent Invocation** - The AI Agent decides when to call a tool based on user messages
4. **Result Return** - Tool results are formatted and returned to the user

### Example Conversation Flow

```
User: "Is my ZTM agent connected?"

Agent: [Decides to check status]
  ↓
Invokes: ztm_status tool
  ↓
Query: ZTM Agent API
  ↓
Result: {
  "connected": true,
  "meshName": "my-mesh",
  "peerCount": 3
}
  ↓
Agent: "Your ZTM agent is connected!
         - Agent: http://localhost:8080
         - Mesh: my-mesh
         - Peers: 3"
```

## Programmatic Usage

### Creating Tools in Code

```typescript
import { createZTMChatAgentTools } from './src/channel/tools.js';
import type { ChannelAgentTool } from 'openclaw/plugin-sdk';

// Get all available tools
const tools = createZTMChatAgentTools({ cfg: yourConfig });

// Tool information
for (const tool of tools) {
  console.log(`Tool: ${tool.name}`);
  console.log(`  Label: ${tool.label}`);
  console.log(`  Description: ${tool.description}`);
  console.log(`  Parameters:`, tool.parameters);
}
```

### Executing Tools Programmatically

```typescript
import { ztmStatusTool, ztmMeshInfoTool, ztmPeersTool } from './src/channel/tools.js';

// Get ZTM status
const statusResult = await ztmStatusTool.execute('call-001', {});
console.log(statusResult.content[0].text);

// Get mesh info
const meshResult = await ztmMeshInfoTool.execute('call-002', {});
const meshInfo = JSON.parse(meshResult.content[0].text);
console.log(`Connected: ${meshInfo.connected}`);
console.log(`Mesh Name: ${meshInfo.meshName}`);

// Get peers
const peersResult = await ztmPeersTool.execute('call-003', {});
console.log(peersResult.content[0].text);
```

## Error Handling Examples

### Handling Unconfigured Channel

```typescript
const tools = createZTMChatAgentTools({ cfg: {} });
// Returns: []
```

### Handling API Errors

```typescript
const result = await ztmStatusTool.execute('call-id', {});

if (result.content[0].text.startsWith('Error:')) {
  // Handle error
  console.error('Failed:', result.content[0].text);
}
```

### Sample Error Responses

**Configuration Error:**
```
ZTM Chat is not configured.
```

**API Error:**
```
Error: Connection refused: ZTM Agent not reachable at http://localhost:8080
```

**Success Response:**
```
Status: Connected
Agent: http://localhost:8080
Mesh: my-mesh
Username: my-bot
```

## Unit Testing

### Mock Setup

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { container, DIContainer, DEPENDENCIES } from '../di/index.js';

const mocks = vi.hoisted(() => ({
  mockApiClient: {
    getMeshInfo: vi.fn(),
    discoverUsers: vi.fn(),
  },
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../utils/ztm-config.js', () => ({
  getZTMChatConfig: vi.fn(() => ({
    agentUrl: 'http://localhost:8080',
    meshName: 'test-mesh',
    username: 'test-user',
  })),
}));

describe('ZTM Agent Tools', () => {
  beforeEach(() => {
    DIContainer.reset();
    container.registerInstance(
      DEPENDENCIES.API_CLIENT_FACTORY,
      vi.fn(() => mocks.mockApiClient)
    );
    container.registerInstance(DEPENDENCY.LOGGER, mocks.mockLogger);
  });

  afterEach(() => {
    DIContainer.reset();
  });
});
```

### Test Cases

```typescript
describe('ztmStatusTool', () => {
  it('should return connected status', async () => {
    mocks.mockApiClient.getMeshInfo.mockResolvedValue({
      ok: true,
      value: { connected: true, meshName: 'test-mesh' },
    });

    const result = await ztmStatusTool.execute('call-id', {});

    expect(result.content[0].text).toContain('Connected');
    expect(result.content[0].text).toContain('test-mesh');
  });

  it('should return disconnected status', async () => {
    mocks.mockApiClient.getMeshInfo.mockResolvedValue({
      ok: true,
      value: { connected: false },
    });

    const result = await ztmStatusTool.execute('call-id', {});

    expect(result.content[0].text).toContain('Disconnected');
  });
});
```

## See Also

- [User Guide](../user-guide/agent-tools.md) - End-user documentation
- [Developer Guide](adding-tools.md) - Creating custom tools
- [Architecture](../architecture.md) - System architecture
