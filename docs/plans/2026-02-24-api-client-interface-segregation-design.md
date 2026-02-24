# API Client Interface Segregation Design

## Overview

Refactor the DI container to use segregated interfaces (`IChatReader`, `IChatSender`, `IDiscovery`) instead of the monolithic `IApiClient`. This follows the Interface Segregation Principle (ISP) to make dependencies explicit and improve code clarity.

## Motivation

The current design defines granular interfaces but registers only the combined `IApiClient`, violating ISP. Components that only need specific operations (e.g., discovery) have access to all operations (e.g., send messages), making dependencies unclear and harder to test.

## Goals

1. **Explicit Dependencies** - Components declare exactly what they need
2. **Improved Testability** - Easier to mock specific interfaces
3. **Code Clarity** - Clear intent about what each component does

## Design

### 1. Dependency Keys

Add three new dependency keys in `src/di/container.ts`:

```typescript
const _apiClientReaderKey = Symbol('ztm:api-client-reader');
const _apiClientSenderKey = Symbol('ztm:api-client-sender');
const _apiClientDiscoveryKey = Symbol('ztm:api-client-discovery');

export const DEPENDENCIES = {
  // ... existing
  API_CLIENT_READER: createDependencyKey<IChatReader>(_apiClientReaderKey),
  API_CLIENT_SENDER: createDependencyKey<IChatSender>(_apiClientSenderKey),
  API_CLIENT_DISCOVERY: createDependencyKey<IDiscovery>(_apiClientDiscoveryKey),
} as const;
```

### 2. Service Registration

In `src/di/index.ts`:

- Create three factory functions: `createApiReaderService()`, `createApiSenderService()`, `createApiDiscoveryService()`
- Register them separately in the container
- Remove `IApiClient` registration

### 3. Consumer Updates

| File | Operation | Use Interface |
|------|-----------|---------------|
| `plugin.ts` | `sendPeerMessage()` | `IChatSender` |
| `directory.ts` | `discoverUsers()` | `IDiscovery` |
| `watcher.ts` | `getChats()`, `watchChanges()` | `IChatReader` |
| `polling.ts` | `getChats()` | `IChatReader` |
| `runtime/state.ts` | Store granular interfaces | `IChatReader`, `IChatSender`, `IDiscovery` |

### 4. Keep IApiClient Type

The `IApiClient` interface definition remains (not registered as service) because:
- `createZTMApiClient()` factory returns a client implementing all interfaces
- Modules that legitimately need all operations can create full clients

### 5. Testing Strategy

- Unit tests: mock each interface separately
- Integration tests: verify correct interface injection
- Type checking: ensure no component gets unintended interfaces

## Backward Compatibility

This is a **breaking change**:
- All consumers must be updated to use the new interface keys
- No deprecation path - complete replacement

## Files to Modify

1. `src/di/container.ts` - Add dependency keys
2. `src/di/index.ts` - Register segregated services, remove IApiClient registration
3. `src/channel/plugin.ts` - Use IChatSender
4. `src/channel/directory.ts` - Use IDiscovery
5. `src/messaging/watcher.ts` - Use IChatReader
6. `src/messaging/polling.ts` - Use IChatReader
7. `src/runtime/state.ts` - Store granular interfaces
8. `src/runtime/runtime.ts` - Update if needed
9. Test files - Update mocks

## Testing

- Run full test suite after migration
- Verify TypeScript typecheck passes
- No E2E test changes expected

## Date

2026-02-24
