# Architecture Decision Records (ADR)

This directory contains Architecture Decision Records for the ZTM Chat Channel Plugin.

## What is an ADR?

An ADR is a document that captures an important architectural decision made along with its context and consequences.

## ADR Format

We follow the [Michael Nygard format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions):

1. **Title**: Brief description
2. **Status**: Proposed, Accepted, Deprecated, or Superseded
3. **Context**: The situation that prompted the decision
4. **Decision**: What we decided to do
5. **Consequences**: Positive and negative outcomes

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-001](./ADR-001-dependency-injection-container.md) | Custom Symbol-based Dependency Injection Container | Accepted |
| [ADR-002](./ADR-002-watch-polling-dual-mode.md) | Watch + Polling Dual-Mode Message Fetching | Accepted |
| [ADR-003](./ADR-003-watermark-lru-cache.md) | Watermark + LRU Cache Hybrid State Management | Accepted |
| [ADR-004](./ADR-004-result-error-handling.md) | Result Type + Categorized Errors + Exponential Backoff | Accepted |
| [ADR-005](./ADR-005-type-safety-patterns.md) | Result Type Utilities + Interface Segregation + Generics | Accepted |
| [ADR-006](./ADR-006-context-isolation-pattern.md) | Context Isolation Pattern for Messaging Layer | Accepted |
| [ADR-007](./ADR-007-dual-semaphore-concurrency.md) | Three-Level Semaphore Concurrency Control | Accepted |
| [ADR-008](./ADR-008-auth-error-non-retry-policy.md) | Authentication Error Non-Retry Policy | Accepted |
| [ADR-009](./ADR-009-request-coalescing-pattern.md) | Request Coalescing Pattern for Cache Stampede Prevention | Accepted |
| [ADR-010](./ADR-010-multi-layer-message-pipeline.md) | Five-Layer Message Processing Pipeline | Accepted |
| [ADR-011](./ADR-011-dual-timer-persistence.md) | Dual-Timer Persistence Strategy (Debounce + Max-Delay) | Accepted |
| [ADR-012](./ADR-012-lru-ttl-hybrid-caching.md) | LRU + TTL Hybrid Caching Strategy | Accepted |
| [ADR-013](./ADR-013-functional-policy-engine.md) | Functional Policy Engine Design | Accepted |
| [ADR-014](./ADR-014-multi-account-isolation-pattern.md) | Multi-Account Isolation Pattern | Accepted |
| [ADR-015](./ADR-015-onboarding-pairing-flow.md) | Onboarding & Pairing Flow | Accepted |
| [ADR-016](./ADR-016-gateway-pipeline-architecture.md) | Gateway Pipeline Architecture | Accepted |
| [ADR-017](./ADR-017-repository-persistence-layer.md) | Repository & Persistence Layer | Accepted |
| [ADR-018](./ADR-018-connectivity-recovery-strategy.md) | Connectivity Recovery Strategy | Accepted |
| [ADR-019](./ADR-019-message-ordering-sequencing.md) | Message Ordering & Sequencing | Accepted |
| [ADR-020](./ADR-020-configuration-schema-validation.md) | Configuration Schema & Validation | Accepted |

## Adding New ADRs

When making significant architectural decisions:

1. Create a new file: `docs/adr/ADR-XXX-<title>.md`
2. Use English for the document
3. Use Mermaid diagrams for architecture visualizations
4. Follow the standard ADR format
5. Update this index

## Related Documentation

- [CLAUDE.md](../../CLAUDE.md) - Project overview and architecture
- [docs/plans/](../plans/) - Implementation plans and design documents
