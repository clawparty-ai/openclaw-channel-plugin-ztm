# ADR-022: API Client Interface Segregation

## Status

Accepted

## Date

2026-02-26

## Context

The original `IApiClient` interface was a monolithic interface combining multiple responsibilities:

- Message sending and receiving
- Peer and group discovery
- Mesh join/leave operations
- Message reading and watermarking

This violated the Interface Segregation Principle (ISP) from SOLID, leading to:
- Difficult mocking in tests (had to implement all methods)
- Larger dependency surface for consumers
- Unclear ownership of functionality

### Current Implementation Evidence

- Split into focused interfaces: `IChatSender`, `IDiscovery`, `IMessageReader`
- `src/api/chat-sender.ts` - Message send/receive
- `src/api/discovery.ts` - Peer/group discovery
- `src/api/message-reader.ts` - Message read operations

## Decision

Split the monolithic `IApiClient` into focused interfaces:

```typescript
// chat-sender.ts - Message sending interface
export interface IChatSender {
  /**
   * Send a chat message to a peer.
   *
   * @param agentUrl - The ZTM agent endpoint URL
   * @param targetPeerId - Target peer identifier
   * @param content - Message content
   * @returns Send result with message ID
   */
  sendChat(agentUrl: string, targetPeerId: string, content: string): Promise<SendResult>;

  /**
   * Receive pending messages from inbox.
   *
   * @param agentUrl - The ZTM agent endpoint URL
   * @returns Array of received messages
   */
  receiveChat(agentUrl: string): Promise<ChatMessage[]>;
}
```

```typescript
// discovery.ts - Peer/group discovery interface
export interface IDiscovery {
  /**
   * Join a mesh network.
   *
   * @param agentUrl - The ZTM agent endpoint URL
   * @param meshName - Mesh network name
   * @param username - User identifier
   * @returns Join result
   */
  meshJoin(agentUrl: string, meshName: string, username: string): Promise<JoinResult>;

  /**
   * Leave current mesh.
   *
   * @param agentUrl - The ZTM agent endpoint URL
   * @returns Leave result
   */
  meshLeave(agentUrl: string): Promise<LeaveResult>;

  /**
   * List peers in the mesh.
   *
   * @param agentUrl - The ZTM agent endpoint URL
   * @returns Array of peer information
   */
  listPeers(agentUrl: string): Promise<PeerInfo[]>;

  /**
   * Create or get a group.
   *
   * @param agentUrl - The ZTM agent endpoint URL
   * @param groupName - Group name
   * @returns Group information
   */
  getOrCreateGroup(agentUrl: string, groupName: string): Promise<GroupInfo>;
}
```

```typescript
// message-reader.ts - Message reading interface
export interface IMessageReader {
  /**
   * Read messages with optional filters.
   *
   * @param agentUrl - The ZTM agent endpoint URL
   * @param options - Read options (limit, since, etc.)
   * @returns Message list with metadata
   */
  readMessages(agentUrl: string, options?: ReadOptions): Promise<MessageList>;

  /**
   * Get message watermark.
   *
   * @param agentUrl - The ZTM agent endpoint URL
   * @returns Current watermark timestamp
   */
  getWatermark(agentUrl: string): Promise<number>;

  /**
   * Update message watermark.
   *
   * @param agentUrl - The ZTM agent endpoint URL
   * @param watermark - New watermark timestamp
   */
  setWatermark(agentUrl: string, watermark: number): Promise<void>;
}
```

### Composite Interface (Optional)

For convenience, a composite interface can be provided:

```typescript
// index.ts - Optional composite
import type { IChatSender } from './chat-sender.js';
import type { IDiscovery } from './discovery.js';
import type { IMessageReader } from './message-reader.js';

export interface IApiClient extends IChatSender, IDiscovery, IMessageReader {
  // No additional methods - just composition
}
```

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| **Keep monolithic** | Simpler imports | Violates ISP, hard to test | Technical debt |
| **Function-based** | No interfaces needed | Less type-safe | Loses TypeScript benefits |
| **Interface segregation (chosen)** | Focused, testable | More files | Best practice |

## Key Trade-offs

- **Number of interfaces vs simplicity**: More interfaces but each is focused
- **Individual vs composite**: Consumers can use specific or combined
- **Test mocking**: Now mock only what's needed

## Related Decisions

- **ADR-020**: Configuration Schema & Validation
- **ADR-019**: Error Handling Strategy

## Consequences

### Positive

- **Smaller dependency surface**: Import only what you need
- **Easier testing**: Mock single-responsibility interfaces
- **Clearer contracts**: Each interface has one purpose
- **Better composition**: Mix and match as needed

### Negative

- **More files**: Three files instead of one
- **Import complexity**: Multiple imports for full functionality
- **Transition effort**: Existing code needs updating

## References

- `src/api/chat-sender.ts` - IChatSender interface
- `src/api/discovery.ts` - IDiscovery interface
- `src/api/message-reader.ts` - IMessageReader interface
