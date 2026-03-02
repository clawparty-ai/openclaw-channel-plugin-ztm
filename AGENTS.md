# AGENTS.md - Developer Guide for ZTM Chat Channel Plugin

## Overview

This is an OpenClaw channel plugin for ZTM (Zero Trust Mesh) Chat - a decentralized P2P messaging system. The codebase is written in TypeScript with ESM modules.

## Build, Lint, and Test Commands

### Build

```bash
npm run build          # Build the plugin
npm run build:watch    # Watch mode for development
npm run build:types   # Generate TypeScript declarations
```

### Lint & Format

```bash
npm run lint          # Run ESLint
npm run format        # Format with Prettier
npm run typecheck     # TypeScript type checking
```

### Testing

```bash
npm run test              # Run all tests
npm run test:watch        # Watch mode
npm run test:unit         # Unit tests only (vitest.config.unit.ts)
npm run test:integration  # Integration tests (vitest.config.integration.ts)
npm run test:e2e          # End-to-end tests (vitest.config.e2e.ts)
npm run test:coverage     # Coverage report
```

#### Running a Single Test

To run a single test file:

```bash
npx vitest run src/channel/gateway.test.ts
```

To run a specific test within a file:

```bash
npx vitest run src/channel/gateway.test.ts -t "test name"
```

To run tests matching a pattern:

```bash
npx vitest run --grep "gateway"
```

## Code Style Guidelines

### General

- Language: TypeScript (strict mode enabled)
- Module system: ESM (`"type": "module"` in package.json)
- Target: ES2022
- Use `typescript` for all source files

### Formatting (Prettier)

- Semi-colons: yes
- Single quotes: yes
- Tab width: 2
- Trailing commas: es5
- Print width: 100
- Arrow parens: avoid

### TypeScript Configuration

- Strict mode enabled
- `verbatimModuleSyntax` - must use `import type` for types
- `isolatedModules` - each file must be syntactically importable
- Use explicit `.js` extension in all relative imports: `import { foo } from './foo.js'`

### Imports Organization

```typescript
// 1. Built-in / Node modules
import * as fs from 'fs';

// 2. External packages (openclaw, etc.)
import type { ChannelPlugin } from 'openclaw/plugin-sdk';

// 3. Internal relative imports (grouped by directory)
import type { ZTMChatConfig } from '../types/config.js';
import { logger } from '../utils/logger.js';
import { success, failure } from '../types/common.js';
```

### Naming Conventions

- Variables/functions: camelCase
- Types/Interfaces: PascalCase
- Constants: SCREAMING_SNAKE_CASE
- File names: kebab-case.ts

### Type Definitions

- Use `type` for type aliases, unions, intersections
- Use `interface` for object shapes that may be extended
- Always use explicit return types for exported functions
- Use `import type` / `export type` for types only

### Error Handling

- Use Result pattern with `success()` / `failure()` helpers
- Custom error types inherit from base Error class
- Always check error types with `instanceof` or type guards
- Catch blocks should extract messages safely:
  ```typescript
  } catch (err) {
    logger.warn(`Failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  ```

### Testing Conventions

- Test files: `*.test.ts`, `*.integration.test.ts`, `*.e2e.test.ts`
- Use Vitest with `describe`, `it`, `expect`
- Mock dependencies using `vi.hoisted()` before imports:
  ```typescript
  const { mockFn } = vi.hoisted(() => ({
    mockFn: vi.fn(() => 'mocked'),
  }));
  ```
- Use `vi.mock()` for module mocking
- Integration tests use `describe.concurrent` for parallelization

### Documentation

- JSDoc comments for public APIs with @param and @returns
- Module-level comments at top of files describing purpose
- Example usage in JSDoc for complex functions

### Constants

- Put magic numbers in `src/constants.ts`
- Use named exports for configuration values
- Document units (e.g., `MS`, `BYTES`)

### Dependency Injection

- Use the DI container pattern from `src/di/index.js`
- Register dependencies at module load time
- Access via `container.get(DEPENDENCIES.KEY)`

## Project Structure

```
src/
├── api/           # ZTM API client implementations
├── channel/      # Channel plugin implementation
├── config/       # Configuration schemas and validation
├── constants.ts  # Magic numbers and constants
├── core/         # Core business logic (DM policy, etc.)
├── di/           # Dependency injection container
├── messaging/    # Message processing and routing
├── runtime/      # Runtime state management
├── test-utils/   # Test fixtures and mocks
├── types/        # TypeScript type definitions
└── utils/        # Utility functions
```

## Common Patterns

### Result Type for Error Handling

```typescript
import { success, failure, type Result } from '../types/common.js';

function doSomething(): Result<string, Error> {
  if (failed) return failure(new Error('reason'));
  return success('value');
}
```

### Type Guards

```typescript
function isZTMChatConfig(config: unknown): config is ZTMChatConfig {
  return typeof config === 'object' && config !== null && 'username' in config;
}
```

### Configuration Access

```typescript
import { container, DEPENDENCIES } from '../di/index.js';
const logger = container.get<ILogger>(DEPENDENCIES.LOGGER);
```
