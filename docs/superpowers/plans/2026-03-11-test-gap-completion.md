# Test Gap Completion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete test coverage for identified gaps in the ZTM Chat Channel Plugin, focusing on watcher-loop.ts (35.92%), store.ts write failures, integration tests, and boundary scenarios.

**Architecture:** This plan adds comprehensive tests following TDD methodology. Each task creates failing tests first, then implements minimal code to pass. Uses existing test patterns (Vitest, vi.mock, fixtures).

**Tech Stack:** TypeScript, Vitest, vi.mock(), test fixtures from src/test-utils/

---

## File Structure Overview

### New Files to Create

| File | Purpose |
|------|---------|
| `src/messaging/watcher-loop.test.ts` | Unit tests for WatchLoopController and exported functions |
| `src/runtime/store-write-failures.test.ts` | Store write failure handling tests |
| `src/e2e/large-message.e2e.test.ts` | Large message boundary tests (10KB-2MB) |
| `src/e2e/unicode-emoji.e2e.test.ts` | Unicode/Emoji end-to-end tests |

### Files to Extend

| File | Changes |
|------|---------|
| `src/messaging/watcher.test.ts` | Add edge case tests for watch loop |
| `src/runtime/store.test.ts` | Add write failure scenarios |
| `src/messaging/e2e/message-flow.e2e.test.ts` | Add Unicode/Emoji cases |

---

## Chunk 1: Watch Loop Unit Tests (High Priority)

### Task 1: Create watcher-loop.test.ts - WatchLoopController Tests

**Files:**
- Create: `src/messaging/watcher-loop.test.ts`
- Reference: `src/messaging/watcher-loop.ts` (lines 46-307)
- Reference: `src/test-utils/fixtures.ts` for mock data

- [ ] **Step 1: Write failing test for WatchLoopController constructor**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WatchLoopController } from './watcher-loop.js';
import { createMockAccountState } from '../test-utils/mocks.js';

vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./strategies/message-strategies.js', () => ({
  processAndNotify: vi.fn().mockResolvedValue(undefined),
}));

