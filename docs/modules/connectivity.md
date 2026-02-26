# Connectivity Module

The Connectivity module handles connection management and network monitoring for ZTM Chat.

## Purpose

- Monitor mesh network connectivity
- Handle connection recovery
- Manage peer connections
- Track connection status

## Key Exports

| Export | Description |
|--------|-------------|
| `ConnectionManager` | Manages network connections |
| `ConnectivityMonitor` | Monitors connection health |
| `createConnectionManager` | Factory for creating connection manager |
| `MeshNetwork` | Mesh network interface |
| `PeerConnection` | Peer connection representation |
| `ConnectionStatus` | Connection status enum |
| `startConnectivityMonitoring` | Start monitoring connectivity |
| `stopConnectivityMonitoring` | Stop monitoring |

## Features

- **Mesh Networking**: Peer-to-peer connection management
- **Health Monitoring**: Track connection status
- **Recovery Strategies**: Automatic reconnection logic
- **Connection Permits**: Rate limiting for connections

## Source Files

- `src/connectivity/mesh.ts` - Mesh network management
- `src/connectivity/permit.ts` - Connection rate limiting

## Usage Example

```typescript
import { createConnectionManager } from './connectivity/index.js';

const manager = await createConnectionManager(accountId);
const status = manager.getConnectionStatus();
```

## Related Documentation

- [ADR-018 - Connectivity Recovery Strategy](../adr/ADR-018-connectivity-recovery-strategy.md)
- [Architecture - Connectivity](../architecture.md)
