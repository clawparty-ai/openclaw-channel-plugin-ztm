# API Client Interface Segregation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor DI container to use segregated interfaces (IChatReader, IChatSender, IDiscovery) instead of monolithic IApiClient.

**Architecture:**
- Add three new dependency keys for granular interfaces
- Register services separately in DI container
- Update all consumers to request only what they need
- Keep IApiClient type definition (not registered) for convenience

**Tech Stack:** TypeScript, Vitest, DI Container pattern

---

## Task 1: Add Segregated Dependency Keys

**Files:**
- Modify: `src/di/container.ts:23-39`

**Step 1: Add new symbol keys**

Add after the existing symbol definitions (around line 25):

```typescript
const _apiClientReaderKey = Symbol('ztm:api-client-reader');
const _apiClientSenderKey = Symbol('ztm:api-client-sender');
const _apiClientDiscoveryKey = Symbol('ztm:api-client-discovery');
```

**Step 2: Add new dependency exports**

Add to DEPENDENCIES export (around line 40):

```typescript
API_CLIENT_READER: createDependencyKey<IChatReader>(_apiClientReaderKey),
API_CLIENT_SENDER: createDependencyKey<IChatSender>(_apiClientSenderKey),
API_CLIENT_DISCOVERY: createDependencyKey<IDiscovery>(_apiClientDiscoveryKey),
```

**Step 3: Add type exports**

Add to container.ts exports (need to export IChatReader, IChatSender, IDiscovery types if not already exported):

```typescript
// Add these exports
export type { IChatReader, IChatSender, IDiscovery };
```

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add src/di/container.ts
git commit -m "feat(di): add segregated API client dependency keys"
```

---

## Task 2: Export New Interfaces in DI Index

**Files:**
- Modify: `src/di/index.ts:14-25`

**Step 1: Update exports**

Add IChatReader, IChatSender, IDiscovery to the export block:

```typescript
export {
  // ... existing
  type IChatReader,
  type IChatSender,
  type IDiscovery,
} from './container';
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/di/index.ts
git commit -m "feat(di): export segregated interface types"
```

---

## Task 3: Create Segregated Service Factories

**Files:**
- Modify: `src/di/index.ts:71-144`

**Step 1: Add new factory functions**

Add after createApiClientService (around line 93):

```typescript
/**
 * API client reader factory - Read operations only
 * Returns a factory function for DI container registration
 *
 * @returns Factory function that returns an IChatReader instance
 */
export function createApiReaderService(): () => IChatReader {
  return (): IChatReader => {
    const client = createZTMApiClient({
      agentUrl: '',
      permitUrl: '',
      permitSource: 'server',
      meshName: '',
      username: '',
      dmPolicy: 'pairing',
      enableGroups: false,
    });
    return client as unknown as IChatReader;
  };
}

/**
 * API client sender factory - Write operations only
 * Returns a factory function for DI container registration
 *
 * @returns Factory function that returns an IChatSender instance
 */
export function createApiSenderService(): () => IChatSender {
  return (): IChatSender => {
    const client = createZTMApiClient({
      agentUrl: '',
      permitUrl: '',
      permitSource: 'server',
      meshName: '',
      username: '',
      dmPolicy: 'pairing',
      enableGroups: false,
    });
    return client as unknown as IChatSender;
  };
}

/**
 * API client discovery factory - Discovery operations only
 * Returns a factory function for DI container registration
 *
 * @returns Factory function that returns an IDiscovery instance
 */
