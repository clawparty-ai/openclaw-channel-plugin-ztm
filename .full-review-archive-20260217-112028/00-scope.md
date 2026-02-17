# Review Scope

## Target

Entire codebase for ztm-chat - ZTM Chat channel plugin for OpenClaw

## Files

### Source Code (src/)
- **api/** - API modules (chat-api.ts, file-api.ts, mesh-api.ts, message-api.ts, request.ts, ztm-api.ts)
- **channel/** - Channel implementation (plugin.ts, state.ts)
- **config/** - Configuration (defaults.ts)
- **core/** - Core functionality (group-policy.ts)
- **di/** - Dependency injection (container.ts)
- **messaging/**processor.ts, polling - Message handling (.ts, etc.)
- **mocks/** - Mock implementations
- **runtime/** - Runtime (runtime.ts)
- **types/** - Type definitions (api.ts, common.ts, config.ts, errors.ts, messaging.ts, runtime.ts)
- **utils/** - Utilities (concurrency.ts, logger.ts, result.ts, retry.ts)

### Entry Points
- index.ts (root)

### CI/CD
- .github/workflows/test.yml

## Flags

- Security Focus: no
- Performance Critical: no
- Strict Mode: no
- Framework: TypeScript (pure library, OpenClaw plugin)

## Review Phases

1. Code Quality & Architecture
2. Security & Performance
3. Testing & Documentation
4. Best Practices & Standards
5. Consolidated Report
