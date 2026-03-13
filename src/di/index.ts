/**
 * Dependency Injection Module
 * @module di/index
 * Barrel exports for DI container and service factories
 */

import type {
  ILogger,
  IConfig,
  IApiClient,
  IApiClientFactory,
  IRuntime,
  IChatReader,
  IChatSender,
  IDiscovery,
} from './container';
import { DEPENDENCIES, container } from './container';

import type { IAllowFromRepository, IMessageStateRepository } from '../runtime/repository.js';

import type { ZTMChatConfig } from '../types/config.js';

export {
  DEPENDENCIES,
  createDependencyKey,
  DIContainer,
  container,
  type DependencyKey,
  type ILogger,
  type IConfig,
  type IApiClient,
  type IApiClientFactory,
  type IRuntime,
  type IChatReader,
  type IChatSender,
  type IDiscovery,
} from './container';

export type { IAllowFromRepository, IMessageStateRepository };

// ============================================================================
// SERVICE FACTORIES
// ============================================================================

/**
 * Factory functions to create service instances
 * These factories are registered with the container and support lazy initialization
 */

// Import implementations using ESM imports
import { logger as loggerInstance } from '../utils/logger.js';
import { getEffectiveChannelConfig } from '../channel/config.js';
import { createZTMApiClient } from '../api/ztm-api.js';
import { getAllowFromRepository, getMessageStateRepository } from '../runtime/repository-impl.js';
import { getZTMRuntime, isZTMRuntimeInitialized } from '../runtime/runtime.js';
import { getAccountStateManager } from '../runtime/state.js';
import { asChatReader, asChatSender, asDiscovery } from '../runtime/type-conversion.js';

/**
 * Logger factory
 * Returns a factory function that creates a logger instance
 *
 * @returns Factory function that returns an ILogger instance
 *
 * @example
 * ```typescript
 * const loggerFactory = createLogger('my-service');
 * const logger = loggerFactory();
 * logger.info('Service initialized');
 * ```
 */
export function createLogger(_serviceName: string): () => ILogger {
  // Return logger instance with type cast for DI compatibility
  return () => loggerInstance as unknown as ILogger;
}

/**
 * Config service factory
 * Returns a factory function for DI container registration
 *
 * @returns Factory function that returns an IConfig instance
 */
export function createConfigService(): () => IConfig {
  return () => ({
    get: () => {
      const cfg = getEffectiveChannelConfig();
      return (cfg ?? {}) as ZTMChatConfig;
    },
    isValid: () => true, // Default to valid, actual validation happens elsewhere
  });
}

/**
 * API client factory
 * Returns a factory function for DI container registration
 * Returns a client implementing all segregated interfaces
 *
 * @returns Factory function that returns an IApiClient instance
 */
export function createApiClientService(): () => IApiClient {
  return (): IApiClient => {
    // Create with empty config - actual config should be provided via factory
    const client = createZTMApiClient({
      agentUrl: '',
      permitUrl: '',
      permitSource: 'server',
      meshName: '',
      username: '',
      dmPolicy: 'pairing',
      enableGroups: false,
    });
    // Return client implementing all IApiClient interfaces
    return client as unknown as IApiClient;
  };
}

/**
 * API client reader factory - Read operations only
 * Returns a factory function for DI container registration
 *
 * @returns Factory function that returns an IChatReader instance
 */
export function createApiReaderService(): () => IChatReader {
  return (): IChatReader => {
    const client = createZTMApiClient({
      agentUrl: '',
      permitUrl: '',
      permitSource: 'server',
      meshName: '',
      username: '',
      dmPolicy: 'pairing',
      enableGroups: false,
    });
    return asChatReader(client);
  };
}

/**
 * API client sender factory - Write operations only
 * Returns a factory function for DI container registration
 *
 * @returns Factory function that returns an IChatSender instance
 */
