/**
 * DI Test Fixtures
 * @module test-utils/di-fixtures
 * Provides test utilities for DI container testing
 */

import {
  DIContainer,
  DEPENDENCIES,
  type ILogger,
  type IRuntime,
  type DIContainer as DIContainerType,
} from '../di/index.js';
import type { PluginRuntime } from 'openclaw/plugin-sdk';
import type { IAllowFromRepository, IMessageStateRepository } from '../runtime/repository.js';
import { vi } from 'vitest';

/**
 * Create a new DI container for testing
 * Each call creates a fresh container instance
 */
export function createTestContainer(): DIContainerType {
  return new DIContainer();
}

/**
 * Create a mock Runtime Provider for testing
 */
export function createMockRuntimeProvider(): IRuntime {
  let runtime: PluginRuntime | null = null;

  return {
    get() {
      if (!runtime) {
        throw new Error('Runtime not initialized');
      }
      return runtime;
    },
    isInitialized: () => runtime !== null,
  };
}

/**
 * Create a mock ILogger for testing
 */
export function createMockLogger(): ILogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

/**
 * Create a mock IAllowFromRepository for testing
 */
export function createMockAllowFromRepository(): IAllowFromRepository {
  return {
    getAllowFrom: vi.fn().mockResolvedValue([]),
    clearCache: vi.fn(),
  };
}

/**
 * Create a mock IMessageStateRepository for testing
 */
export function createMockMessageStateRepository(): IMessageStateRepository {
  return {
    getWatermark: vi.fn().mockResolvedValue(0),
    setWatermark: vi.fn().mockResolvedValue(undefined),
    flush: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Setup a container with all common test mocks
 * Uses registerInstance to inject mock instances directly
 */
export function setupTestContainer(container: DIContainerType): void {
  // Mock Logger - wrap in factory function
  container.registerInstance(DEPENDENCIES.LOGGER, createMockLogger());

  // Mock Runtime Provider - wrap in factory function
  container.registerInstance(DEPENDENCIES.RUNTIME, createMockRuntimeProvider());

  // Mock AllowFromRepository
  container.registerInstance(DEPENDENCIES.ALLOW_FROM_REPO, createMockAllowFromRepository());

  // Mock MessageStateRepository
  container.registerInstance(DEPENDENCIES.MESSAGE_STATE_REPO, createMockMessageStateRepository());
}
