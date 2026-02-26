# Channel Module

The Channel module provides the OpenClaw plugin entry point and account lifecycle management for the ZTM Chat plugin.

## Purpose

- Register the ZTM Chat channel plugin with OpenClaw
- Manage account lifecycle (login, logout, pairing)
- Provide channel configuration resolution

## Key Exports

| Export | Description |
|--------|-------------|
| `ztmChatPlugin` | Main OpenClaw plugin entry point |
| `startAccountGateway` | Initialize account gateway for messaging |
| `logoutAccountGateway` | Clean up account gateway resources |
| `listZTMChatAccountIds` | List all registered ZTM Chat account IDs |
| `resolveZTMChatAccount` | Resolve account ID to account details |
| `getEffectiveChannelConfig` | Get effective channel configuration |
| `buildChannelConfigSchemaWithHints` | Build configuration schema with hints |
| `buildMessageCallback` | Build message callback handler |
| `buildAccountSnapshot` | Build account state snapshot |
| `disposeMessageStateStore` | Dispose message state store |

## Source Files

- `src/channel/plugin.ts` - Plugin registration
- `src/channel/gateway.ts` - Account gateway
- `src/channel/config.ts` - Account configuration
- `src/channel/state.ts` - Account state utilities

## Usage Example

```typescript
import { ztmChatPlugin, startAccountGateway } from './channel/index.js';

// Register the plugin
openclaw.register(ztmChatPlugin);

// Start gateway for account
await startAccountGateway(accountId, options);
```

## Related Documentation

- [Architecture](../architecture.md)
- [User Guide](../user-guide.md)
- [API Reference](../api/reference.md)