export function createApiSenderService(): () => IChatSender {
  return (): IChatSender => {
    const client = createZTMApiClient({
      agentUrl: '',
      permitUrl: '',
      permitSource: 'server',
      meshName: '',
      username: '',
      dmPolicy: 'pairing',
      enableGroups: false,
    });
    return asChatSender(client);
  };
}

/**
 * API client discovery factory - Discovery operations only
 * Returns a factory function for DI container registration
 *
 * @returns Factory function that returns an IDiscovery instance
 */
export function createApiDiscoveryService(): () => IDiscovery {
  return (): IDiscovery => {
    const client = createZTMApiClient({
      agentUrl: '',
      permitUrl: '',
      permitSource: 'server',
      meshName: '',
      username: '',
      dmPolicy: 'pairing',
      enableGroups: false,
    });
    return asDiscovery(client);
  };
}

/**
 * Runtime service factory
 * Returns a factory function for DI container registration
 *
 * This factory uses the default runtime provider to share the same
 * runtime instance that is set by setZTMRuntime() in index.ts.
 * This ensures consistency across the application.
 *
 * @returns Factory function that returns an IRuntime instance
 */
export function createRuntimeService(): () => IRuntime {
  // Use the runtime store to share the same runtime instance
  // that is set by setZTMRuntime() in index.ts

  return () => ({
    get: () => getZTMRuntime(),
    isInitialized: () => isZTMRuntimeInitialized(),
  });
}

/**
 * AllowFrom repository factory
 * Returns a factory function for DI container registration
 *
 * @returns Factory function that returns an IAllowFromRepository instance
 */
export function createAllowFromRepositoryService(): () => IAllowFromRepository {
  return () => getAllowFromRepository();
}

/**
 * MessageState repository factory
 * Returns a factory function for DI container registration
 *
 * @returns Factory function that returns an IMessageStateRepository instance
 */
export function createMessageStateRepositoryService(): () => IMessageStateRepository {
  return () => getMessageStateRepository();
}

/**
 * API client factory
 * Returns a factory function for DI container registration
 *
 * @returns Factory function that returns an IApiClientFactory instance
 */
export function createApiClientFactory(): () => IApiClientFactory {
  return () => (config: ZTMChatConfig, deps?: unknown) =>
    createZTMApiClient(config, deps as Parameters<typeof createZTMApiClient>[1]);
}

/**
 * AccountStateManager factory with DI
 * Returns a factory function for DI container registration
 *
 * This factory uses the module-level singleton to ensure consistent state
 * across the application. Using the singleton through DI makes the
 * dependency explicit and improves testability.
 *
 * @returns Factory function that returns the AccountStateManager singleton
 */
/**
 * @internal
 */
export function createAccountStateManagerService(): () => unknown {
  // Import getAccountStateManager to use the singleton

  return () => getAccountStateManager();
}

// ============================================================================
// HELPER FUNCTIONS FOR STATE MANAGEMENT
// ============================================================================

/**
 * Get AccountStateManager instance via DI container
 * Provides centralized access to account state management
 *
 * @returns AccountStateManager instance from the DI container
 */
/**
 * @internal
 */
export function getAccountStateManagerService(): import('../runtime/state.js').AccountStateManager {
  return container.get(
    DEPENDENCIES.ACCOUNT_STATE_MANAGER
  ) as import('../runtime/state.js').AccountStateManager;
}

/**
 * Get MessageStateRepository instance via DI container
 * Provides centralized access to message state persistence
 *
 * @returns IMessageStateRepository instance from the DI container
 */
export function getMessageStateRepositoryService(): IMessageStateRepository {
  return container.get(DEPENDENCIES.MESSAGE_STATE_REPO);
}

/**
 * Get AllowFromRepository instance via DI container
 * Provides centralized access to pairing allow list persistence
 *
 * @returns IAllowFromRepository instance from the DI container
 */
export function getAllowFromRepositoryService(): IAllowFromRepository {
  return container.get(DEPENDENCIES.ALLOW_FROM_REPO);
}
