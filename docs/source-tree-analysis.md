# Source Tree Analysis

## Complete Directory Structure

```
openclaw-channel-plugin-ztm/
├── src/                          # 🔵 Main source code (179 files)
│   ├── api/                      # 📡 ZTM Agent API clients
│   │   ├── ztm-api.ts           # API client factory
│   │   ├── chat-api.ts          # Chat operations
│   │   ├── message-api.ts       # Message operations
│   │   ├── mesh-api.ts          # Mesh network operations
│   │   └── request.ts           # HTTP request utilities
│   │
│   ├── channel/                  # 🔌 OpenClaw plugin integration
│   │   ├── plugin.ts            # Main plugin definition (ztmChatPlugin)
│   │   ├── gateway.ts           # Account lifecycle: start/stop
│   │   ├── channel.ts           # Channel implementation
│   │   ├── config.ts            # Account configuration
│   │   ├── state.ts             # Account state management
│   │   ├── connectivity-manager.ts # Mesh connectivity monitoring
│   │   └── message-dispatcher.ts # Message dispatch to callbacks
│   │
│   ├── messaging/                # 💬 Message processing pipeline (40 files)
│   │   ├── watcher.ts           # ⭐ Long-polls ZTM Agent (17KB)
│   │   ├── polling.ts           # Fallback polling when watch unavailable
│   │   ├── processor.ts         # Validates, deduplicates, normalizes
│   │   ├── chat-processor.ts    # High-level orchestration
│   │   ├── message-processor-helpers.ts # Shared utilities (10KB)
│   │   ├── dispatcher.ts        # Notifies registered callbacks
│   │   ├── outbound.ts          # Sends replies via ZTM Agent
│   │   └── context.ts           # Messaging context encapsulation
│   │
│   ├── runtime/                  # 🗄️ Runtime state & persistence
│   │   ├── runtime.ts           # RuntimeManager singleton
│   │   ├── state.ts             # Account runtime state
│   │   ├── store.ts             # Persistent state (watermarks)
│   │   ├── cache.ts             # In-memory caching
│   │   ├── pairing-store.ts     # Pairing request persistence
│   │   └── repository.ts        # Repository interfaces
│   │
│   ├── core/                     # 🎯 Business logic
│   │   ├── dm-policy.ts         # Direct message policy
│   │   └── group-policy.ts      # Group chat permissions
│   │
│   ├── connectivity/             # 🌐 Mesh & pairing management
│   │   ├── mesh.ts              # Mesh connection handling
│   │   └── permit.ts            # Permit-based operations
│   │
│   ├── config/                   # ⚙️ Configuration schema
│   │   ├── schema.ts            # TypeBox schemas
│   │   ├── defaults.ts          # Default configuration values
│   │   ├── validation.ts        # Config validation
│   │   └── resolve.ts           # Configuration resolution
│   │
│   ├── types/                    # 📝 TypeScript type definitions
│   │   ├── config.ts            # Configuration types
│   │   ├── messaging.ts         # Message types
│   │   ├── errors.ts            # Custom error types
│   │   ├── common.ts            # Result type, utilities
│   │   └── api.ts               # API client types
│   │
│   ├── utils/                    # 🔧 Shared utilities (24 files)
│   │   ├── result.ts            # Result type pattern
│   │   ├── retry.ts             # Exponential backoff
│   │   ├── concurrency.ts       # Semaphore, mutex
│   │   ├── validation.ts        # Input validation
│   │   ├── logger.ts            # Structured logging
│   │   └── guards.ts            # Type guards
│   │
│   ├── di/                       # 🧪 Dependency injection container
│   │   └── container.ts         # Custom DI implementation
│   │
│   ├── onboarding/               # 🚀 CLI setup wizard
│   │   └── onboarding.ts        # Interactive configuration
│   │
│   ├── test-utils/               # 🧪 Test fixtures & mocks
│   │   ├── fixtures.ts          # Test data fixtures
│   │   ├── mocks.ts             # Mock implementations
│   │   └── helpers.ts           # Test helper functions
│   │
│   ├── security/                 # 🔒 Security utilities
│   │   └── *.test.ts            # Security tests (injection, etc.)
│   │
│   ├── e2e/                      # 🎭 End-to-end tests
│   │   └── *.e2e.test.ts        # Full workflow tests
│   │
│   ├── mocks/                    # 🎭 Mock implementations
│   │   └── ztm-client.ts        # ZTM client mock
│   │
│   └── constants.ts              # ⏱️ Centralized constants (timing, limits)
│
├── docs/                         # 📚 Documentation
│   ├── adr/                      # Architecture Decision Records
│   ├── api/                      # API documentation
│   ├── typedoc/                  # Generated TypeDoc output
│   └── *.md                      # Various documentation files
│
├── _bmad/                        # 🔧 BMAD framework configuration
├── _bmad-output/                 # 📤 BMAD generated artifacts
├── .github/                      # 🐙 GitHub configuration
│   └── workflows/                # CI/CD workflows
│
├── index.ts                      # 🚪 Package entry point, plugin registration
├── package.json                  # 📦 Package manifest
├── tsconfig.json                 # TypeScript configuration
├── esbuild.config.js             # Build configuration
├── vitest.config.*.ts            # Test configurations (4 files)
├── eslint.config.js              # Linting configuration
├── typedoc.json                  # Documentation generation
├── cliff.toml                    # Changelog generation
├── CLAUDE.md                     # 🤖 AI guidance documentation
├── README.md                     # 📖 Project overview
├── CHANGELOG.md                  # 📝 Version history
├── CONTRIBUTING.md               # 👥 Contribution guide
├── SECURITY.md                   # 🔒 Security policies
└── LICENSE                       # ⚖️ MIT License
```

