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
