# E2E Test Index

This document provides a comprehensive index of all E2E tests in the ZTM Chat Channel Plugin.

## Overview

E2E tests are located following the **mixed organization pattern (Scheme C)**:
- **General/Common scenarios**: `src/e2e/` - Cross-cutting tests that span multiple modules
- **Module-specific tests**: `src/*/e2e/` - Tests closely tied to specific modules

This approach balances **centralization** (easy to find common tests) with **module co-location** (tests near the code they validate).

## Test Categories

### 1. General E2E Tests (`src/e2e/`)

| File | Description | Preconditions | Est. Time |
|------|-------------|--------------|-----------|
| `message-storm.e2e.test.ts` | System behavior under extreme message load (500 simultaneous messages, 10000 message backlog, backpressure) | Fresh runtime state | ~30s |
| `network-resilience.e2e.test.ts` | Network failure handling, reconnection logic, message state consistency | Network isolation | ~45s |
| `stress-messaging.e2e.test.ts` | Long-running stress test with sustained high message rate | Sufficient memory | ~60s |

### 2. Channel Module E2E Tests (`src/channel/`)

| File | Description | Preconditions | Est. Time |
|------|-------------|--------------|-----------|
| `channel.e2e.test.ts` | Complete startup flow from config validation to message dispatch | Mock runtime | ~15s |
| `e2e/multi-account.e2e.test.ts` | Multiple account concurrent handling, account isolation verification | Clean account state | ~20s |

### 3. Connectivity Module E2E Tests (`src/connectivity/e2e/`)

| File | Description | Preconditions | Est. Time |
|------|-------------|--------------|-----------|
| `network-recovery.e2e.test.ts` | Connection timeout, server unavailable, retry logic, state consistency after reconnection | None | ~15s |
| `pairing.e2e.test.ts` | Pairing request flow, unpaired user blocking, approval workflow | Mock server | ~10s |

### 4. Messaging Module E2E Tests (`src/messaging/e2e/`)

| File | Description | Preconditions | Est. Time |
|------|-------------|--------------|-----------|
| `group-messages.e2e.test.ts` | Group message handling with different policies (open, allowlist, disabled) | Mock server | ~15s |
| `message-flow.e2e.test.ts` | Complete message flow: receive via Watch API, process, dispatch to callbacks, send response | Mock server | ~20s |
| `watch-backoff.e2e.test.ts` | Watch mode with Fibonacci backoff for error recovery | None | ~15s |

## Quick Reference

### Running E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run specific category
npx vitest run src/e2e/*.e2e.test.ts
npx vitest run src/channel/e2e/*.e2e.test.ts
npx vitest run src/connectivity/e2e/*.e2e.test.ts
npx vitest run src/messaging/e2e/*.e2e.test.ts
```

### Test Tags

E2E tests use custom tags for filtering:

| Tag | Meaning | Usage |
|-----|---------|-------|
| `@smoke` | Quick sanity checks | `npx vitest run --grep "@smoke"` |
| `@regression` | Bug fix validations | `npx vitest run --grep "@regression"` |
| `@stress` | Load/stress tests | `npx vitest run --grep "@stress"` |

## Dependencies

All E2E tests use shared fixtures from `src/test-utils/`:

```typescript
// Common imports
import { testConfig, testAccountId, NOW } from '../test-utils/fixtures.js';
import { createTestServer } from '../test-utils/http-server.js';
import { disposeMessageStateStore, resetDefaultProvider } from '../runtime/index.js';
```

## Best Practices

1. **Isolate state**: Always cleanup in `afterEach` using `disposeMessageStateStore()`
2. **Use descriptive names**: Test names should describe the scenario being validated
3. **Mock external dependencies**: Use `createTestServer` for HTTP mocking
4. **Set appropriate timeouts**: E2E tests may take longer (configured in `vitest.config.e2e.ts`)

## Related Documentation

- [Testing Strategies](./strategies.md) - General testing patterns
- [Test Fixtures](./fixtures.md) - Available test fixtures
- [Mocks](./mocks.md) - Mock utilities
- [E2E Execution Matrix](./e2e-execution-matrix.md) - Detailed execution metadata