export function createApiDiscoveryService(): () => IDiscovery {
  return (): IDiscovery => {
    const client = createZTMApiClient({
      agentUrl: '',
      permitUrl: '',
      permitSource: 'server',
      meshName: '',
      username: '',
      dmPolicy: 'pairing',
      enableGroups: false,
    });
    return client as unknown as IDiscovery;
  };
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/di/index.ts
git commit -m "feat(di): add segregated API client service factories"
```

---

## Task 4: Update DI Registration

**Files:**
- Modify: `src/channel/plugin.ts:75-82`

**Step 1: Replace API_CLIENT registration**

Change from:
```typescript
container.register(DEPENDENCIES.API_CLIENT, createApiClientService());
```

To:
```typescript
container.register(DEPENDENCIES.API_CLIENT_READER, createApiReaderService());
container.register(DEPENDENCIES.API_CLIENT_SENDER, createApiSenderService());
container.register(DEPENDENCIES.API_CLIENT_DISCOVERY, createApiDiscoveryService());
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (but will fail in consumers)

**Step 3: Commit**

```bash
git add src/channel/plugin.ts
git commit -m "feat(di): register segregated API client services"
```

---

## Task 5: Update plugin.ts Consumer (sendPeerMessage)

**Files:**
- Modify: `src/channel/plugin.ts:225-244`

**Step 1: Change IApiClient to IChatSender**

Change:
```typescript
const apiClient = container.get<IApiClient>(DEPENDENCIES.API_CLIENT);
// ... to
const sender = container.get<IChatSender>(DEPENDENCIES.API_CLIENT_SENDER);
```

**Step 2: Update method call**

Change:
```typescript
const result = await apiClient.sendPeerMessage(id, message);
// ... to
const result = await sender.sendPeerMessage(id, message);
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/channel/plugin.ts
git commit -m "refactor(plugin): use IChatSender for message sending"
```

---

## Task 6: Update directory.ts Consumer (discoverUsers)

**Files:**
- Modify: `src/channel/directory.ts:100-122`

**Step 1: Update to use IDiscovery**

Change:
```typescript
const apiClientFactory = container.get<IApiClientFactory>(DEPENDENCIES.API_CLIENT_FACTORY);
const apiClient = apiClientFactory(config, { logger });
const usersResult = await apiClient.discoverUsers();
// ... to use DEPENDENCIES.API_CLIENT_DISCOVERY directly or create discovery client
```

Actually, directory.ts uses API_CLIENT_FACTORY which creates new clients per call. This is intentional for directory operations. Update to use IDiscovery type:

```typescript
const apiClientFactory = container.get<IApiClientFactory>(DEPENDENCIES.API_CLIENT_FACTORY);
const apiClient = apiClientFactory(config, { logger }) as IDiscovery;
const usersResult = await apiClient.discoverUsers();
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/channel/directory.ts
git commit -m "refactor(directory): use IDiscovery for user discovery"
```

---

## Task 7: Update watcher.ts Consumer

**Files:**
- Modify: `src/messaging/watcher.ts`

**Step 1: Check how apiClient is accessed**

Grep for apiClient usage in watcher.ts to understand the pattern.

**Step 2: Update to use IChatReader**

Change accesses to state.apiClient.getChats() and state.apiClient.watchChanges() to use typed IChatReader.

Note: If watcher uses RuntimeState's apiClient, this requires Task 9 first.

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/messaging/watcher.ts
git commit -m "refactor(watcher): use IChatReader for message reading"
```

---

## Task 8: Update polling.ts Consumer

**Files:**
- Modify: `src/messaging/polling.ts`

**Step 1: Update to use IChatReader**

Similar to watcher.ts, update getChats() calls.

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/messaging/polling.ts
git commit -m "refactor(polling): use IChatReader for message reading"
```

---

## Task 9: Update RuntimeState Type

**Files:**
- Modify: `src/types/runtime.ts:64-67`
- Modify: `src/runtime/state.ts`

**Step 1: Update AccountRuntimeState interface**

Change from:
```typescript
apiClient: ZTMApiClient | null;
```

To:
```typescript
chatReader: IChatReader | null;
chatSender: IChatSender | null;
discovery: IDiscovery | null;
```

**Step 2: Update AccountStateManager**

Update all references:
- createEmptyState: initialize all three to null
- initializeRuntime: set all three from the same client
- remove/stop: set all three to null

**Step 3: Import new interfaces**

Add imports to runtime.ts and state.ts:
```typescript
import type { IChatReader, IChatSender, IDiscovery } from '../di/container.js';
```

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (may have errors in consumers)

**Step 5: Commit**

```bash
git add src/types/runtime.ts src/runtime/state.ts
git commit -m "refactor(runtime): use segregated interfaces in AccountRuntimeState"
```

---

## Task 10: Run Full Test Suite

**Step 1: Run tests**

```bash
npm test
```

**Step 2: Fix any failures**

Expected: All tests pass

**Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

**Step 4: Commit**

```bash
git add .
git commit -m "test: verify interface segregation changes"
```

---

## Task 11: Update Example Usage

**Files:**
- Modify: `src/di/example-usage.ts`

**Step 1: Update example to show segregated usage**

**Step 2: Commit**

```bash
git add src/di/example-usage.ts
git commit -m "docs(di): update example usage for segregated interfaces"
```

---

## Summary

Total Tasks: 11

After completing all tasks:
- [ ] All tests pass
- [ ] TypeScript typecheck passes
- [ ] No usage of IApiClient from DI container
- [ ] Components use only the interfaces they need
