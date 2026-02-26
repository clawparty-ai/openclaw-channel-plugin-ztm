# API Module

The API module provides ZTM Agent API clients for communicating with the ZTM network.

## Purpose

- Send and receive messages via ZTM API
- Discover peers and groups
- Manage pairing requests
- Handle authentication

## Key Exports

| Export | Description |
|--------|-------------|
| `ZTMApiClient` | Main API client interface |
| `createZTMApiClient` | Factory for creating API client |
| `sendMessage` | Send message to ZTM network |
| `receiveMessages` | Receive messages from ZTM |
| `discoverPeers` | Discover peer nodes |
| `discoverGroups` | Discover available groups |
| `createPairing` | Create pairing request |
| `acceptPairing` | Accept pairing request |
| `ApiClientConfig` | API client configuration |
| `ZTMApiResponse` | API response type |

## API Components

### ZTMApiClient
Main interface for all ZTM API operations including:
- Message sending/receiving
- Peer discovery
- Group management
- Pairing operations

### ChatAPI
Dedicated chat operations:
- Send chat messages
- Receive chat messages
- Message history

### DiscoveryAPI
Peer and group discovery:
- List peers
- List groups
- Join/leave groups

## Source Files

- `src/api/ztm-api.ts` - Main API client implementation

## Usage Example

```typescript
import { createZTMApiClient } from './api/index.js';

const client = createZTMApiClient(config);
const messages = await client.receiveMessages(accountId);
await client.sendMessage(accountId, recipientId, content);
```

## Related Documentation

- [API Reference](../api/reference.md)
- [TypeScript Types](../api/types.md)
- [Error Codes](../api/errors.md)
