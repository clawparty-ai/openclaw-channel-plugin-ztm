/**
 * ZTM Runtime - Manages ZTM network connection and message handling
 * @module runtime/runtime
 * Refactored to use pure Factory Function + DI pattern
 */

import type { PluginRuntime } from 'openclaw/plugin-sdk';
import { setRuntimeLogger } from '../utils/logger.js';
import { requireDefined, isDefined } from '../utils/guards.js';

// ============================================================================
// RUNTIME PROVIDER INTERFACE
// ============================================================================

/**
 * Interface for runtime provider - enables dependency injection
 */
export interface RuntimeProvider {
  /**
   * Set a new runtime instance
   * @param runtime - The runtime to use
   */
  setRuntime(runtime: PluginRuntime): void;

  /**
   * Get the current runtime instance
   * @returns The current PluginRuntime instance
   * @throws Error if runtime not initialized
   */
  getRuntime(): PluginRuntime;

  /**
   * Check if runtime is initialized
   * @returns true if runtime has been set, false otherwise
   */
  isInitialized(): boolean;
}

// ============================================================================
// RUNTIME PROVIDER FACTORY
// ============================================================================

/**
 * Create a new RuntimeProvider instance
 * Each call creates a new instance - no singleton
 */
export function createRuntimeProvider(): RuntimeProvider {
  let runtime: PluginRuntime | null = null;

  return {
    setRuntime(rt: PluginRuntime): void {
      runtime = rt;
    },

    getRuntime(): PluginRuntime {
      return requireDefined(runtime, 'ZTM runtime not initialized - call setRuntime first');
    },

    isInitialized(): boolean {
      return isDefined(runtime);
    },
  };
}

// ============================================================================
// DEFAULT PROVIDER (for backward compatibility during migration)
// ============================================================================

/**
 * Default runtime provider instance (used during migration)
 * In production, this should be obtained from DI container
 */
let defaultProvider: RuntimeProvider | null = null;

/**
 * Get the default runtime provider
 * NOTE: This is a temporary solution during migration
 * After migration, all code should use DI container
 */
export function getDefaultRuntimeProvider(): RuntimeProvider {
  if (!defaultProvider) {
    defaultProvider = createRuntimeProvider();
  }
  return defaultProvider;
}

/**
 * Set the ZTM runtime (uses default provider)
 * @param next - The runtime to use
 */
export function setZTMRuntime(next: PluginRuntime): void {
  const provider = getDefaultRuntimeProvider();
  provider.setRuntime(next);

  // Set runtime logger if available for consistent logging
  const rt = next as unknown as {
    log?: {
      debug?: (msg: string) => void;
      info?: (msg: string) => void;
      warn?: (msg: string) => void;
      error?: (msg: string) => void;
    };
  };
  if (rt.log) {
    setRuntimeLogger({
      debug: (msg: string) => rt.log?.debug?.(msg),
      info: (msg: string) => rt.log?.info?.(msg),
      warn: (msg: string) => rt.log?.warn?.(msg),
      error: (msg: string) => rt.log?.error?.(msg),
    });
  }
}

/**
 * Get the ZTM runtime (uses default provider)
 * @returns The current runtime instance
 * @throws Error if runtime not initialized
 */
export function getZTMRuntime(): PluginRuntime {
  return getDefaultRuntimeProvider().getRuntime();
}

/**
 * Check if runtime is initialized
 * @returns true if runtime has been set
 */
export function isRuntimeInitialized(): boolean {
  return getDefaultRuntimeProvider().isInitialized();
}

// ============================================================================
// DEPRECATED: Legacy RuntimeManager class (for backward compatibility)
// ============================================================================

/**
 * @deprecated Use createRuntimeProvider() instead
 * Singleton manager for ZTM runtime
 * Provides testable runtime management with dependency injection capability
 */
export class RuntimeManager implements RuntimeProvider {
  private static instance: RuntimeManager | null = null;
  private runtime: PluginRuntime | null = null;

  /**
   * Get the singleton instance
   * Creates instance on first call, returns existing instance thereafter
   * @returns The RuntimeManager singleton instance
   * @deprecated Use createRuntimeProvider() instead
   */
  static getInstance(): RuntimeManager {
    if (!RuntimeManager.instance) {
      RuntimeManager.instance = new RuntimeManager();
    }
    return RuntimeManager.instance;
  }

  /**
   * Reset the singleton instance (for testing purposes)
   * Call this in test beforeEach to clean state between tests
   * @deprecated Use fresh createRuntimeProvider() instance instead
   */
  static reset(): void {
    RuntimeManager.instance = null;
    defaultProvider = null;
  }

  /**
   * Set the runtime instance
   * @param runtime - The runtime to use
   */
  setRuntime(runtime: PluginRuntime): void {
    this.runtime = runtime;
  }

  /**
   * Get the current runtime instance
   * @returns The current PluginRuntime instance
   * @throws Error if runtime not initialized
   */
  getRuntime(): PluginRuntime {
    return requireDefined(this.runtime, 'ZTM runtime not initialized - call setZTMRuntime first');
  }

  /**
   * Check if runtime is initialized
   * @returns true if runtime has been set, false otherwise
   */
  isInitialized(): boolean {
    return isDefined(this.runtime);
  }
}