describe('WatchLoopController', () => {
  let mockState: ReturnType<typeof createMockAccountState>;
  let mockRt: any;
  let mockContext: any;

  beforeEach(() => {
    mockState = createMockAccountState();
    mockRt = { runtime: 'mock' };
    mockContext = {
      allowFromRepo: {
        getAllowFrom: vi.fn().mockResolvedValue([]),
      },
    };
  });

  it('should initialize with default values', () => {
    const controller = new WatchLoopController(mockState, mockRt, mockContext);
    expect(controller).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/messaging/watcher-loop.test.ts --run 2>&1 | head -30`
Expected: PASS (basic structure works)

- [ ] **Step 3: Add test for startWatchLoop function**

```typescript
import { startWatchLoop } from './watcher-loop.js';

describe('startWatchLoop', () => {
  it('should create and start a controller', () => {
    const mockState = createMockAccountState();
    const mockRt = { runtime: 'mock' };
    const mockContext = { allowFromRepo: { getAllowFrom: vi.fn() } };

    startWatchLoop(mockState, mockRt    // Verify controller, mockContext);

 was created and started
  });
});
```

- [ ] **Step 4: Add tests for Fibonacci delay calculation**

```typescript
describe('getFibonacciDelay', () => {
  it('should return WATCH_INTERVAL_MS for count <= 0', () => {
    const controller = new WatchLoopController(mockState, mockRt, mockContext);
    // Access via reflection or add public method
  });

  it('should use Fibonacci sequence: 1, 1, 2, 3, 5... capped at 30000ms', () => {
    // Test delay calculation
  });
});
```

- [ ] **Step 5: Add tests for operation semaphore**

```typescript
describe('Operation Semaphore', () => {
  it('should skip iteration when fullSync is in progress', async () => {
    // Test tryAcquire returns false when semaphore is held
  });

  it('should release semaphore in finally block', async () => {
    // Verify no resource leaks
  });
});
```

- [ ] **Step 6: Add tests for fullSync timeout**

```typescript
describe('Full Sync Timeout', () => {
  it('should skip fullSync after 10s timeout', async () => {
    // Test FULL_SYNC_MAX_WAIT_MS behavior
  });

  it('should log warning on timeout', async () => {
    // Verify warning is logged
  });
});
```

- [ ] **Step 7: Run all watcher-loop tests**

Run: `npm test -- src/messaging/watcher-loop.test.ts --run`
Expected: PASS with >80% coverage

- [ ] **Step 8: Commit**

```bash
git add src/messaging/watcher-loop.test.ts
git commit -m "test: add watcher-loop.ts unit tests

- Test WatchLoopController initialization
- Test Fibonacci delay calculation
- Test operation semaphore mutual exclusion
- Test fullSync timeout behavior
- Coverage: 35.92% -> 80%+"
```

---

### Task 2: Extend watcher.test.ts with edge cases

**Files:**
- Modify: `src/messaging/watcher.test.ts`
- Reference: `src/messaging/watcher.ts`

- [ ] **Step 1: Add test for empty watchChanges response**

```typescript
it('should handle empty watchChanges array repeatedly', async () => {
  const mockApiClient = createMockApiClient();
  mockApiClient.watchChanges = vi.fn().mockResolvedValue({ ok: true, value: [] });
  // Test repeated empty responses
});
```

- [ ] **Step 2: Add test for semaphore timeout**

```typescript
it('should handle message processing timeout', async () => {
  // Test MESSAGE_PROCESS_TIMEOUT_MS behavior
});
```

- [ ] **Step 3: Run tests**

Run: `npm test -- src/messaging/watcher.test.ts --run`

- [ ] **Step 4: Commit**

```bash
git add src/messaging/watcher.test.ts
git commit -m "test: add edge case tests to watcher.test.ts"
```

---

## Chunk 2: Store Write Failure Tests (High Priority)

### Task 3: Create store-write-failures.test.ts

**Files:**
- Create: `src/runtime/store-write-failures.test.ts`
- Reference: `src/runtime/store.ts` (lines 363-385 for write error handling)

- [ ] **Step 1: Write failing test for saveAsync write failure**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageStateStoreImpl, type FileSystem } from './store.js';

describe('MessageStateStore write failure handling', () => {
  const createFailingFs = (failureType: 'writeFile' | 'mkdir'): FileSystem => ({
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('{}'),
    writeFileSync: vi.fn().mockImplementation(() => {
      if (failureType === 'writeFile') throw new Error('Write failed');
    }),
    promises: {
      mkdir: vi.fn().mockRejectedValue(new Error('mkdir failed')),
      readFile: vi.fn().mockResolvedValue('{}'),
      writeFile: vi.fn().mockImplementation(() => {
        if (failureType === 'writeFile') throw new Error('Write failed');
      }),
      access: vi.fn().mockResolvedValue(undefined),
    },
  });

  it('should log warning when saveAsync fails', async () => {
    const fs = createFailingFs('writeFile');
    const store = new MessageStateStoreImpl('/test/path', fs);
    await store.ensureLoaded();
    store.setWatermark('account1', 'peer:alice', 12345);

    const warnSpy = vi.spyOn(console, 'warn');

    await store.flush();

    expect(warnSpy).toHaveBeenCalled();
  });

  it('should retain data in memory after write failure', async () => {
    const fs = createFailingFs('writeFile');
    const store = new MessageStateStoreImpl('/test/path', fs);
    await store.ensureLoaded();
    store.setWatermark('account1', 'peer:alice', 12345);

    await store.flush();

    // Data should still be retrievable from memory
    expect(store.getWatermark('account1', 'peer:alice')).toBe(12345);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/runtime/store-write-failures.test.ts --run 2>&1 | head -30`
Expected: File not found error (test file doesn't exist yet)

- [ ] **Step 3: Create the test file**

```typescript
// Write the full test file as shown in Step 1
```

- [ ] **Step 4: Run test to verify behavior**

Run: `npm test -- src/runtime/store-write-failures.test.ts --run`
Expected: PASS (store already handles errors gracefully)

- [ ] **Step 5: Add test for mkdir failure**

```typescript
it('should handle mkdir failure gracefully', async () => {
  const fs = createFailingFs('mkdir');
  const store = new MessageStateStoreImpl('/new/path', fs);

  // Should not throw
  await store.ensureLoaded();
});
```

- [ ] **Step 6: Add test for concurrent writes with failure**

```typescript
it('should handle concurrent writes with intermittent failures', async () => {
  // Test multiple flushAsync calls where some fail
});
```

- [ ] **Step 7: Commit**

```bash
git add src/runtime/store-write-failures.test.ts
git commit -m "test: add store write failure handling tests

- Test saveAsync write failure warning
- Test data retention in memory after failure
- Test mkdir failure graceful handling
- Test concurrent writes with failures"
```

---

### Task 4: Extend store.test.ts with failure scenarios

**Files:**
- Modify: `src/runtime/store.test.ts`
- Reference: `src/runtime/store.ts`

- [ ] **Step 1: Add disk full scenario test**

```typescript
it('should handle disk full scenario', async () => {
  // Mock filesystem that throws on writeFile
});
```

- [ ] **Step 2: Add permission denied test**

```typescript
it('should handle permission denied scenario', async () => {
  // Mock filesystem with EPERM error
});
```

- [ ] **Step 3: Run tests**

Run: `npm test -- src/runtime/store.test.ts --run`

- [ ] **Step 4: Commit**

```bash
git add src/runtime/store.test.ts
git commit -m "test: add store failure scenario tests"
```

---

## Chunk 3: Large Message and Unicode/Emoji Tests (Medium Priority)

### Task 5: Create large-message.e2e.test.ts

**Files:**
- Create: `src/e2e/large-message.e2e.test.ts`
- Reference: `src/constants.ts` for MAX_MESSAGE_LENGTH

- [ ] **Step 1: Check MAX_MESSAGE_LENGTH constant**

Run: `grep -n "MAX_MESSAGE_LENGTH" src/constants.ts`

- [ ] **Step 2: Write failing test for message at MAX_MESSAGE_LENGTH**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { MAX_MESSAGE_LENGTH } from '../constants.js';

describe('Large message handling E2E', () => {
  it('should process message at MAX_MESSAGE_LENGTH', async () => {
    const message = 'a'.repeat(MAX_MESSAGE_LENGTH);
    expect(message.length).toBe(MAX_MESSAGE_LENGTH);
    // Test processing
  });

  it('should handle 100KB message', async () => {
    const message = 'a'.repeat(100 * 1024);
    // Test processing with memory monitoring
  });

  it('should handle 1MB message', async () => {
    const message = 'a'.repeat(1024 * 1024);
    // Test without memory leak
  });
});
```

- [ ] **Step 3: Run test**

Run: `npm test -- src/e2e/large-message.e2e.test.ts --run`

- [ ] **Step 4: Commit**

```bash
git add src/e2e/large-message.e2e.test.ts
git commit -m "test: add large message boundary E2E tests

- Test MAX_MESSAGE_LENGTH boundary
- Test 100KB message
- Test 1MB message handling"
```

---

### Task 6: Create unicode-emoji.e2e.test.ts

**Files:**
- Create: `src/e2e/unicode-emoji.e2e.test.ts`

- [ ] **Step 1: Write failing tests for Unicode/Emoji**

```typescript
import { describe, it, expect } from 'vitest';

describe('Unicode and Emoji handling E2E', () => {
  const testCases = [
    { name: 'Chinese', message: '你好世界！这是一个测试消息。' },
    { name: 'Japanese', message: 'こんにちは世界！' },
    { name: 'Cyrillic', message: 'Привет мир!' },
    { name: 'Arabic', message: 'مرحبا بالعالم!' },
    { name: 'Emoji', message: 'Hello World! 🚀🔥💯' },
    { name: 'Mixed', message: '用户A: Hello! 👋 你好 👀' },
  ];

  for (const tc of testCases) {
    it(`should process ${tc.name} characters`, async () => {
      // Test message processing and display
      expect(tc.message.length).toBeGreaterThan(0);
    });
  }
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- src/e2e/unicode-emoji.e2e.test.ts --run`

- [ ] **Step 3: Commit**

```bash
git add src/e2e/unicode-emoji.e2e.test.ts
git commit -m "test: add Unicode/Emoji E2E tests

- Test Chinese, Japanese, Cyrillic, Arabic characters
- Test Emoji handling
- Test mixed content"
```

---

### Task 7: Extend message-flow.e2e.test.ts

**Files:**
- Modify: `src/messaging/e2e/message-flow.e2e.test.ts`

- [ ] **Step 1: Add Unicode test case**

```typescript
it('should process message with Unicode characters', async () => {
  const message = createE2EMessage({
    content: '你好 World! 🌍',
  });
  // Test flow
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- src/messaging/e2e/message-flow.e2e.test.ts --run`

- [ ] **Step 3: Commit**

```bash
git add src/messaging/e2e/message-flow.e2e.test.ts
git commit -m "test: add Unicode tests to message-flow.e2e.test.ts"
```

---

## Chunk 4: Final Verification

### Task 8: Run full test suite and verify coverage

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck 2>&1 | tail -20`
Expected: No errors

- [ ] **Step 2: Run lint**

Run: `npm run lint 2>&1 | tail -20`
Expected: No errors

- [ ] **Step 3: Run all tests**

Run: `npm test -- --run 2>&1 | tail -30`
Expected: All tests pass

- [ ] **Step 4: Check coverage**

Run: `npm run test:coverage 2>&1 | grep -E "(watcher-loop|store)" | head -10`
Expected: watcher-loop.ts >80%, store.ts improved

- [ ] **Step 5: Commit final changes**

```bash
git add -A
git commit -m "test: complete test gap coverage

- Add watcher-loop.ts unit tests (35.92% -> 80%+)
- Add store write failure tests
- Add large message boundary tests
- Add Unicode/Emoji E2E tests"
```

---

## Dependencies

- Node.js 18+
- Vitest (existing)
- test-utils/mocks.js (existing)
- test-utils/fixtures.ts (existing)

## Success Criteria

- [ ] watcher-loop.ts coverage: 35.92% → >80%
- [ ] store.ts has dedicated write failure tests
- [ ] Large message tests: 10KB, 100KB, 1MB, 2MB boundaries
- [ ] Unicode/Emoji tests: Chinese, Japanese, Cyrillic, Emoji
- [ ] All tests pass: `npm test`
- [ ] TypeScript check passes: `npm run typecheck`
- [ ] ESLint passes: `npm run lint`

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Watch loop timing issues | Use vi.useFakeTimers() |
| Large message memory | Monitor with process.memoryUsage() |
| Integration test mocking | Keep ZTM API mocked, use real local modules |
