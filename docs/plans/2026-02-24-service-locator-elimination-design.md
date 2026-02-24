# Service Locator Anti-Pattern Elimination Design

**Date:** 2026-02-24
**Status:** Approved
**Author:** Claude
**Reviewer:** User

## Problem Statement

The MessagingContext pattern (ADR-006) was introduced to eliminate direct DI container access from messaging modules. However, the implementation still uses the service locator pattern:

```typescript
// src/messaging/context.ts
export function createMessagingContext(_runtime: PluginRuntime): MessagingContext {
  const allowFromRepo = container.get(DEPENDENCIES.ALLOW_FROM_REPO);
  const messageStateRepo = container.get(DEPENDENCIES.MESSAGE_STATE_REPO);
  return { allowFromRepo, messageStateRepo };
}
```

While this consolidates container access to one location, the messaging layer still receives dependencies through a global container lookup rather than explicit injection. This creates hidden dependencies and makes unit testing more difficult.

## Architectural Violation

- **Violates:** Dependency Inversion Principle
- **Pattern:** Service Locator (anti-pattern)
- **Impact:** Messaging modules have implicit dependency on global container state

## Current Usage Analysis

| Location | container.get() calls |
|----------|----------------------|
| src/messaging/context.ts | 2 |
| src/channel/plugin.ts | 5 |
| src/channel/gateway.ts | 3 |
| src/channel/directory.ts | 2 |
| src/messaging/polling.ts | 1 |
| src/messaging/watcher.ts | 1 |
| src/di/index.ts | 3 |

## Design

### Core Principle

Move the construction responsibility of `MessagingContext` from the messaging layer to the DI container layer, achieving true dependency injection:

```
Before (Service Locator):              After (Dependency Injection):

Gateway ──┐                            Gateway ──┐
          │                                     │
          ▼                                     ▼
createMessagingContext()               container.resolve<MessagingContext>()
          │                                     │
    ┌─────┴─────┐                       ┌─────┴─────┐
    ▼           ▼                       ▼           ▼
container.get() ✗                 Constructor Injection ✓
(Hidden Dependencies)              (Explicit Dependencies)
```

### Phase 1: Eliminate container.get() in Gateway Layer

**Modified Files:**
- `src/channel/gateway.ts`

**Changes:**
- Remove direct calls to `createMessagingContext`
- Instead, obtain pre-constructed `MessagingContext` from container
- Pass it as explicit parameter to messaging functions

```typescript
// Before
const messagingContext = createMessagingContext(rt);
await startMessageWatcher(state, messagingContext, signal);

// After
const messagingContext = container.get<MessagingContext>(DEPENDENCIES.MESSAGING_CONTEXT);
await startMessageWatcher(state, messagingContext, signal);
```

### Phase 2: Refactor createMessagingContext to Accept Parameters

**Modified Files:**
- `src/messaging/context.ts`

**Changes:**
- Remove `container.get()` calls from function body
- Accept repositories as function parameters
- Remove unused `PluginRuntime` parameter

```typescript
// Before
export function createMessagingContext(_runtime: PluginRuntime): MessagingContext {
  const allowFromRepo = container.get(DEPENDENCIES.ALLOW_FROM_REPO);
  const messageStateRepo = container.get(DEPENDENCIES.MESSAGE_STATE_REPO);
  return { allowFromRepo, messageStateRepo };
}

// After
export function createMessagingContext(
  allowFromRepo: IAllowFromRepository,
  messageStateRepo: IMessageStateRepository
): MessagingContext {
  return { allowFromRepo, messageStateRepo };
}
```

### Phase 3: DI Container Registration

**Modified Files:**
- `src/di/index.ts`

**Changes:**
- Register `MessagingContext` factory in container
- Container is responsible for construction and lifecycle management
- Add new dependency key `MESSAGING_CONTEXT`

```typescript
// New dependency key
export const DEPENDENCIES = {
  // ... existing keys
  MESSAGING_CONTEXT: 'MESSAGING_CONTEXT',
};

// Register in container setup
container.registerSingleton<MessagingContext>(DEPENDENCIES.MESSAGING_CONTEXT, () => {
  const allowFromRepo = container.get<IAllowFromRepository>(DEPENDENCIES.ALLOW_FROM_REPO);
  const messageStateRepo = container.get<IMessageStateRepository>(DEPENDENCIES.MESSAGE_STATE_REPO);
  return createMessagingContext(allowFromRepo, messageStateRepo);
});
```

## Testing Strategy

### Before Refactoring

```typescript
// ❌ Requires mocking container - test depends on container implementation details
vi.mock('../di/index.js', () => ({
  container: {
    get: vi.fn().mockReturnValue(mockAllowFromRepo)
  },
  DEPENDENCIES: { ALLOW_FROM_REPO: 'ALLOW_FROM_REPO' }
}));

test('should create messaging context', () => {
  const context = createMessagingContext(mockRuntime);
});
```

### After Refactoring

```typescript
// ✅ Pass mocks directly - no container needed
test('should create messaging context', () => {
  const context = createMessagingContext(
    mockAllowFromRepo,    // Your own mock object
    mockMessageStateRepo // Your own mock object
  );
});
```

**Benefits:**
- Tests only need to know interfaces, not container internals
- Dependencies are clearly visible
- Better test isolation
- No need to understand container structure for unit testing

## Acceptance Criteria

1. ✅ `src/messaging/` directory completely eliminates `container.get()` calls
2. ✅ Unit tests can run without mocking the container
3. ✅ Dependencies are explicitly passed through function parameters
4. ✅ DI container handles `MessagingContext` construction
5. ✅ All existing functionality preserved (backward compatibility not required)

## Migration Path

1. Create new `MessagingContext` factory in `src/di/index.ts`
2. Add `MESSENCY_CONTEXT` to `DEPENDENCIES` enum
3. Modify `createMessagingContext` to accept parameters
4. Update all call sites in `src/channel/gateway.ts`
5. Run tests to verify no regressions
6. Remove old container.get() usage from messaging layer

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing tests | Update test imports and mock patterns |
| Runtime errors if container not configured | Add validation in container setup |
| Multiple call sites to update | Use IDE refactoring tools |
