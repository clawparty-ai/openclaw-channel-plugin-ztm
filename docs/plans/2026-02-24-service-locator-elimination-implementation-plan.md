# Service Locator Elimination Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate service locator anti-pattern from messaging layer by refactoring createMessagingContext to accept dependencies as parameters and registering MessagingContext in DI container.

**Architecture:** Move MessagingContext construction to DI container layer. The messaging layer receives dependencies through explicit parameter injection rather than global container lookup.

**Tech Stack:** TypeScript, Custom DI Container, Vitest

---

## Task 1: Add MESSAGING_CONTEXT to DEPENDENCIES

**Files:**
- Modify: `src/di/container.ts:38`

**Step 1: Add the new dependency key**

After line 36 (`_accountStateManagerKey`), add:
```typescript
const _messagingContextKey = Symbol('ztm:messaging-context');
```

**Step 2: Add to DEPENDENCIES export**

After line 53 in DEPENDENCIES:
```typescript
export const DEPENDENCIES = {
  // ... existing keys
  ACCOUNT_STATE_MANAGER: createDependencyKey<unknown>(_accountStateManagerKey),
  MESSAGING_CONTEXT: createDependencyKey<import('../messaging/context.js').MessagingContext>(_messagingContextKey),
} as const;
```

**Step 3: Commit**

```bash
git add src/di/container.ts
git commit -m "feat: add MESSAGING_CONTEXT dependency key"
```

---

## Task 2: Modify createMessagingContext to Accept Parameters

**Files:**
- Modify: `src/messaging/context.ts:39-55`

**Step 1: Update createMessagingContext function signature**

Replace the entire function (lines 39-55):
```typescript
export function createMessagingContext(
  allowFromRepo: IAllowFromRepository,
  messageStateRepo: IMessageStateRepository
): MessagingContext {
  if (!allowFromRepo || !messageStateRepo) {
    throw new Error('Required repositories not available');
  }

  return {
    allowFromRepo,
    messageStateRepo,
  };
}
```

**Step 2: Remove unused imports**

Remove line 8 (PluginRuntime import) since it's no longer needed.

**Step 3: Commit**

```bash
git add src/messaging/context.ts
git commit -m "refactor: createMessagingContext accepts repositories as parameters"
```

---

## Task 3: Update context.test.ts for New Signature

**Files:**
- Modify: `src/messaging/context.test.ts`

**Step 1: Read the current test file to understand mock patterns**

```bash
head -60 src/messaging/context.test.ts
```

**Step 2: Rewrite imports and test setup**

Replace imports section:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMessagingContext } from './context.js';
import type { IAllowFromRepository } from '../runtime/repository.js';
import type { IMessageStateRepository } from '../runtime/repository.js';
```

**Step 3: Update all test cases to pass repositories directly**

Replace all occurrences of:
```typescript
createMessagingContext({} as any)
```
with:
```typescript
createMessagingContext(
  {} as IAllowFromRepository,
  {} as IMessageStateRepository
)
```

**Step 4: Run tests**

```bash
npm test -- src/messaging/context.test.ts
```

**Expected:** PASS

**Step 5: Commit**

```bash
git add src/messaging/context.test.ts
git commit -m "test: update context tests for new signature"
```

---

## Task 4: Register MessagingContext in DI Container

**Files:**
- Modify: `src/channel/plugin.ts:75-82`

**Step 1: Import createMessagingContext**

Add after existing imports (around line 10):
```typescript
import { createMessagingContext } from '../messaging/context.js';
```

**Step 2: Add registration after MESSAGE_STATE_REPO**

After line 81 ( MESSAGE_STATE_REPO registration), add:
```typescript
container.register(DEPENDENCIES.MESSAGING_CONTEXT, () => {
  const allowFromRepo = container.get(DEPENDENCIES.ALLOW_FROM_REPO);
  const messageStateRepo = container.get(DEPENDENCIES.MESSAGE_STATE_REPO);
  return createMessagingContext(allowFromRepo, messageStateRepo);
});
```

**Step 3: Run typecheck**

```bash
npm run typecheck
```

**Expected:** No errors

**Step 4: Commit**

```bash
git add src/channel/plugin.ts
git commit -m "feat: register MessagingContext in DI container"
```

---

## Task 5: Update Gateway to Use Container-Resolved MessagingContext

**Files:**
- Modify: `src/channel/gateway.ts:207`

**Step 1: Update the createMessagingContext call**

Replace line 207:
```typescript
// Before
const messagingContext = createMessagingContext(rt);

