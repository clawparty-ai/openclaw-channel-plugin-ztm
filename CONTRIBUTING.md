# Contributing to ZTM Chat Channel Plugin

Thank you for your interest in contributing to the ZTM Chat Channel Plugin for OpenClaw!

## Getting Started

### Prerequisites

- **Node.js** 22.x or later
- **npm** 10.x or later
- **Git**

### Development Setup

```bash
# Clone the repository
git clone https://github.com/flomesh-io/openclaw-channel-plugin-ztm.git
cd openclaw-channel-plugin-ztm

# Install dependencies
npm install

# Run tests
npm test

# Build the project
npm run build
```

## Development Workflow

### Code Style

- **TypeScript** with strict mode enabled
- **ESLint** for code linting
- **Prettier** for code formatting
- Run before committing:
  ```bash
  npm run lint
  npm run format
  ```

### Testing

We use **Vitest** for testing with a test-driven development (TDD) approach.

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

#### Writing Tests

- Tests are co-located with source files: `src/**/*.test.ts`
- Use `vi.mock()` for mocking dependencies
- Follow existing test patterns in the codebase

### Type Checking

Always run type checking before committing:

```bash
npm run typecheck
```

## Project Structure

```
src/
├── api/           # ZTM Agent API clients
├── channel/       # OpenClaw plugin entry point
├── config/        # Configuration schema & validation
├── connectivity/ # Mesh & pairing management
├── core/          # Business logic (DM/Group policies)
├── di/            # Dependency injection
├── messaging/     # Message processing pipeline
├── runtime/       # Runtime state & persistence
├── test-utils/    # Test fixtures & mocks
├── types/         # TypeScript type definitions
└── utils/         # Logger, validation, retry utilities
```

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `test`: Adding/updating tests
- `docs`: Documentation changes
- `chore`: Maintenance tasks
- `security`: Security-related changes

**Examples:**
```
feat(messaging): add message deduplication using watermarks
fix(dm-policy): properly handle pairing request expiration
refactor(api): extract retry logic into shared module
```

## Pull Request Process

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/my-feature`
3. **Write** your code following our coding standards
4. **Test** your changes: `npm test`
5. **Format** code: `npm run format`
6. **Commit** your changes following conventional commits
7. **Push** to your fork
8. **Open** a Pull Request against `main`

### PR Requirements

- All tests must pass
- TypeScript type checking must pass
- ESLint must pass with no errors
- Code coverage should not decrease significantly

## Security Considerations

- All user input must be validated
- XSS prevention: escape HTML in message content
- Path traversal: validate all file path operations
- See [SECURITY.md](SECURITY.md) for vulnerability reporting

## Code of Conduct

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) to keep our community approachable and respectable.

## Getting Help

- Open an issue for bug reports or feature requests
- Check existing issues before creating new ones
- Join community discussions (if available)

---

Last updated: 2026-02-20
