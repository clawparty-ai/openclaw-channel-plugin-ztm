// Dependency Injection Module
// Barrel exports for DI container and service factories

import type {
  DependencyKey,
  ILogger,
  IConfig,
  IApiClient,
  IApiClientFactory,
  IRuntime,
} from "./container";

import type { ZTMChatConfig } from "../types/config.js";
import type { Result, AsyncResult } from "../types/common.js";

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
} from "./container";

// ============================================================================
// SERVICE FACTORIES
// ============================================================================

/**
 * Factory functions to create service instances
 * These factories are registered with the container and support lazy initialization
 */

// Import implementations using ESM imports
import { logger as loggerInstance, createLogger as createLoggerFn } from "../utils/logger.js";
import { getEffectiveChannelConfig } from "../channel/config.js";
import { createZTMApiClient } from "../api/ztm-api.js";
import { getZTMRuntime, isRuntimeInitialized } from "../runtime/runtime.js";

/**
 * Logger factory
 * Returns a factory function that creates a logger instance
 */
export function createLogger(serviceName: string): () => ILogger {
  // Return logger instance with type cast for DI compatibility
  return () => loggerInstance as unknown as ILogger;
}

/**
 * Config service factory
 * Returns a factory function for DI container registration
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
 * Methods directly return promises for compatibility
 */
export function createApiClientService(): () => IApiClient {
  return () => {
    // Create with empty config - actual config should be provided via factory
    const client = createZTMApiClient({
      agentUrl: "",
      permitUrl: "",
      permitSource: "server",
      meshName: "",
      username: "",
      dmPolicy: "pairing",
      enableGroups: false,
      autoReply: false,
      messagePath: "/",
    });
    return {
      getChats: client.getChats(),
      sendPeerMessage: client.sendPeerMessage,
      sendGroupMessage: client.sendGroupMessage,
      discoverUsers: client.discoverUsers(),
      getMeshInfo: client.getMeshInfo(),
    };
  };
}

/**
 * Runtime service factory
 * Returns a factory function for DI container registration
 */
export function createRuntimeService(): () => IRuntime {
  return () => ({
    get: () => getZTMRuntime(),
    isInitialized: () => isRuntimeInitialized(),
  });
}

/**
 * API client factory
 * Returns a factory function for DI container registration
 */
export function createApiClientFactory(): () => IApiClientFactory {
  return () => (config: ZTMChatConfig, deps?: unknown) =>
    createZTMApiClient(config, deps as any);
}
