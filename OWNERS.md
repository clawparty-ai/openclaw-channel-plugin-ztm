# OWNERS

> Code Ownership and Review Responsibilities for @flomesh/ztm-chat

## Overview

This document defines code ownership and review responsibilities for the ZTM Chat Channel Plugin. Code owners are responsible for reviewing pull requests, maintaining code quality, and ensuring architectural consistency.

## Team Structure

### Core Maintainer

| Owner | GitHub | Areas |
|-------|--------|-------|
| Reaver | [@reaver-flomesh](https://github.com/reaver-flomesh) | All modules, architecture, release |

### Organization Team

| Team | GitHub | Responsibility |
|------|--------|----------------|
| Core Team | @clawparty-ai/core-team | Overall project direction |

---

## Module Ownership

### Core Modules

| Module | Path | Owner | Description |
|--------|------|-------|-------------|
| Channel Layer | `src/channel/` | [@reaver-flomesh](https://github.com/reaver-flomesh) | OpenClaw plugin integration, account lifecycle, gateway pipeline |
| Messaging | `src/messaging/` | [@reaver-flomesh](https://github.com/reaver-flomesh) | Message processing, watcher, dispatcher, strategies |
| API Clients | `src/api/` | [@reaver-flomesh](https://github.com/reaver-flomesh) | ZTM Agent API, Chat API, Mesh API clients |

### Infrastructure Modules

| Module | Path | Owner | Description |
|--------|------|-------|-------------|
| Connectivity | `src/connectivity/` | [@reaver-flomesh](https://github.com/reaver-flomesh) | Mesh networking, P2P connections, recovery |
| Runtime | `src/runtime/` | [@reaver-flomesh](https://github.com/reaver-flomesh) | State management, cache, repository |
| DI Container | `src/di/` | [@reaver-flomesh](https://github.com/reaver-flomesh) | Dependency injection, service wiring |

### Business Logic Modules

| Module | Path | Owner | Description |
|--------|------|-------|-------------|
| Core Policies | `src/core/` | [@reaver-flomesh](https://github.com/reaver-flomesh) | DM policy, group policy implementation |
| Configuration | `src/config/` | [@reaver-flomesh](https://github.com/reaver-flomesh) | Schema, defaults, validation |
| Security | `src/security/` | [@reaver-flomesh](https://github.com/reaver-flomesh) | Input sanitization, injection protection |

### Supporting Modules

| Module | Path | Owner | Description |
|--------|------|-------|-------------|
| Types | `src/types/` | [@reaver-flomesh](https://github.com/reaver-flomesh) | TypeScript type definitions |
| Utilities | `src/utils/` | [@reaver-flomesh](https://github.com/reaver-flomesh) | Helper functions, guards, retry logic |
| Onboarding | `src/onboarding/` | [@reaver-flomesh](https://github.com/reaver-flomesh) | User pairing, onboarding flow |
| Test Utils | `src/test-utils/` | [@reaver-flomesh](https://github.com/reaver-flomesh) | Test fixtures, mocks, helpers |

---

## Configuration Files

| File/Pattern | Owner | Description |
|--------------|-------|-------------|
| `package.json` | [@reaver-flomesh](https://github.com/reaver-flomesh) | Dependencies, scripts, metadata |
| `.github/workflows/**` | [@reaver-flomesh](https://github.com/reaver-flomesh) | CI/CD pipeline definitions |
| `tsconfig.json`, `vitest.config.*` | [@reaver-flomesh](https://github.com/reaver-flomesh) | Build and test configuration |
| `.claude/**` | [@reaver-flomesh](https://github.com/reaver-flomesh) | Project documentation and rules |

---

## Review Responsibilities

### Code Review Requirements

1. **All PRs must be reviewed** by at least one code owner
2. **Security changes** require review from security module owner
3. **Breaking changes** require approval from core maintainer
4. **Test changes** require review from test infrastructure owner

### Review Turnaround

| Priority | Expected Response |
|----------|------------------|
| Critical (security, hotfix) | Within 4 hours |
| High (bugs, feature blockers) | Within 24 hours |
| Normal (features, refactors) | Within 48 hours |
| Low (docs, cleanup) | Within 1 week |

---

## Escalation Path

```
Feature Developer
    ↓ (Code Review)
Module Owner
    ↓ (If needed)
Core Maintainer (@reaver-flomesh)
    ↓ (Final decision)
Organization Team (@clawparty-ai/core-team)
```

---

## Becoming a Code Owner

Code ownership is granted based on:

1. **Consistent contributions** to the module
2. **Code review participation** in the area
3. **Understanding** of the module's architecture
4. **Active maintenance** and bug fixes

New owners are proposed by existing owners and approved by the core maintainer.

---

## Related Files

- **[CODEOWNERS](../.github/CODEOWNERS)** - GitHub PR auto-assignment
- **[CONTRIBUTING.md](../CONTRIBUTING.md)** - Contribution guidelines
- **[CLAUDE.md](../CLAUDE.md)** - Project rules and architecture

---

## Contact

- **Issues**: [GitHub Issues](https://github.com/clawparty-ai/openclaw-channel-plugin-ztm/issues)
- **Discussions**: [GitHub Discussions](https://github.com/clawparty-ai/openclaw-channel-plugin-ztm/discussions)
- **Organization**: [@clawparty-ai](https://github.com/clawparty-ai)
