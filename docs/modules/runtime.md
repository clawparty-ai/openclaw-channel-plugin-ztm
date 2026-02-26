# Runtime Module

The Runtime module manages runtime state and persistence for the ZTM Chat plugin.

## Purpose

- Manage account runtime state
- Persist message watermarks
- Cache frequently accessed data
- Provide repository pattern for data access

## Key Exports

| Export | Description |
|--------|-------------|
| `RuntimeManager` | Manages runtime state for accounts |
| `AccountStateManager` | Manages per-account state |
| `MessageStateStore` | Stores message processing state |
| `createRuntimeManager` | Factory for creating runtime manager |
| `AccountRuntimeState` | Account runtime state type |
| `LRUCache` | LRU cache implementation |
| `Repository` | Repository interface |
| `AccountRepository` | Account persistence |
| `MessageRepository` | Message persistence |

## Features

- **Runtime State Management**: Track active accounts and their states
- **Persistence**: Store runtime data across restarts
- **Caching**: LRU cache with TTL support
- **Repository Pattern**: Abstract data access layer

## Source Files

- `src/runtime/runtime.ts` - Runtime manager
- `src/runtime/state.ts` - State management
- `src/runtime/cache.ts` - Cache utilities
- `src/runtime/store.ts` - Persistent storage
- `src/runtime/repository.ts` - Repository interfaces
- `src/runtime/repository-impl.ts` - Repository implementations

## Usage Example

```typescript
import { createRuntimeManager } from './runtime/index.js';

const runtime = createRuntimeManager();
await runtime.startAccount(accountId);
const state = runtime.getAccountState(accountId);
```

## Related Documentation

- [ADR-017 - Repository Persistence Layer](../adr/ADR-017-repository-persistence-layer.md)
- [ADR-011 - Dual Timer Persistence](../adr/ADR-011-dual-timer-persistence.md)
- [ADR-012 - LRU TTL Hybrid Caching](../adr/ADR-012-lru-ttl-hybrid-caching.md)
