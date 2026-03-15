/**
 * Test Utilities Module
 *
 * Central export point for all test utilities used in ZTM Chat plugin testing.
 * Provides fixtures, mocks, helpers, and specialized testing tools.
 *
 * @module test-utils
 *
 * @example
 * ```typescript
 * import { testConfig, testAccountId, createMockChat } from './test-utils/index.js';
 *
 * const config = testConfig();
 * const account = testAccountId();
 * ```
 *
 * @see {@link ./fixtures.js} for test data fixtures
 * @see {@link ./mocks.js} for mock responses
 */

// Re-export fixtures
export * from './fixtures.js';

// Re-export mocks
export * from './mocks.js';

// Re-export helpers
export * from './helpers.js';

// Re-export HTTP server test utilities
export * from './http-server.js';

// Re-export file system test utilities
export * from './fs-helpers.js';

// Re-export stress testing utilities
export * from './stress-helpers.js';

// Re-export E2E test utilities
export * from './e2e-fixtures.js';
