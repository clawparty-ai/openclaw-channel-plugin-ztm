/**
 * ZTM Runtime - Manages ZTM network connection and message handling
 * @module runtime/runtime
 * Pure Factory Function + DI pattern - no singleton
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
// DEFAULT PROVIDER
// ============================================================================

/**
 * Default runtime provider instance for the application
 */
let defaultProvider: RuntimeProvider | null = null;

/**
 * Get the default runtime provider
 */
export function getDefaultRuntimeProvider(): RuntimeProvider {
  if (!defaultProvider) {
    defaultProvider = createRuntimeProvider();
  }
  return defaultProvider;
}

/**
 * Reset the default provider (for testing purposes)
 */
export function resetDefaultProvider(): void {
  defaultProvider = null;
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