## Critical Folders Summary

| Folder | Purpose | Files | Key Entry Points |
|--------|---------|-------|------------------|
| `src/api/` | ZTM Agent integration | 16 | `ztm-api.ts` |
| `src/channel/` | OpenClaw plugin | 24 | `plugin.ts`, `gateway.ts` |
| `src/messaging/` | Message pipeline | 40 | `watcher.ts`, `processor.ts` |
| `src/runtime/` | State management | 19 | `runtime.ts`, `state.ts` |
| `src/utils/` | Shared utilities | 24 | `result.ts`, `retry.ts` |
| `src/config/` | Configuration | 11 | `schema.ts`, `defaults.ts` |
| `src/types/` | Type definitions | 13 | `index.ts` |
| `src/di/` | Dependency injection | 6 | `container.ts` |
| `src/core/` | Business logic | 6 | `dm-policy.ts` |

## Entry Points

| File | Purpose | Exports |
|------|---------|---------|
| `index.ts` | Package entry, plugin registration | `registerPlugin()`, `plugin` |
| `src/channel/index.ts` | Channel exports | `ztmChatPlugin`, `startAccountGateway()` |
| `src/messaging/index.ts` | Messaging exports | `processIncomingMessage()`, `startMessageWatcher()` |
| `src/runtime/index.ts` | Runtime exports | `RuntimeManager`, `getOrCreateAccountState()` |
| `src/api/index.ts` | API exports | `createZTMApiClient()` |

## Message Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        INBOUND MESSAGE FLOW                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ZTM Agent                                                      │
│      │                                                          │
│      ▼                                                          │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────┐        │
│  │  watcher.ts │───▶│chat-processor│───▶│ processor.ts│        │
│  │  (polling)  │    │    .ts      │    │             │        │
│  └─────────────┘    └──────────────┘    └──────┬──────┘        │
│       │                    │                     │              │
│       ▼                    ▼                     ▼              │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────┐       │
│  │  polling.ts │    │helpers/*.ts  │    │dispatcher.ts│       │
│  │  (fallback) │    │              │    │             │───▶ AI Agent  │
│  └─────────────┘    └──────────────┘    └─────────────┘       │
│                                               │                 │
│                                               ▼                 │
│                                         ┌─────────────┐        │
│                                         │ outbound.ts │        │
│                                         │  (replies)  │        │
│                                         └─────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

## Configuration Files

| File | Purpose |
|------|---------|
| `tsconfig.json` | TypeScript compiler (ES2022, strict mode) |
| `esbuild.config.js` | Production build bundler |
| `vitest.config.ts` | Main test configuration |
| `vitest.config.unit.ts` | Unit tests only |
| `vitest.config.integration.ts` | Integration tests |
| `vitest.config.e2e.ts` | E2E tests |
| `eslint.config.js` | Code linting |
| `typedoc.json` | API documentation generation |
| `cliff.toml` | Changelog from conventional commits |

## Documentation Structure

| Location | Type | Purpose |
|----------|------|---------|
| `docs/adr/` | ADR | Architecture decision records |
| `docs/api/` | API | API reference documentation |
| `docs/typedoc/` | Generated | Auto-generated from TypeScript |
| `CLAUDE.md` | Guide | AI assistant guidance |
| `README.md` | Overview | Project description |
