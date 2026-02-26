# Messaging Module

The Messaging module handles the complete message processing pipeline for ZTM Chat.

## Purpose

- Long-poll ZTM API for incoming messages
- Process, validate, and deduplicate messages
- Dispatch messages to registered callbacks
- Send outbound messages

## Key Exports

| Export | Description |
|--------|-------------|
| `watchMessages` | Start long-polling for messages |
| `processMessage` | Process a single message |
| `dispatchMessage` | Dispatch message to callbacks |
| `sendOutboundMessage` | Send outbound message to ZTM |
| `startWatcher` | Start the message watcher |
| `stopWatcher` | Stop the message watcher |
| `MessageContext` | Message processing context |
| `MessageProcessor` | Message processor interface |
| `MessageDispatcher` | Message dispatcher interface |
| `ZTMChatMessage` | Message type definition |

## Message Pipeline

```
watcher.ts → processor.ts → dispatcher.ts → callbacks (AI Agent)
                      ↓
                   outbound.ts
```

## Source Files

- `src/messaging/watcher.ts` - Long-poll ZTM API
- `src/messaging/processor.ts` - Message validation/deduplication
- `src/messaging/dispatcher.ts` - Callback notification
- `src/messaging/outbound.ts` - Send replies
- `src/messaging/polling.ts` - Fallback polling mechanism
- `src/messaging/context.ts` - Dependency injection context

## Usage Example

```typescript
import { watchMessages, processMessage } from './messaging/index.js';

// Start watching messages
const stopWatch = await watchMessages(accountId, {
  onMessage: async (msg) => {
    // Process message
    await processMessage(msg, accountId);
  }
});
```

## Related Documentation

- [Architecture - Message Pipeline](../architecture.md#message-pipeline)
- [ADR-010 - Multi-layer Message Pipeline](../adr/ADR-010-multi-layer-message-pipeline.md)
