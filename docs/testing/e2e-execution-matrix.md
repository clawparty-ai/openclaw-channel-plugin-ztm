# E2E Test Execution Matrix

This document provides a detailed execution matrix for all E2E tests, including dependencies, timing, and categorization.

## Execution Matrix

| # | Test File | Category | Module | Dependencies | Est. Time | Concurrent Safe | Tags |
|---|-----------|----------|--------|--------------|-----------|-----------------|------|
| 1 | `src/e2e/message-storm.e2e.test.ts` | Stress | General | None (mock) | ~30s | No | @stress |
| 2 | `src/e2e/network-resilience.e2e.test.ts` | Resilience | General | Network isolation | ~45s | No | @regression |
| 3 | `src/e2e/stress-messaging.e2e.test.ts` | Stress | General | None (mock) | ~60s | No | @stress |
| 4 | `src/channel/channel.e2e.test.ts` | Flow | Channel | Mock runtime | ~15s | Yes | @smoke |
| 5 | `src/channel/e2e/multi-account.e2e.test.ts` | Concurrency | Channel | Clean state | ~20s | Yes | @smoke |
| 6 | `src/connectivity/e2e/network-recovery.e2e.test.ts` | Recovery | Connectivity | None | ~15s | Yes | @regression |
| 7 | `src/connectivity/e2e/pairing.e2e.test.ts` | Flow | Connectivity | Mock server | ~10s | Yes | @smoke |
| 8 | `src/messaging/e2e/group-messages.e2e.test.ts` | Flow | Messaging | Mock server | ~15s | Yes | @smoke |
| 9 | `src/messaging/e2e/message-flow.e2e.test.ts` | Flow | Messaging | Mock server | ~20s | Yes | @smoke |
| 10 | `src/messaging/e2e/watch-backoff.e2e.test.ts` | Flow | Messaging | None | ~15s | Yes | @regression |

## Column Definitions

### Dependencies

| Dependency | Description |
|------------|-------------|
| `None (mock)` | Uses mocks, no external dependencies |
| `None` | No setup required |
| `Mock server` | Uses `createTestServer` from test-utils |
| `Network isolation` | Requires no other network traffic |
| `Clean state` | Requires fresh runtime state |

### Concurrent Safe

| Value | Meaning |
|-------|---------|
| **Yes** | Test can run in parallel with other tests |
| **No** | Test modifies global state, must run in isolation |

### Tags

| Tag | Purpose | When to Run |
|-----|---------|-------------|
| `@smoke` | Quick sanity checks | Every commit |
| `@regression` | Bug fix validation | Before release |
| `@stress` | Load/performance tests | Weekly or before major release |

## Test Categories

### Stress Tests

Stress tests validate system behavior under extreme load conditions.

- **Execution**: Run in isolation, sequentially
- **Environment**: Dedicated test environment recommended
- **CI**: Run nightly or before releases

```
Total estimated time: ~90 seconds
```

### Flow Tests

Flow tests validate complete user workflows across the system.

- **Execution**: Can run in parallel
- **Environment**: Standard CI environment
- **CI**: Run on every commit (smoke subset)

```
Total estimated time: ~60 seconds
```

### Resilience Tests

Resilience tests validate error handling and recovery mechanisms.

- **Execution**: Can run in parallel
- **Environment**: Standard CI environment
- **CI**: Run before releases

```
Total estimated time: ~60 seconds
```

### Concurrency Tests

Concurrency tests validate multi-account or parallel operations.

- **Execution**: Sequential (modifies global state)
- **Environment**: Standard CI environment
- **CI**: Run before releases

```
Total estimated time: ~20 seconds
```

## CI Configuration

### Running by Tag

```bash
# Run smoke tests only (fast feedback)
npm run test:e2e -- --grep "@smoke"

# Run regression tests
npm run test:e2e -- --grep "@regression"

# Run stress tests
npm run test:e2e -- --grep "@stress"
```

### GitHub Actions Example

```yaml
e2e-smoke:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: npm ci
    - run: npm run test:e2e -- --grep "@smoke"

e2e-full:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: npm ci
    - run: npm run test:e2e
```

## Maintenance Notes

- Update this matrix when adding/removing E2E tests
- Review estimated times periodically with actual CI timings
- Mark tests as `@smoke` only if they complete in <30s total

## Related Documentation

- [E2E Test Index](./e2e-index.md) - Test descriptions and locations
- [Testing Strategies](./strategies.md) - General testing patterns
- [vitest.config.e2e.ts](../../vitest.config.e2e.ts) - E2E test configuration
