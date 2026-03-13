/**
 * ZTM Runtime - Manages ZTM network connection and message handling
 * @module runtime/runtime
 * Pure Factory Function + DI pattern - no singleton
 */

import type { PluginRuntime } from 'openclaw/plugin-sdk';
import { createPluginRuntimeStore } from 'openclaw/plugin-sdk/compat';
import { setRuntimeLogger } from '../utils/logger.js';

// ============================================================================
// RUNTIME STORE
// ============================================================================

const runtimeStore = createPluginRuntimeStore<PluginRuntime>('ZTM runtime not initialized');

export const clearZTMRuntime = runtimeStore.clearRuntime;
export const tryGetZTMRuntime = runtimeStore.tryGetRuntime;

// Backward compatibility alias for tests
export const resetDefaultProvider = runtimeStore.clearRuntime;

/**
 * Set the ZTM runtime
 * @param next - The runtime to use
 *
 * @example
 * ```typescript
 * setZTMRuntime(runtime);
 * // Runtime is now available via getZTMRuntime()
 * ```
 */
export function setZTMRuntime(next: PluginRuntime): void {
  runtimeStore.setRuntime(next);

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
 * Get the ZTM runtime
 * @returns The current runtime instance
 * @throws Error if runtime not initialized
 *
 * @example
 * ```typescript
 * const rt = getZTMRuntime();
 * // Use runtime for API calls, channel operations, etc.
 * ```
 */
export function getZTMRuntime(): PluginRuntime {
  return runtimeStore.getRuntime();
}

/**
 * Check if runtime is initialized
 * @returns true if runtime has been set
 *
 * @example
 * ```typescript
 * if (isZTMRuntimeInitialized()) {
 *   console.log('Runtime is ready');
 * } else {
 *   console.log('Runtime not initialized');
 * }
 * ```
 */
export function isZTMRuntimeInitialized(): boolean {
  return runtimeStore.tryGetRuntime() !== null;
}