// After
const messagingContext = container.get(DEPENDENCIES.MESSAGING_CONTEXT);
```

**Step 2: Update imports**

Change line 27:
```typescript
// Before
import { createMessagingContext } from '../messaging/context.js';

// After
import { container, DEPENDENCIES } from '../di/index.js';
```

**Step 3: Run typecheck**

```bash
npm run typecheck
```

**Expected:** No errors

**Step 4: Commit**

```bash
git add src/channel/gateway.ts
git commit -m "refactor: gateway uses container-resolved MessagingContext"
```

---

## Task 6: Update Integration Tests

**Files:**
- Modify: `src/channel/gateway.integration.test.ts`
- Modify: `src/channel/multi-account-concurrent.integration.test.ts`

**Step 1: Update gateway.integration.test.ts**

Find line 35 and update the mock:
```typescript
// Before
createMessagingContext: vi.fn(() => ({
  allowFromRepo: {},
  messageStateRepo: {},
})),

// After - mock the container instead
container: {
  get: vi.fn((key) => {
    if (key === DEPENDENCIES.MESSAGING_CONTEXT) {
      return {
        allowFromRepo: {},
        messageStateRepo: {},
      };
    }
    // ... handle other keys
  }),
},
```

**Step 2: Update multi-account-concurrent.integration.test.ts**

Similar changes to lines 63-133.

**Step 3: Run tests**

```bash
npm test -- src/channel/gateway.integration.test.ts
npm test -- src/channel/multi-account-concurrent.integration.test.ts
```

**Step 4: Commit**

```bash
git add src/channel/gateway.integration.test.ts src/channel/multi-account-concurrent.integration.test.ts
git commit -m "test: update integration tests for container resolution"
```

---

## Task 7: Verify No container.get() in Messaging Layer

**Files:**
- Verify: `src/messaging/`

**Step 1: Search for remaining container.get() in messaging layer**

```bash
grep -r "container.get" src/messaging/
```

**Expected:** No matches (except in tests that mock it)

**Step 2: Run full test suite**

```bash
npm test
```

**Expected:** All tests pass

**Step 3: Commit**

```bash
git commit -m "verify: messaging layer has no container.get calls"
```

---

## Task 8: Push and Create PR

**Step 1: Push branch**

```bash
git push -u origin refactor/service-locator-elimination
```

**Step 2: Create PR**

```bash
gh pr create --title "refactor: eliminate service locator from messaging layer" --body "$(cat <<'EOF'
## Summary
- Refactor createMessagingContext to accept repositories as parameters
- Register MessagingContext in DI container
- Eliminate container.get() calls from messaging layer

## Test Plan
- [x] All tests pass
- [x] Typecheck passes
- [x] No container.get() in src/messaging/
EOF
)"
```

---

## Summary of Changes

| Task | File | Change |
|------|------|--------|
| 1 | src/di/container.ts | Add MESSAGING_CONTEXT key |
| 2 | src/messaging/context.ts | Accept params instead of container.get() |
| 3 | src/messaging/context.test.ts | Update tests for new signature |
| 4 | src/channel/plugin.ts | Register MessagingContext in container |
| 5 | src/channel/gateway.ts | Use container.get() for MessagingContext |
| 6 | src/channel/*.integration.test.ts | Update integration tests |
| 7 | - | Verify no container.get() in messaging |
| 8 | - | Push and create PR |
