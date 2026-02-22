/**
 * @fileoverview ZTM Chat Utility Functions
 * @module utils
 *
 * Barrel export for all utility modules providing:
 * - Concurrency control (Semaphore)
 * - Retry logic with exponential backoff
 * - Structured logging
 * - Input validation
 * - Result type handling
 * - Path resolution
 * - Error handling
 * - Type guards
 * - Time synchronization
 */

// ZTM Chat Utility Functions

// Concurrency utilities
export * from './concurrency.js';

// Retry utilities
export * from './retry.js';

// Logger
export * from './logger.js';

// Validation utilities
export * from './validation.js';

// Result handling utilities
export * from './result.js';

// Path resolution utilities
export * from './paths.js';

// Error handling utilities
export * from './error.js';

// Type guards and null handling
export * from './guards.js';

// Sync time utilities
export * from './sync-time.js';

// Type exports
export type {
  Result,
  AsyncResult,
  ConnectionStatus,
  MessageDirection,
  PairingStatus,
} from '../types/common.js';
