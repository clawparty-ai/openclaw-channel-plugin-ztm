# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2026.2.18] - 2026-02-18

### Features

- Add auto changelog and GitHub Release generation
- Add npm publish workflow for third-party plugin distribution
- Add timeout to message processing to prevent indefinite blocking
- Register AccountStateManager in DI container
- Add AccountStateManager class
- Register repository services in DI container
- Add repository factory functions
- Add repository dependency keys
- Introduce repository pattern to decouple messaging from runtime
- Add TTL support to GroupPermissionLRUCache

### Bug Fixes

- Update publish workflow tag pattern to match v*.*.* format
- Extract WATCH_ERROR_THRESHOLD constant from hardcoded value
- Use incrementing counter instead of timestamp for LRU ordering
- Resolve TypeScript type errors and enable type checking
- Eliminate ESLint no-explicit-any warnings and resolve test errors
- Resolve ESLint no-unused-vars errors
- Use LRU cache for groupPermissionCache to prevent unbounded growth
- Resolve race condition in Semaphore timeout handling
- Eliminate race condition in Semaphore.release()
- Consistent error handling in sendZTMMessage (Result pattern)
- Decompose complex watchLoop function into WatchLoopController class
- Use pending flag instead of blocking in watch loop to prevent skipped iterations
- Set watchInterval to null after clearing in removeAccountState
- Add max-delay flush to prevent watermark data loss on crash
- Add log sanitization to prevent log injection (CWE-117)
- Exclude auth errors from retry logic (CWE-755)
- Validate peer parameter in URL to prevent path traversal (CWE-20)
- Clear pendingPairings Map on account removal and stop
- Prevent overlapping watch loop executions
- Add group permission cache to eliminate repeated lookups
- Add allowFrom cache to eliminate redundant async calls per poll/watch cycle
- Add TTL-based cleanup for pendingPairings Map
- Add optional timeout to Semaphore acquire to prevent infinite wait
- Add batch size limit to prevent memory spikes from large chat histories
- Add error recovery in watch loop to prevent single point of failure
- Update tar package to >=7.5.7 to resolve 4 HIGH vulnerabilities (CWE-1392)
- Add message length validation to prevent memory exhaustion (CWE-20)
- Use cryptographically secure random for messageId generation
- Add cross-platform path resolution for Windows compatibility
- Skip polling cycle when allowFrom store read fails
- Use defensive programming for config validation resolution
- Log probe errors instead of silently ignoring them in collectWarnings
- Replace unsafe type assertions with type-safe guards
- Override tar dependency to address CVE vulnerability

### Security

- Add HTML escaping to prevent XSS attacks
- Add accountId validation to prevent path traversal
- Add comprehensive input validation to API client (CWE-20)

### Refactoring

- Sync README with code implementation
- Apply Prettier formatting to source files
- Replace any types with proper interfaces in plugin.ts
- Extract magic numbers into centralized constants
- Standardize ZTM naming convention (Ztm -> ZTM)
- Extract shared chat processing logic to eliminate duplication
- Use guards utilities for null/undefined handling
- Add consistent null/undefined handling utilities
- Use lazy initialization for runtimeProvider
- Extract ConnectivityManager and MessageDispatcher from Gateway
- Simplify processIncomingMessage signature with Options Object
- Apply interface segregation principle to IApiClient
- Remove inbound.ts compatibility layer
- Remove defaultInstance, use per-account stores exclusively

### Documentation

- Distinguish npm install vs local dev installation in README
- Add comprehensive JSDoc to public API functions
- Update release version badge to use date sorting

### Testing

- Add MAX_MESSAGE_LENGTH boundary tests to processor
- Add LRU cache tests and fix eviction bugs
- Improve coverage for state, errors, and log-sanitize modules
- Improve runtime.ts coverage from 4% to 82%
- Add chat-processor.ts unit tests with 95% coverage
- Expand inbound.ts tests with re-export verification
- Add comprehensive unit tests for message-dispatcher.ts
- Add timing and iteration scenarios to watcher tests
- Add time-based edge cases and clock manipulation tests
- Add error handling tests for onboarding wizard
- Add dedicated test file for mesh-api.ts
- Add concurrent account removal tests during operations
- Add crash recovery tests for debounce window
- Add comprehensive unit tests for watcher.ts
- Add async flush tests for MessageStateStore
- Extract mock factories to shared fixtures
- Add race condition tests for concurrent account initialization
- Add authorization tests for pairing flow
- Add security tests for input validation
- Add unit tests for API and channel modules

### Chore

- Add ESLint and Prettier configuration
- Add Dependabot for automated dependency updates
- Remove review archive and analysis files
- Add .mcp.json to .gitignore
- Add .claude/ directory to .gitignore
- Add CLAUDE.md to .gitignore
- Upgrade @types/node from 20.x to 24.x

### Build

- Bump openclaw from 2026.2.9 to 2026.2.15
- Bump eslint from 9.39.2 to 10.0.0

### Performance

- Use single-pass array classification instead of multiple filter()
- Add memory management for accounts and per-account stores
- Eliminate duplicate getChats() API call
- Use lazy loading and async I/O for state store

[Unreleased]: https://github.com/flomesh-io/openclaw-channel-plugin-ztm/compare/v2026.2.18...HEAD
[2026.2.18]: https://github.com/flomesh-io/openclaw-channel-plugin-ztm/compare/v2026.2.15...v2026.2.18
