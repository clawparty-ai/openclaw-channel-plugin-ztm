/**
 * Path resolution utilities for cross-platform compatibility
 * Handles OpenClaw state directory resolution following OpenClaw SDK conventions
 */

import os from 'os';
import path from 'path';
import { containsPathTraversal } from './validation.js';

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
 * Resolve the ZTM plugin state directory for a specific account
 * Priority: ZTM_STATE_PATH > (OPENCLAW_STATE_DIR or ~/.openclaw)/ztm/{accountId}
 *
 * This follows OpenClaw SDK conventions where plugin-specific data
 * is stored under the main state directory, with per-account subdirectories
 */
export function resolveZTMStateDir(accountId: string): string {
  // Check explicit ZTM_STATE_PATH override (for backward compatibility)
  if (process.env.ZTM_STATE_PATH) {
    const resolved = resolvePath(process.env.ZTM_STATE_PATH);
    // If it's a file path, extract the directory
    if (path.extname(resolved)) {
      return path.join(path.dirname(resolved), accountId);
    }
    return path.join(resolved, accountId);
  }

  // Default: <openclaw-state-dir>/ztm/{accountId}
  return path.join(resolveOpenclawStateDir(), ZTM_SUBDIR, accountId);
}

/**
 * Resolve the ZTM state file path for a specific account
 * Uses per-account directory: {accountId}/state.json
 */
export function resolveStatePath(accountId: string): string {
  return path.join(resolveZTMStateDir(accountId), 'state.json');
}

/**
 * Resolve the ZTM permit file path for a specific account
 * Uses per-account directory: {accountId}/permit.json
 */
export function resolvePermitPath(accountId: string): string {
  return path.join(resolveZTMStateDir(accountId), 'permit.json');
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
export function resolveZTMStateDirWithOverrides(
  accountId: string,
  overrides?: ResolveStateDirOptions
): string {
  const env = overrides || {};

  // Check explicit ZTM_STATE_PATH override
  if (env.ZTM_STATE_PATH) {
    // Security: Validate against path traversal attacks BEFORE processing
    if (containsPathTraversal(env.ZTM_STATE_PATH)) {
      throw new Error('Invalid path: path traversal detected');
    }
    const resolved = resolvePath(env.ZTM_STATE_PATH);
    if (path.extname(resolved)) {
      return path.join(path.dirname(resolved), accountId);
    }
    return path.join(resolved, accountId);
  }

  // Check explicit OPENCLAW_STATE_DIR override
  if (env.OPENCLAW_STATE_DIR) {
    // Security: Validate against path traversal attacks
    if (containsPathTraversal(env.OPENCLAW_STATE_DIR)) {
      throw new Error('Invalid path: path traversal detected');
    }
    return path.join(resolvePath(env.OPENCLAW_STATE_DIR), ZTM_SUBDIR, accountId);
  }

  // Resolve home directory
  let homeDir: string;
  if (env.OPENCLAW_HOME) {
    // Security: Validate against path traversal attacks
    if (containsPathTraversal(env.OPENCLAW_HOME)) {
      throw new Error('Invalid path: path traversal detected');
    }
    homeDir = resolvePath(env.OPENCLAW_HOME);
  } else if (env.HOME) {
    // Security: Validate against path traversal attacks
    if (containsPathTraversal(env.HOME)) {
      throw new Error('Invalid path: path traversal detected');
    }
    homeDir = resolvePath(env.HOME);
  } else if (env.USERPROFILE) {
    // Security: Validate against path traversal attacks
    if (containsPathTraversal(env.USERPROFILE)) {
      throw new Error('Invalid path: path traversal detected');
    }
    homeDir = resolvePath(env.USERPROFILE);
  } else if (env.homedir) {
    homeDir = resolvePath(env.homedir());
  } else {
    homeDir = os.homedir();
  }

  return path.join(homeDir, '.openclaw', ZTM_SUBDIR, accountId);
}

/**
 * Resolve state file path with overrides (for testing)
 * @internal - exported for testing only
 */
export function resolveStatePathWithOverrides(
  accountId: string,
  overrides?: ResolveStateDirOptions
): string {
  return resolveAccountFilePath(accountId, 'state.json', overrides);
}

/**
 * Resolve permit file path with overrides (for testing)
 * @internal - exported for testing only
 */
export function resolvePermitPathWithOverrides(
  accountId: string,
  overrides?: ResolveStateDirOptions
): string {
  return resolveAccountFilePath(accountId, 'permit.json', overrides);
}

/**
 * Internal helper to resolve account-specific file paths with overrides
 * Reuses resolveZTMStateDirWithOverrides and adds security validation
 */
function resolveAccountFilePath(
  accountId: string,
  fileName: string,
  overrides?: ResolveStateDirOptions
): string {
  const baseDir = resolveZTMStateDirWithOverrides(accountId, overrides);

  // Security: Validate against path traversal attacks
  if (containsPathTraversal(baseDir)) {
    throw new Error('Invalid path: path traversal detected');
  }

  return path.join(baseDir, fileName);
}
