# Testing Strategies

This document describes the testing strategies used in the ZTM Chat Channel Plugin, including when to use each test type and the patterns applied.

## Test Types Overview

| Type | Location | When to Use |
|------|----------|-------------|
| Unit | `*.test.ts` | Pure functions, class methods with no I/O |
| Integration | `*.integration.test.ts` | Modules interacting together |
| E2E | `*.e2e.test.ts` | Full user workflows |

## Unit Tests

### When to Use

- Testing pure business logic with no external dependencies
- Testing utility functions
- Testing class methods that can be easily mocked
- Fast feedback during development

### Patterns

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MyClass } from './my-class.js';

describe('MyClass', () => {
  let instance: MyClass;

  beforeEach(() => {
    instance = new MyClass();
  });

  it('should do something', () => {
    const result = instance.doSomething();
    expect(result).toBe('expected');
  });
});
```

### Example: Testing a Utility Function

```typescript
// src/utils/retry.test.ts
import { describe, it, expect } from 'vitest';
import { retry } from './retry.js';

describe('retry', () => {
  it('should retry failed operations', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 3) throw new Error('fail');
      return 'success';
    };

    const result = await retry(fn, { maxAttempts: 3 });
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });
});
```

## Integration Tests

### When to Use

- Testing multiple modules working together
- Testing I/O operations (file system, network)
- Testing database/repository interactions
- Verifying module contracts

### Patterns

```typescript
import { describe, it, expect } from 'vitest';
import { ModuleA } from './module-a.js';
import { ModuleB } from './module-b.js';

describe('Module Integration', () => {
  it('should integrate ModuleA with ModuleB', async () => {
    const a = new ModuleA();
    const b = new ModuleB();

    await a.connect(b);
    const result = await a.process();

    expect(result).toBeDefined();
  });
});
```

### Example: Repository Integration

```typescript
// src/runtime/repository-impl.test.ts
import { describe, it, expect } from 'vitest';
import { FileRepository } from './repository-impl.js';

describe('FileRepository', () => {
  const repository = new FileRepository('./test-data');

  it('should persist and retrieve data', async () => {
    await repository.save('key', { data: 'test' });
    const result = await repository.load('key');

    expect(result).toEqual({ data: 'test' });
  });
});
```

## E2E Tests

### When to Use

- Testing complete user workflows
- Testing across multiple accounts
- Testing network resilience scenarios
- Validating end-to-end message flows

### Patterns

```typescript
import { describe, it, expect } from 'vitest';
import { ZTMChatPlugin } from './plugin.js';

describe('E2E: Message Flow', () => {
  it('should process message from send to callback', async () => {
    const plugin = new ZTMChatPlugin(config);
    await plugin.start(accountId);

    // Simulate incoming message
    await simulateIncomingMessage(accountId, {
      message: 'Hello',
      sender: 'alice'
    });

    // Verify callback was invoked
    expect(callback).toHaveBeenCalled();
  });
});
```

### Example: Multi-Account Test

```typescript
// src/channel/e2e/multi-account.e2e.test.ts
import { describe, it, expect } from 'vitest';

describe('E2E: Multi-Account Isolation', () => {
  it('should isolate messages between accounts', async () => {
    const plugin = new ZTMChatPlugin(config);

    await plugin.start('account-1');
    await plugin.start('account-2');

    // Send message to account-1
    await sendMessage('account-1', { to: 'alice', message: 'Hi' });

    // Verify account-2 did not receive it
    const account2Messages = await getMessages('account-2');
    expect(account2Messages).toHaveLength(0);
  });
});
```

## Test File Organization

### Co-location

Test files are co-located with source files:

```
src/
├── messaging/
│   ├── processor.ts          # Source
│   ├── processor.test.ts    # Unit tests
│   ├── processor.integration.test.ts  # Integration tests
│   └── processor.e2e.test.ts # E2E tests
```

### Naming Convention

| Test Type | Suffix | Example |
|-----------|--------|---------|
| Unit | `.test.ts` | `processor.test.ts` |
| Integration | `.integration.test.ts` | `watcher.integration.test.ts` |
| E2E | `.e2e.test.ts` | `message-flow.e2e.test.ts` |

## Running Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run E2E tests only
npm run test:e2e

# Run tests with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## Coverage Requirements

- **Minimum**: 80% line coverage
- **Target**: 85%+ for core modules
- **Critical paths**: 100% coverage required

### Coverage Commands

```bash
# Generate coverage report
npm run test:coverage

# View HTML report
open coverage/index.html
```

## Best Practices

1. **Test behavior, not implementation** - Focus on public APIs
2. **Use descriptive test names** - `it('should throw when config is invalid')`
3. **Follow AAA pattern** - Arrange, Act, Assert
4. **Keep tests independent** - No shared state between tests
5. **Mock external dependencies** - Use test fixtures and mocks
6. **Test edge cases** - Empty inputs, null values, errors

## Anti-Patterns to Avoid

- ❌ Testing private methods directly
- ❌ Asserting on internal state
- ❌ Sharing state between tests
- ❌ Missing error case tests
- ❌ Over-mocking (testing nothing)
