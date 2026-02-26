# Mock Patterns

This document describes the mock patterns used in the ZTM Chat Channel Plugin tests.

## Basic Mocking with vi.mock()

### Simple Module Mock

```typescript
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));
```

### Module with Implementation

```typescript
vi.mock('../runtime/store.js', () => ({
  MessageStateStore: vi.fn().mockImplementation(() => ({
    getWatermark: vi.fn().mockReturnValue(0),
    setWatermark: vi.fn(),
    flush: vi.fn(),
    dispose: vi.fn(),
  })),
}));
```

## Hoisted Mocks with vi.hoisted()

Use `vi.hoisted()` when you need to reference mocks in other mocks or assertions:

```typescript
// Define hoisted mock functions
const { mockFn } = vi.hoisted(() => ({
  mockFn: vi.fn().mockReturnValue('mocked'),
}));

// Use in vi.mock
vi.mock('./module.js', () => ({
  exportFn: mockFn,
}));

// Can also reference in test assertions
it('should call mockFn', async () => {
  await import('./module.js');
  expect(mockFn).toHaveBeenCalled();
});
```

### Pattern: Mock with Return Value

```typescript
const { mockSendMessage } = vi.hoisted(() => ({
  mockSendMessage: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('../api/ztm-api.js', () => ({
  ZTMChatClient: vi.fn().mockImplementation(() => ({
    sendMessage: mockSendMessage,
  })),
}));
```

## Common Mocks

### Logger Mock

```typescript
import { createMockLogger } from '../test-utils/mocks.js';

const logger = createMockLogger();

// Use in implementation
it('should log info', () => {
  logger.info('test message');
  expect(logger.calls).toContainEqual({
    level: 'info',
    args: [['test message']],
  });
});
```

### API Client Mock

```typescript
import { createMockApiClient } from '../test-utils/mocks.js';
import { success } from '../types/common.js';

const apiClient = createMockApiClient({
  getChats: vi.fn().mockResolvedValue(success([
    { peer: 'alice', time: Date.now(), latest: { message: 'Hi' } }
  ])),
});
```

### Fetch Mock

```typescript
import { createMockFetch } from '../test-utils/mocks.js';

const { fetch, mockResponse } = createMockFetch({
  data: { result: 'ok' },
  status: 200,
});

// Later in test
mockResponse({ result: 'updated' }, 201);
```

## Mock Patterns by Category

### 1. Dependency Injection Mocks

```typescript
// Mock container dependencies
vi.mock('../di/container.js', () => ({
  DIContainer: vi.fn().mockImplementation(() => ({
    resolve: vi.fn().mockReturnValue(mockService),
  })),
}));
```

### 2. Runtime State Mocks

```typescript
import { createMockState } from '../test-utils/fixtures.js';

const state = createMockState('test-account', testConfig, mockApiClient);
```

### 3. Store Mocks

```typescript
import { createMockMessageStateStore } from '../test-utils/mocks.js';

const store = createMockMessageStateStore();
store.getWatermark.mockReturnValue(Date.now());
```

### 4. Config Mocks

```typescript
import { testConfig, createConfig } from '../test-utils/fixtures.js';

// Use default config
const config = testConfig;

// Or create custom
const customConfig = createConfig({
  dmPolicy: 'allow',
  enableGroups: true,
});
```

## Mock Utilities

### From test-utils/mocks.ts

| Function | Description |
|----------|-------------|
| `createMockLogger()` | Logger with call tracking |
| `createMockLoggerFns()` | Logger with vi.fn() methods |
| `createMockFetch(options)` | Mock fetch with configurable response |
| `createMockApiClient(overrides)` | Mock ZTMApiClient |
| `createMockApiClientWithMessages(messages)` | API client with preset messages |
| `createMockApiClientWithChats(chats)` | API client with preset chats |
| `createMockMessageStateStore()` | Mock watermark store |
| `createMockPairingStore()` | Mock pairing store |
| `createMockAccountState(config, apiClient)` | Mock runtime state |
| `mockSuccess(value)` | Create success Result |
| `mockFailure(error)` | Create failure Result |

### From test-utils/fixtures.ts

| Function/Value | Description |
|----------------|-------------|
| `testConfig` | Default test configuration |
| `testConfigWithGroups` | Config with groups enabled |
| `testConfigOpenDM` | Config with allow policy |
| `testAccountId` | Default test account ID |
| `testMessages` | Array of test messages |
| `testChats` | Array of test chats |
| `createMessage(overrides)` | Create single message |
| `createChat(overrides)` | Create single chat |
| `createMockChat(peer, message, time)` | Create mock ZTMChat |
| `createMockState(accountId, config, apiClient)` | Create mock runtime state |

## Best Practices

### Do

- ✅ Use `vi.hoisted()` for mocks that need to be referenced in tests
- ✅ Use test utilities from `test-utils/` for common mocks
- ✅ Clear mock calls between tests with `beforeEach`
- ✅ Use `vi.fn()` for simple function mocks
- ✅ Import actual modules with `vi.importActual()` when needed

### Don't

- ❌ Don't use `any` type for mock parameters
- ❌ Don't forget to restore mocks after tests
- ❌ Don't mock everything - sometimes use real implementations
- ❌ Don't assert on mock call order unless required

## Example: Complete Test Setup

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageProcessor } from './processor.js';
import { createMockApiClient } from '../test-utils/mocks.js';
import { testConfig, testMessages } from '../test-utils/fixtures.js';
import { success } from '../types/common.js';

// Hoisted mock
const { mockProcessCallback } = vi.hoisted(() => ({
  mockProcessCallback: vi.fn(),
}));

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

vi.mock('./callbacks.js', () => ({
  processMessage: mockProcessCallback,
}));

describe('MessageProcessor', () => {
  let processor: MessageProcessor;
  let apiClient: ReturnType<typeof createMockApiClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    apiClient = createMockApiClient({
      getPeerMessages: vi.fn().mockResolvedValue(success(testMessages)),
    });
    processor = new MessageProcessor(testConfig, apiClient);
  });

  it('should process messages', async () => {
    await processor.process();
    expect(mockProcessCallback).toHaveBeenCalledTimes(testMessages.length);
  });
});
```
