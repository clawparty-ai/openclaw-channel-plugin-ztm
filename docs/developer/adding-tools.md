# Adding New Agent Tools

This guide explains how to add custom agent tools to the ZTM Chat channel plugin.

## Overview

Agent Tools allow AI Agents to perform specific actions or query information through the OpenClaw framework. The ZTM Chat plugin provides a factory pattern for creating these tools.

## Tool Definition Structure

Each agent tool must conform to the OpenClaw `ChannelAgentTool` interface with the following properties:

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Unique identifier (e.g., `ztm_status`) |
| `label` | `string` | Human-readable display name |
| `description` | `string` | AI-understandable description of what the tool does |
| `parameters` | `TSchema` | TypeBox schema defining input parameters |
| `execute` | `Function` | Async function that performs the tool's action |

## Complete Example

Here's how to create a custom tool that sends a message to a ZTM peer:

```typescript
import { Type } from '@sinclair/typebox';
import { container, DEPENDENCIES } from '../di/index.js';
import type { IApiClientFactory, ILogger } from '../di/index.js';
import { resolveZTMChatAccount } from './config.js';
import { getZTMChatConfig } from '../utils/ztm-config.js';

/**
 * ZTM Send Message Tool - Send a message to a peer
 */
const ztmSendMessageTool = {
  name: 'ztm_send_message',
  label: 'ZTM Send Message',
  description: 'Send a direct message to a ZTM mesh peer',

  // Define parameters using TypeBox schema
  parameters: Type.Object({
    recipient: Type.String({
      description: 'Username of the message recipient',
    }),
    message: Type.String({
      description: 'Message text to send',
    }),
  }),

  async execute(
    _toolCallId: string,
    params: unknown
  ) {
    // Type-safe parameter extraction
    const { recipient, message } = params as { recipient: string; message: string };

    try {
      const apiClientFactory = container.get<IApiClientFactory>(DEPENDENCIES.API_CLIENT_FACTORY);
      const logger = container.get<ILogger>(DEPENDENDENCIES.LOGGER);

      const account = resolveZTMChatAccount({});
      const config = getZTMChatConfig(account);

      if (!config) {
        return {
          content: [{ type: 'text', text: 'ZTM Chat is not configured.' }],
          details: undefined,
        };
      }

      const apiClient = apiClientFactory(config, { logger });

      // Send the message
      const sendResult = await apiClient.sendDirectMessage(recipient, message);

      if (!sendResult.ok) {
        return {
          content: [{ type: 'text', text: `Error: ${sendResult.error?.message}` }],
          details: undefined,
        };
      }

      return {
        content: [{ type: 'text', text: `Message sent to ${recipient}` }],
        details: { success: true, recipient, messageLength: message.length },
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        details: undefined,
      };
    }
  },
};
```

## Registering the Tool

Add your tool to the factory function in `src/channel/tools.ts`:

```typescript
export const createZTMChatAgentTools: ChannelAgentToolFactory = ({ cfg }) => {
  const account = resolveZTMChatAccount({ cfg });
  const config = getZTMChatConfig(account);

  if (!config) {
    return [];
  }

  return [
    ztmStatusTool,
    ztmMeshInfoTool,
    ztmPeersTool,
    ztmSendMessageTool,  // Add your new tool here
  ] as unknown as ReturnType<ChannelAgentToolFactory>;
};
```

## Tool Execution Signature

The `execute` function receives the following parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `toolCallId` | `string` | Unique identifier for this tool invocation |
| `params` | `unknown` | Parameters passed by the AI Agent (validated against parameters schema) |

### Return Format

Tools must return an object with the following structure:

```typescript
{
  content: Array<{
    type: 'text' | 'image' | 'file';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  details?: unknown;  // Optional additional metadata
}
```

## TypeBox Schema

Use TypeBox (`@sinclair/typebox`) to define parameter schemas. This provides JSON Schema validation at runtime.

### Common Schema Types

```typescript
import { Type } from '@sinclair/typebox';

// String parameter
Type.String({ description: 'User input' })

// Number parameter
Type.Number({ description: 'Amount', minimum: 0 })

// Boolean parameter
Type.Boolean({ description: 'Enable feature' })

// Enum parameter
Type.Union([
  Type.Literal('option1'),
  Type.Literal('option2'),
], { description: 'Choice' })

// Optional parameter
Type.Optional(Type.String({ description: 'Optional field' }))

// Object parameter
Type.Object({
  name: Type.String(),
  age: Type.Number(),
})
```

## Signal Handling

Currently, the implementation supports basic signal checking at the start of execution:

```typescript
async execute(
  _toolCallId: string,
  _params: unknown,
  _signal?: AbortSignal  // Optional - check if provided
) {
  // Check if execution was cancelled
  if (_signal?.aborted) {
    return {
      content: [{ type: 'text', text: 'Tool execution cancelled' }],
      details: undefined,
    };
  }

  // Continue with normal execution...
}
```

**Note**: The signal cannot be propagated to the ZTM API client because `ZTMApiClientDeps` does not currently support AbortSignal.

## Best Practices

1. **Always validate configuration** - Return a helpful message if ZTM Chat is not configured
2. **Use type-safe parameter extraction** - Cast params to your expected type
3. **Handle all errors** - Return meaningful error messages to the AI Agent
4. **Use descriptive labels** - Help users understand what each tool does
5. **Write tests** - Add test cases for success and error scenarios

## Testing Your Tool

Add tests in `src/channel/tools.test.ts`:

```typescript
describe('ztmSendMessageTool', () => {
  it('should send message successfully', async () => {
    const { ztmSendMessageTool } = await import('./tools.js');

    // Mock successful API response
    mocks.mockApiClient.sendDirectMessage.mockResolvedValue({
      ok: true,
      value: { messageId: 'msg-123' },
    });

    const result = await ztmSendMessageTool.execute('call-id', {
      recipient: 'user2',
      message: 'Hello!',
    });

    expect(result.content[0].text).toContain('Message sent');
  });

  it('should handle API errors', async () => {
    // Test error handling...
  });
});
```

## See Also

- [User Guide](../user-guide/agent-tools.md) - How users interact with tools
- [Architecture](../architecture.md) - System architecture overview
- [Channel Tools Technical Reference](../channel/tools.md) - Technical implementation details
