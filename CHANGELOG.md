## [unreleased]

### 🚀 Features

- Add changelog automation scripts and full changelog
## [2026.2.18] - 2026-02-17

### 🚀 Features

- Add timeout to message processing to prevent indefinite blocking
- *(di)* Add repository dependency keys
- *(di)* Add repository factory functions
- *(plugin)* Register repository services in DI container
- *(state)* Add AccountStateManager class
- *(di)* Register AccountStateManager in DI container
- Add npm publish workflow for third-party plugin distribution
- Add auto changelog and GitHub Release generation

### 🐛 Bug Fixes

- Add cross-platform path resolution for Windows compatibility
- Use cryptographically secure random for messageId generation
- Override tar dependency to address CVE vulnerability
- Skip polling cycle when allowFrom store read fails
- Use defensive programming for config validation resolution
- Prevent overlapping watch loop executions
- Replace CommonJS require() with ESM imports in DI module
- Clear pendingPairings Map on account removal and stop
- Replace unsafe type assertions with type-safe checks in validation
- Log probe errors instead of silently ignoring them in collectWarnings
- Replace unsafe type assertions with type-safe guards
- Standardize error handling with extractErrorMessage utility
- Add logging for silent config failure in directoryListPeersImpl
- Validate peer parameter in URL to prevent path traversal (CWE-20)
- Exclude auth errors from retry logic (CWE-755)
- Add log sanitization to prevent log injection (CWE-117)
- Add max-delay flush to prevent watermark data loss on crash
- Set watchInterval to null after clearing in removeAccountState
- Use pending flag instead of blocking in watch loop to prevent skipped iterations
- Add error recovery in watch loop to prevent single point of failure
- Add batch size limit to prevent memory spikes from large chat histories
- Add optional timeout to Semaphore acquire to prevent infinite wait
- Add TTL-based cleanup for pendingPairings Map
- Add allowFrom cache to eliminate redundant async calls per poll/watch cycle
- Add group permission cache to eliminate repeated lookups
- Resolve race condition in Semaphore timeout handling
- Use LRU cache for groupPermissionCache to prevent unbounded growth (CWE-400)
- Add message length validation to prevent memory exhaustion (CWE-20)
- Update tar package to >=7.5.7 to resolve 4 HIGH vulnerabilities (CWE-1392)
- Add comprehensive input validation to API client (CWE-20)
- Consistent error handling in sendZTMMessage (Result pattern)
- Eliminate race condition in Semaphore.release()
- Add TTL support to GroupPermissionLRUCache
- Add periodic cleanup for pending pairings
- Async callback execution with semaphore to prevent blocking watch loop
- LRU cache eviction bug and add comprehensive tests
- Resolve ESLint no-unused-vars errors
- Eliminate ESLint no-explicit-any warnings and resolve test errors
- Resolve TypeScript type errors and enable type checking
- Use incrementing counter instead of timestamp for LRU ordering
- Extract WATCH_ERROR_THRESHOLD constant from hardcoded value
- Update publish workflow tag pattern to match v*.*.* format

### 💼 Other

- Add accountId validation to prevent path traversal
- Add HTML escaping to prevent XSS attacks
- Add verbatimModuleSyntax to tsconfig for stricter type imports
- *(deps-dev)* Bump eslint from 9.39.2 to 10.0.0 (#3)
- *(deps)* Bump openclaw from 2026.2.9 to 2026.2.15 (#4)

### 🚜 Refactor

- Extract normalizeUsername to shared utils module
- Remove defaultInstance, use per-account stores exclusively
- Split long startAccountGateway function
- Add structural section comments to plugin definition
- Extract complex functions to reduce nesting complexity
- Extract chat processing logic to reduce nesting depth
- Extract shared chat processing logic to eliminate duplication
- Apply interface segregation principle to IApiClient
- Extract magic numbers into centralized constants
- Standardize ZTM naming convention (Ztm -> ZTM)
- [**breaking**] Simplify processIncomingMessage signature with Options Object
- Extract ConnectivityManager and MessageDispatcher from Gateway
- Use lazy initialization for runtimeProvider
- Add consistent logger access via getLogger()
- Update deprecated type imports from inbound.ts
- Remove inbound.ts compatibility layer
- Extract shared message processing logic to eliminate code duplication
- Decompose complex watchLoop function into WatchLoopController class
- Extract magic numbers to constants
- Add consistent null/undefined handling utilities
- Use guards utilities for null/undefined handling
- Introduce repository pattern to decouple messaging from runtime
- *(watcher)* Use DI container for dependencies
- *(polling)* Use DI container for dependencies
- *(gateway)* Use DI container for dependencies
- Extract GroupPermissionLRUCache to separate cache module
- Replace any types with proper interfaces in plugin.ts

### 📚 Documentation

- Update release version badge to use date sorting
- Add comprehensive JSDoc to public API functions
- Sync README with code implementation
- Distinguish npm install vs local dev installation in README

### ⚡ Performance

- Use lazy loading and async I/O for state store
- Eliminate duplicate getChats() API call
- Add memory management for accounts and per-account stores
- Use single-pass array classification instead of multiple filter()

### 🎨 Styling

- Apply Prettier formatting to source files

### 🧪 Testing

- Add unit tests for API and channel modules
- Add security tests for input validation
- Add authorization tests for pairing flow
- Add race condition tests for concurrent account initialization
- Extract mock factories to shared fixtures
- Add async flush tests for MessageStateStore
- Add comprehensive unit tests for watcher.ts
- Add crash recovery tests for debounce window
- Add concurrent account removal tests during operations
- Add dedicated test file for mesh-api.ts
- Add error handling tests for onboarding wizard
- Add time-based edge cases and clock manipulation tests
- Expand watcher.ts tests with timing and iteration scenarios
- Add comprehensive unit tests for message-dispatcher.ts
- Expand inbound.ts tests with re-export verification
- Add chat-processor.ts unit tests with 95% coverage
- Improve runtime.ts coverage from 4% to 82%
- Improve coverage for state, errors, and log-sanitize modules
- Add LRU cache tests and fix eviction bugs
- Add MAX_MESSAGE_LENGTH boundary tests to processor

### ⚙️ Miscellaneous Tasks

- Upgrade @types/node from 20.x to 24.x
- Remove review artifacts and ignore them in future
- Add CLAUDE.md to .gitignore
- Add .claude/ directory to .gitignore
- Add .mcp.json to .gitignore
- Remove review archive and analysis files
- Add ESLint and Prettier configuration
- Add Dependabot for automated dependency updates
- Update package-lock.json for npm publish setup
- Release 2026.2.18
## [2026.2.15] - 2026-02-15

### 🚀 Features

- Initial commit for openclaw-channel-plugin-ztm
- Support permitSource configuration for permit.json (#2)

### 🐛 Bug Fixes

- Correct GitHub repo path in badges

### 📚 Documentation

- Fix README paths and add missing helpers.ts
- Update README with ZTM API and test coverage
- Refine Policy Decision Matrix in README
- Update Architecture diagram with ZTM Agent API
- Add badges to README
- Replace npm badge with release version badge

### 🧪 Testing

- Fix flaky sleep test by relaxing timing tolerance

### ⚙️ Miscellaneous Tasks

- Add MIT License to the project
- Add GitHub Actions test workflow (#1)
- Bump version to 2026.2.15
