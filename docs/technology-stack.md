# Technology Stack

## Technology Stack Table

| Category | Technology | Version | Justification |
|----------|-----------|---------|---------------|
| **Language** | TypeScript | 5.9.3 | Type-safe development with ES2022 target |
| **Runtime** | Node.js | 24.x (types) | Server-side JavaScript runtime |
| **Framework** | OpenClaw | 2026.3.7 | Plugin framework for AI agent channels |
| **Schema Validation** | Zod | 4.3.6 | TypeScript-first schema validation with inference |
| **Build Tool** | esbuild | ^0.27.3 | Fast bundler for production builds |
| **Test Framework** | Vitest | ^4.0.18 | Fast unit test framework with native ESM support |
| **Code Coverage** | @vitest/coverage-v8 | ^4.0.18 | Code coverage reporting for Vitest |
| **Linter** | ESLint | ^10.0.0 | Code quality and consistency |
| **TypeScript Linter** | @typescript-eslint/* | ^8.0.0 | TypeScript-specific ESLint rules |
| **Formatter** | Prettier | ^3.0.0 | Code formatting and style consistency |
| **Git Hooks** | Husky | ^9.1.7 | Git hooks automation |
| **Staged Linting** | lint-staged | ^16.2.7 | Run linters on staged files |
| **Documentation** | TypeDoc | ^0.28.17 | API documentation generation from TypeScript |
| **Changelog** | git-cliff | (config) | Conventional commits-based changelog generation |

## Architecture Pattern

### Plugin Architecture

This is a **library/plugin** project that extends the OpenClaw framework. The architecture follows:

- **Plugin Pattern**: Implements OpenClaw's channel plugin interface
- **Dependency Injection**: Custom DI container for testability (ADR-001)
- **Pipeline Pattern**: Message processing pipeline with distinct stages
- **Result Type Pattern**: Error handling without exceptions (ADR-004)

### Module Organization

The codebase is organized into distinct modules with clear boundaries:

```
src/
├── api/          # External API integration (ZTM Agent)
├── channel/      # OpenClaw plugin interface
├── messaging/    # Message pipeline (watcher → processor → dispatcher)
├── runtime/      # Runtime state management
├── core/         # Business logic (policies)
├── config/       # Configuration schema
├── types/        # TypeScript types
└── utils/        # Shared utilities
```

## Build Configuration

### TypeScript Compiler Options
- Target: ES2022
- Module: ES2022 (ES modules)
- Module Resolution: Bundler (for esbuild)
- Strict mode enabled
- Isolated modules (for esbuild compatibility)

### esbuild Configuration
- Single bundle output
- Platform: Node
- Format: ESM
- External: OpenClaw dependencies (not bundled)

## Testing Strategy

### Test Organization
- **Unit Tests**: `*.test.ts` - Test individual functions/classes
- **Integration Tests**: `*.integration.test.ts` - Test module interactions
- **E2E Tests**: `*.e2e.test.ts` - Test full workflows

### Test Configurations
- `vitest.config.ts` - Main test configuration
- `vitest.config.unit.ts` - Unit test specific
- `vitest.config.integration.ts` - Integration test specific
- `vitest.config.e2e.ts` - E2E test specific

## Development Workflow

### Available Scripts
| Script | Purpose |
|--------|---------|
| `npm run build` | Production build with esbuild |
| `npm run build:watch` | Watch mode for development |
| `npm run build:types` | Generate TypeScript declarations |
| `npm test` | Run all tests |
| `npm run test:unit` | Run unit tests only |
| `npm run test:integration` | Run integration tests only |
| `npm run test:e2e` | Run E2E tests only |
| `npm run test:coverage` | Generate coverage report |
| `npm run typecheck` | Type checking without emit |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |
| `npm run docs` | Generate TypeDoc documentation |
| `npm run changelog` | Generate changelog from commits |

## Release Engineering

### Versioning
- Semantic versioning: `2026.2.23` (calver format)
- Changelog generated from conventional commits
- Automated release preparation with husky

### Git Hooks
- Pre-commit: Run lint-staged (prettier + eslint)
- Pre-push: Run tests (via husky)
