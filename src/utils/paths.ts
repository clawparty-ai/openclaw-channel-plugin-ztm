/**
 * Path resolution utilities for cross-platform compatibility
 * Handles OpenClaw state directory resolution following OpenClaw SDK conventions
 */

import os from 'os';
import path from 'path';

/**
 * Environment variables that can override the default state directory
 */
export const STATE_DIR_ENV_VARS = {
  /** Explicit state directory override */
  EXPLICIT: 'ZTM_STATE_PATH',
  /** OpenClaw state directory (same as OPENCLAW_STATE_DIR) */
  OPENCLAW_STATE: 'OPENCLAW_STATE_DIR',
  /** OpenClaw home directory */
  OPENCLAW_HOME: 'OPENCLAW_HOME',
} as const;

/**
 * Default subdirectory for ZTM plugin data within the OpenClaw state directory
 */
export const ZTM_SUBDIR = 'ztm';

/**
 * Resolve a path that might be a Windows absolute path
 * On non-Windows platforms, path.resolve() treats Windows paths as relative,
 * so we need to handle them specially
 */
function resolvePath(input: string): string {
  // If already absolute, return as-is
  if (path.isAbsolute(input)) {
    return input;
  }

  // Handle Windows absolute paths on non-Windows platforms
  // e.g., C:\Users\testuser on macOS/Linux
  if (/^[A-Za-z]:[/\\]/.test(input)) {
    return input;
  }

  // Otherwise, resolve relative paths
  return path.resolve(input);
}

/**
 * Resolve the OpenClaw home directory
 * Priority: OPENCLAW_HOME > HOME > USERPROFILE > os.homedir()
 */
export function resolveOpenclawHome(): string {
  // Check explicit OPENCLAW_HOME override
  if (process.env.OPENCLAW_HOME) {
    return resolvePath(process.env.OPENCLAW_HOME);
  }

  // Fallback to HOME (Unix/Linux/macOS)
  if (process.env.HOME) {
    return resolvePath(process.env.HOME);
  }

  // Fallback to USERPROFILE (Windows)
  if (process.env.USERPROFILE) {
    return resolvePath(process.env.USERPROFILE);
  }

  // Last resort: use Node.js os.homedir()
  return os.homedir();
}

/**
 * Resolve the OpenClaw state directory
 * Priority: OPENCLAW_STATE_DIR > (OPENCLAW_HOME or ~)/.openclaw
 */
export function resolveOpenclawStateDir(): string {
  // Check explicit OPENCLAW_STATE_DIR override
  if (process.env.OPENCLAW_STATE_DIR) {
    return resolvePath(process.env.OPENCLAW_STATE_DIR);
  }

  // Fallback to OPENCLAW_HOME/.openclaw or ~/.openclaw
  return path.join(resolveOpenclawHome(), '.openclaw');
}

/**
 * Resolve the ZTM plugin state directory
 * Priority: ZTM_STATE_PATH > (OPENCLAW_STATE_DIR or ~/.openclaw)/ztm
 *
 * This follows OpenClaw SDK conventions where plugin-specific data
 * is stored under the main state directory
 */
export function resolveZTMStateDir(): string {
  // Check explicit ZTM_STATE_PATH override (for backward compatibility)
  if (process.env.ZTM_STATE_PATH) {
    const resolved = resolvePath(process.env.ZTM_STATE_PATH);
    // If it's a file path, extract the directory
    if (path.extname(resolved)) {
      return path.dirname(resolved);
    }
    return resolved;
  }

  // Default: <openclaw-state-dir>/ztm
  return path.join(resolveOpenclawStateDir(), ZTM_SUBDIR);
}

/**
 * Resolve the ZTM state file path
 * Priority: ZTM_STATE_PATH > (OPENCLAW_STATE_DIR or ~/.openclaw)/ztm/state.json
 */
export function resolveStatePath(): string {
  // Check explicit ZTM_STATE_PATH override
  if (process.env.ZTM_STATE_PATH) {
    const resolved = resolvePath(process.env.ZTM_STATE_PATH);
    // If it's a directory, append state.json
    if (!path.extname(resolved)) {
      return path.join(resolved, 'state.json');
    }
    return resolved;
  }

  // Default: <openclaw-state-dir>/ztm/state.json
  return path.join(resolveZTMStateDir(), 'state.json');
}

/**
 * Resolve the ZTM permit file path
 * Uses the same directory as state files
 */
export function resolvePermitPath(): string {
  return path.join(resolveZTMStateDir(), 'permit.json');
}

/**
 * Options for resolveZTMStateDirWithOverrides
 */
export interface ResolveStateDirOptions {
  /**
   * Override the ZTM_STATE_PATH environment variable
   * Useful for testing
   */
  ZTM_STATE_PATH?: string;
  /**
   * Override the OPENCLAW_STATE_DIR environment variable
   * Useful for testing
   */
  OPENCLAW_STATE_DIR?: string;
  /**
   * Override the OPENCLAW_HOME environment variable
   * Useful for testing
   */
  OPENCLAW_HOME?: string;
  /**
   * Override the HOME environment variable
   * Useful for testing
   */
  HOME?: string;
  /**
   * Override the USERPROFILE environment variable (Windows)
   * Useful for testing
   */
  USERPROFILE?: string;
  /**
   * Override os.homedir() function
   * Useful for testing
   */
  homedir?: () => string;
}

/**
 * Resolve ZTM state directory with overrides (for testing)
 * @internal - exported for testing only
 */
export function resolveZTMStateDirWithOverrides(overrides?: ResolveStateDirOptions): string {
  const env = overrides || {};

  // Check explicit ZTM_STATE_PATH override
  if (env.ZTM_STATE_PATH) {
    const resolved = resolvePath(env.ZTM_STATE_PATH);
    if (path.extname(resolved)) {
      return path.dirname(resolved);
    }
    return resolved;
  }

  // Check explicit OPENCLAW_STATE_DIR override
  if (env.OPENCLAW_STATE_DIR) {
    return path.join(resolvePath(env.OPENCLAW_STATE_DIR), ZTM_SUBDIR);
  }

  // Resolve home directory
  let homeDir: string;
  if (env.OPENCLAW_HOME) {
    homeDir = resolvePath(env.OPENCLAW_HOME);
  } else if (env.HOME) {
    homeDir = resolvePath(env.HOME);
  } else if (env.USERPROFILE) {
    homeDir = resolvePath(env.USERPROFILE);
  } else if (env.homedir) {
    homeDir = resolvePath(env.homedir());
  } else {
    homeDir = os.homedir();
  }

  return path.join(homeDir, '.openclaw', ZTM_SUBDIR);
}

/**
 * Resolve state file path with overrides (for testing)
 * @internal - exported for testing only
 */
export function resolveStatePathWithOverrides(overrides?: ResolveStateDirOptions): string {
  const env = overrides || {};

  // Check explicit ZTM_STATE_PATH override
  if (env.ZTM_STATE_PATH) {
    const resolved = resolvePath(env.ZTM_STATE_PATH);
    if (!path.extname(resolved)) {
      return path.join(resolved, 'state.json');
    }
    return resolved;
  }

  // Default: <zmt-state-dir>/state.json
  return path.join(resolveZTMStateDirWithOverrides(env), 'state.json');
}

/**
 * Resolve permit file path with overrides (for testing)
 * @internal - exported for testing only
 */
export function resolvePermitPathWithOverrides(overrides?: ResolveStateDirOptions): string {
  return path.join(resolveZTMStateDirWithOverrides(overrides), 'permit.json');
}
