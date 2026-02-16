// ZTM Runtime - Manages ZTM network connection and message handling
// Refactored to use Dependency Injection + Singleton pattern for testability

import type { PluginRuntime } from "openclaw/plugin-sdk";
import { setRuntimeLogger } from "../utils/logger.js";

// ============================================================================
// RUNTIME PROVIDER INTERFACE
// ============================================================================

/**
 * Interface for runtime provider - enables dependency injection
 */
export interface RuntimeProvider {
  /**
   * Get the current runtime instance
   * @throws Error if runtime not initialized
   */
  getRuntime(): PluginRuntime;

  /**
   * Set a new runtime instance
   * @param runtime The runtime to use
   */
  setRuntime(runtime: PluginRuntime): void;

  /**
   * Check if runtime is initialized
   */
  isInitialized(): boolean;
}

// ============================================================================
// RUNTIME MANAGER (Singleton)
// ============================================================================

/**
 * Singleton manager for ZTM runtime
 * Provides testable runtime management with dependency injection capability
 */
export class RuntimeManager implements RuntimeProvider {
  private static instance: RuntimeManager | null = null;
  private runtime: PluginRuntime | null = null;

  /**
   * Get the singleton instance
   * Creates instance on first call, returns existing instance thereafter
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
   */
  static reset(): void {
    RuntimeManager.instance = null;
  }

  /**
   * Set the runtime instance
   * @param runtime The runtime to use
   */
  setRuntime(runtime: PluginRuntime): void {
    this.runtime = runtime;
  }

  /**
   * Get the current runtime instance
   * @throws Error if runtime not initialized
   */
  getRuntime(): PluginRuntime {
    if (!this.runtime) {
      throw new Error("ZTM runtime not initialized - call setZTMRuntime first");
    }
    return this.runtime;
  }

  /**
   * Check if runtime is initialized
   */
  isInitialized(): boolean {
    return this.runtime !== null;
  }
}

// ============================================================================
// CONVENIENCE EXPORTS (Backward Compatible)
// ============================================================================

/**
 * Get the runtime provider instance lazily
 * Only creates the singleton when first accessed, not at module load time
 */
function getRuntimeProvider(): RuntimeProvider {
  return RuntimeManager.getInstance();
}

/**
 * Set the ZTM runtime
 * @param next The runtime to use
 */
export function setZTMRuntime(next: PluginRuntime): void {
  getRuntimeProvider().setRuntime(next);

  // Set runtime logger if available for consistent logging
  // Cast to any to access runtime.log which may not be in type definition
  const rt = next as unknown as { log?: { debug?: (msg: string) => void; info?: (msg: string) => void; warn?: (msg: string) => void; error?: (msg: string) => void } };
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
 */
export function getZTMRuntime(): PluginRuntime {
  return getRuntimeProvider().getRuntime();
}

/**
 * Check if runtime is initialized
 * @returns true if runtime has been set
 */
export function isRuntimeInitialized(): boolean {
  return getRuntimeProvider().isInitialized();
}

/**
 * Alias for isRuntimeInitialized - checks if ZTM runtime is available
 * @returns true if runtime has been set
 */
export function hasZTMRuntime(): boolean {
  return getRuntimeProvider().isInitialized();
}


