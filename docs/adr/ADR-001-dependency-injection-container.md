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

## Implementation Details

The DI container is implemented in `src/di/container.ts` with approximately 200 lines of code:

```typescript
// Symbol-based dependency keys prevent naming collisions
const _loggerKey = Symbol('ztm:lazy-loaded:logger');

// Brand types ensure compile-time type safety
type DependencyKey<T> = symbol & { __brand: T };

// Core API
class DIContainer {
  register<T>(key: DependencyKey<T>, factory: () => T): void
  get<T>(key: DependencyKey<T>): T
  reset(): void
  registerInstance<T>(key: DependencyKey<T>, instance: T): void
}
```

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| **InversifyJS** | Feature-rich, decorator support, community standard | Heavy (~50KB), complex API, overkill for our needs | Too heavy for a lightweight plugin |
| **TSyringe** | Microsoft-backed, constructor injection, decorators | Requires reflect-metadata, larger bundle | Adds build complexity and dependency |
| **Service Locator Pattern** | Simple to implement, no registration needed | Global state, not testable, hidden dependencies | Creates tight coupling and testing issues |
| **Direct instantiation** | Simple, no abstraction | Hard to test, no mocking support | Would make unit testing difficult |
| **Custom DI Container (chosen)** | Lightweight, type-safe, test-friendly | Limited feature set, custom implementation | Best balance for our use case |

### Key Trade-offs

- **Symbol-based keys** vs string keys: Prevents naming collisions but requires `Symbol()` syntax
- **Factory functions** vs constructor injection: Simpler API but no automatic dependency resolution
- **Lazy loading** vs eager loading: Better startup performance but runtime discovery of missing deps

## Related Decisions

- **ADR-006**: Context Isolation Pattern - `MessagingContext` uses DI container to get repositories
- **ADR-005**: Type Safety Patterns - Brand types (`DependencyKey<T>`) ensure compile-time safety

## Consequences

### Positive

- **Zero external dependencies**: No third-party DI libraries, reducing supply chain risk
- **Type safety**: Compile-time checking that dependencies are properly registered
- **Testability**: Easy to replace with mock implementations via `reset()` and `registerInstance()`
- **Lightweight**: ~200 lines of code vs 50KB+ for InversifyJS

### Negative

- **Limited features**: No constructor injection, property injection, or circular dependency detection
- **Learning curve**: Team needs to understand the custom container's usage patterns
- **Runtime errors**: Unregistered dependencies fail at runtime (not compile-time)
- **Manual registration**: Each dependency must be manually registered in `src/di/index.ts`

## References

- `src/di/container.ts` - DIContainer implementation
- `src/di/index.ts` - Service factory registration
- `src/messaging/context.ts` - Example usage with `createMessagingContext()`
