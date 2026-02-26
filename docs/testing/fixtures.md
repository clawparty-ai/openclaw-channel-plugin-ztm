# Test Fixtures

This document describes the test fixtures available in the ZTM Chat Channel Plugin.

## Overview

Test fixtures are reusable test data provided by the `test-utils` module. They include:
- Configuration fixtures
- Message fixtures
- Chat fixtures
- User/Peer fixtures
- Factory functions for creating custom test data

## Importing Fixtures

```typescript
// Import all fixtures
import { testUtils } from '../test-utils/index.js';

// Or import specific utilities
import { testConfig, testAccountId, createMockChat } from '../test-utils/fixtures.js';
import { createMockApiClient, createMockLogger } from '../test-utils/mocks.js';
```

## Configuration Fixtures

### Default Config

```typescript
import { testConfig } from '../test-utils/fixtures.js';

const config = testConfig;
// {
//   agentUrl: 'https://example.com:7777',
//   permitUrl: 'https://example.com/permit',
//   permitSource: 'server',
//   meshName: 'test-mesh',
//   username: 'test-bot',
//   dmPolicy: 'pairing',
//   enableGroups: false
// }
```

### Config Variants

| Fixture | Description |
|---------|-------------|
| `testConfig` | Default config with pairing policy |
| `testConfigWithGroups` | Config with groups enabled |
| `testConfigPairingOnly` | Pairing-only with allowFrom list |
| `testConfigOpenDM` | Open DM policy (allow) |
| `testConfigClosedDM` | Closed DM policy (deny) |

### Creating Custom Config

```typescript
import { createConfig } from '../test-utils/fixtures.js';

const customConfig = createConfig({
  dmPolicy: 'allow',
  enableGroups: true,
  username: 'custom-bot',
});
```

## Message Fixtures

### Predefined Messages

| Fixture | Description |
|---------|-------------|
| `testMessages` | Array of 3 messages from alice |
| `testMessage` | Single test message |
| `emptyMessage` | Message with empty content |
| `unicodeMessage` | Message with Unicode content |
| `longMessage` | Message with 10,000 character content |

### Creating Custom Messages

```typescript
import { createMessage, createMessages } from '../test-utils/fixtures.js';

// Single message with overrides
const msg = createMessage({
  message: 'Custom message',
  sender: 'bob',
  time: Date.now() - 10000,
});

// Multiple messages
const msgs = createMessages(5, 'alice');
// Creates: [
//   { time: ..., message: 'Message 1', sender: 'alice' },
//   { time: ..., message: 'Message 2', sender: 'alice' },
//   ...
// ]
```

## Chat Fixtures

### Predefined Chats

```typescript
import { testChats, testGroupChats } from '../test-utils/fixtures.js';
```

- `testChats`: Array of 2 peer chats (alice, bob)
- `testGroupChats`: Array of 1 group chat

### Creating Custom Chats

```typescript
import { createChat } from '../test-utils/fixtures.js';

const chat = createChat({
  peer: 'charlie',
  time: Date.now() - 60000,
  latest: {
    time: Date.now(),
    message: 'Hello!',
    sender: 'charlie',
  },
});
```

## User and Peer Fixtures

### Users

```typescript
import { testUsers } from '../test-utils/fixtures.js';
// [{ username: 'alice' }, { username: 'bob' }, { username: 'charlie' }]

import { createUser } from '../test-utils/fixtures.js';
const user = createUser({ username: 'dave' });
```

### Peers

```typescript
import { testPeers } from '../test-utils/fixtures.js';
// [
//   { username: 'alice', endpoint: 'alice@192.168.1.10:7777' },
//   { username: 'bob', endpoint: 'bob@192.168.1.11:7777' },
//   { username: 'charlie' }
// ]

import { createPeer } from '../test-utils/fixtures.js';
const peer = createPeer({ username: 'dave', endpoint: 'dave@10.0.0.1:7777' });
```

## Account Fixtures

### Account IDs

```typescript
import { testAccountId, testAccountId2 } from '../test-utils/fixtures.js';
// testAccountId = 'test-account'
// testAccountId2 = 'test-account-2'
```

## Time Constants

Useful for testing time-based logic:

```typescript
import { NOW, ONE_MINUTE_AGO, FIVE_MINUTES_AGO, ONE_HOUR_AGO } from '../test-utils/fixtures.js';
```

## Factory Functions

### createMockState()

Creates a mock runtime state for testing:

```typescript
import { createMockState, testConfig, testAccountId } from '../test-utils/fixtures.js';
import { createMockApiClient } from '../test-utils/mocks.js';

const apiClient = createMockApiClient();
const state = createMockState(testAccountId, testConfig, apiClient);
```

Parameters:
- `accountId` (default: 'test-account')
- `config` (default: testConfig)
- `apiClient` (default: null)

### createMockChat()

Creates a mock ZTMChat object:

```typescript
import { createMockChat } from '../test-utils/fixtures.js';

// Using positional arguments
const chat1 = createMockChat('alice', 'Hello!', Date.now());

// Using options object
const chat2 = createMockChat({
  peer: 'bob',
  message: 'Hi there!',
  time: Date.now() - 60000,
});

// With custom latest message
const chat3 = createMockChat({
  peer: 'charlie',
  latest: {
    time: Date.now(),
    message: 'Custom message',
    sender: 'charlie',
  },
});
```

## Complete Example

```typescript
import { describe, it, expect } from 'vitest';
import {
  testConfig,
  testAccountId,
  testMessages,
  testChats,
  createMessage,
  createChat,
} from '../test-utils/fixtures.js';
import { createMockApiClient, createMockLogger } from '../test-utils/mocks.js';
import { success } from '../types/common.js';

describe('MyFeature', () => {
  it('should process messages from chats', () => {
    // Setup with fixtures
    const logger = createMockLogger();
    const apiClient = createMockApiClient({
      getChats: vi.fn().mockResolvedValue(success(testChats)),
      getPeerMessages: vi.fn().mockResolvedValue(success(testMessages)),
    });

    // Test with custom data
    const customMessage = createMessage({
      sender: 'custom-sender',
      message: 'Custom test',
    });

    expect(customMessage.sender).toBe('custom-sender');
    expect(testChats).toHaveLength(2);
    expect(testMessages).toHaveLength(3);
  });
});
```

## Best Practices

1. **Use fixtures as starting points** - Customize with overrides for specific test cases
2. **Use factory functions** - They provide type-safe way to create test data
3. **Use time constants** - For consistent time-based testing
4. **Prefer immutable fixtures** - Don't modify fixture values directly

## Anti-Patterns to Avoid

- ❌ Don't modify exported fixtures directly
- ❌ Don't use hardcoded values when fixtures are available
- ❌ Don't forget to use factory functions for dynamic test data
