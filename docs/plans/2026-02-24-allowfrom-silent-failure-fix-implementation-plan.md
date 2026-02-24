# allowFrom Silent Failure Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix polling.ts to use `getOrDefault` instead of silently skipping when `getAllowFrom()` returns null.

**Architecture:** Simple one-line change to align polling.ts behavior with watcher.ts by using empty array fallback.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Add getOrDefault import to polling.ts

**Files:**
- Modify: `src/messaging/polling.ts:1-20` (imports section)

**Step 1: Add import**

Find the imports section in polling.ts and add:
```typescript
import { getOrDefault } from '../utils/guards.js';
```

**Step 2: Verify the import**

Run: `grep -n "getOrDefault" src/messaging/polling.ts`
Expected: Import line present

**Step 3: Commit**

```bash
git add src/messaging/polling.ts
git commit -m "refactor: add getOrDefault import for allowFrom fallback"
```

---

### Task 2: Fix null check to use getOrDefault

**Files:**
- Modify: `src/messaging/polling.ts:147-151`

**Step 1: Modify the null check**

Replace lines 147-151:
```typescript
// Before:
const pollStoreAllowFrom = await context.allowFromRepo.getAllowFrom(state.accountId, rt);
// Skip processing if we couldn't read the store (security: don't bypass allowFrom checks)
if (pollStoreAllowFrom === null) {
  return;
}

// After:
const pollStoreAllowFrom = await context.allowFromRepo.getAllowFrom(state.accountId, rt);
// Use empty array fallback to align with watcher.ts behavior
const effectiveAllowFrom = getOrDefault(pollStoreAllowFrom, []);
```

**Step 2: Update the usage**

FindAllowFrom` is used later and where `pollStore change to `effectiveAllowFrom`.

In the same file around line 169:
```typescript
// Before:
await processChats(chatsToProcess, config, pollStoreAllowFrom, state.accountId, state);

// After:
await processChats(chatsToProcess, config, effectiveAllowFrom, state.accountId, state);
```

**Step 3: Verify the change**

Run: `npm run typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add src/messaging/polling.ts
git commit -m "fix: use getOrDefault fallback for allowFrom to prevent silent failure"
```

---

### Task 3: Update test to verify new behavior

**Files:**
- Modify: `src/messaging/polling.test.ts:171-180`

**Step 1: Update the test**

The existing test "should skip processing when allowFrom is null" should be updated to verify the new behavior - that it uses empty array instead of skipping.

Replace the test:
```typescript
it('should use empty array fallback when allowFrom returns null', async () => {
  (mockContext.allowFromRepo.getAllowFrom as ReturnType<typeof vi.fn>).mockResolvedValue(null);

  const chats = [{ peer: 'alice', latest: { time: 1000, message: 'hello' } }];
  (mockState.chatReader as any).getChats.mockResolvedValue({ ok: true, value: chats });

  await startPollingWatcher(mockState, mockContext);

  // Wait for first poll cycle to complete
  await new Promise(resolve => setTimeout(resolve, 2100));

  // Should still process chats with empty array fallback
  expect(mockState.chatReader?.getChats).toHaveBeenCalled();
});
```

**Step 2: Run the test**

Run: `npm test -- src/messaging/polling.test.ts -t "should use empty array fallback when allowFrom returns null"`
Expected: PASS

**Step 3: Run all polling tests**

Run: `npm test -- src/messaging/polling.test.ts`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/messaging/polling.test.ts
git commit -m "test: verify allowFrom uses empty array fallback instead of skipping"
```

---

### Task 4: Run full test suite

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 2: Run lint**

Run: `npm run lint`
Expected: No lint errors

**Step 3: Final commit if needed**

```bash
git add -A
git commit -m "chore: ensure all tests pass"
```

---

## Summary

| Task | Change |
|------|--------|
| 1 | Add `getOrDefault` import |
| 2 | Replace null check with `getOrDefault` fallback |
| 3 | Update test to verify new behavior |
| 4 | Run full test suite |
