# ADR-001: Custom Symbol-based Dependency Injection Container

## Status

Accepted

## Date

2026-02-20

## Context

The project requires a lightweight dependency injection mechanism to manage:
- Infrastructure services (Logger, Config)
- API client factories (ZTM Agent API)
- Repository interfaces

Options considered:
1. **External DI library** (e.g., inversify, tsyringe) - powerful but adds dependencies
2. **Service locator pattern** - simple but lacks type safety
3. **Custom lightweight DI container** - meets needs without external dependencies

## Decision

Implement a custom `DIContainer` class with the following design:

```typescript
// Symbol-based dependency keys to prevent naming collisions
const _loggerKey = Symbol('ztm:lazy-loaded:logger');

// Lazy-loading factory registration
register<T>(key: DependencyKey<T>, factory: () => T): void

// Instance created on first get() call
get<T>(key: DependencyKey<T>): T
```

Key characteristics:
- **Symbol as dependency keys**: Leverages Symbol uniqueness to avoid naming collisions
- **Lazy loading**: Factory functions execute only on first `get()` call
- **Brand Types**: `DependencyKey<T> = symbol & { __brand: T }` ensures compile-time type safety
- **Test-friendly**: `reset()` method supports test isolation, `registerInstance()` supports mock injection
- **Interface segregation**: API clients use small interfaces (IChatReader, IChatSender, IDiscovery, IMetadata)

## Consequences

### Positive

- **Zero external dependencies**: No third-party DI libraries, reducing supply chain risk
- **Type safety**: Compile-time checking that dependencies are properly registered
- **Testability**: Easy to replace with mock implementations
- **Lightweight**: ~200 lines of code

### Negative

- **Limited features**: No constructor injection, property injection, or other advanced features
- **Learning curve**: Team needs to understand the custom container's usage
- **Runtime errors**: Unregistered dependencies fail at runtime (not compile-time)

## References

- `src/di/container.ts` - DIContainer implementation
- `src/di/index.ts` - Service factory registration
