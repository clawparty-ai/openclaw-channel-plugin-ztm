// Account runtime state management
// Manages runtime state for multiple ZTM Chat accounts
//
// This module provides:
// - AccountStateManager class: Explicit state ownership with clear lifecycle
// - Module-level convenience functions: Backward-compatible API wrapping AccountStateManager
// - Account initialization and cleanup
// - Runtime start/stop operations
//
// Architecture Note:
// The AccountStateManager class provides explicit state ownership with a clear lifecycle.
// Module-level functions (getOrCreateAccountState, removeAccountState, getAllAccountStates)
// delegate to the AccountStateManager singleton for backward compatibility.
// For DI-based injection, use getAccountStateManager() to obtain the manager instance.

// External dependencies - these will use DI
import { createZTMApiClient } from '../api/ztm-api.js';
import { logger, type Logger } from '../utils/logger.js';

// Pure functions - keep as direct imports (deterministic, no side effects)
import { getGroupPermission } from '../core/group-policy.js';

import { getAccountMessageStateStore } from './store.js';
import { GroupPermissionLRUCache } from './cache.js';
import type { PluginRuntime } from 'openclaw/plugin-sdk';
import type { ZTMChatConfig } from '../types/config.js';
import type { ZTMMeshInfo, ZTMApiClient } from '../types/api.js';
import type { AccountRuntimeState } from '../types/runtime.js';
import type { GroupPermissions } from '../types/group-policy.js';
import { isSuccess } from '../types/common.js';
import { Semaphore } from '../utils/concurrency.js';
import {
  PAIRING_MAX_AGE_MS,
  ALLOW_FROM_CACHE_TTL_MS,
  MAX_GROUP_PERMISSION_CACHE_SIZE,
  GROUP_PERMISSION_CACHE_TTL_MS,
  MESH_CONNECT_MAX_RETRIES,
  RETRY_DELAY_MS,
  CALLBACK_SEMAPHORE_PERMITS,
  MAX_PAIRINGS_PER_ACCOUNT,
} from '../constants.js';

// Dependencies interface for AccountStateManager
interface AccountStateManagerDeps {
  apiClientFactory: (config: ZTMChatConfig) => ZTMApiClient;
  logger: Logger;
}

// Re-export types and cache for backward compatibility
export type { AccountRuntimeState };
export { GroupPermissionLRUCache } from './cache.js';

/**
 * AccountStateManager - Explicit state ownership for account runtime state
 *
 * Replaces module-level singleton Map with explicit class management.
 * Provides better testability and lifecycle management.
 */
export class AccountStateManager {
  private states = new Map<string, AccountRuntimeState>();
  private deps: AccountStateManagerDeps;

  constructor(deps: AccountStateManagerDeps) {
    this.deps = deps;
  }

  /**
   * Get or create account state
   */
  getOrCreate(accountId: string): AccountRuntimeState {
    let state = this.states.get(accountId);
    if (!state) {
      state = this.createEmptyState(accountId);
      this.states.set(accountId, state);
    }
    return state;
  }

  private createEmptyState(accountId: string): AccountRuntimeState {
    // Create a minimal config with required defaults to prevent runtime errors
    // when properties are accessed before full initialization
    const emptyConfig: ZTMChatConfig = {
      agentUrl: '',
      permitUrl: '',
      permitSource: 'server',
      meshName: '',
      username: '',
      dmPolicy: 'allow',
      enableGroups: false,
      autoReply: false,
      messagePath: '/',
    };

    return {
      accountId,
      config: emptyConfig,
      apiClient: null,
      connected: false,
      meshConnected: false,
      lastError: null,
      lastStartAt: null,
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 0,
      messageCallbacks: new Set(),
      callbackSemaphore: new Semaphore(CALLBACK_SEMAPHORE_PERMITS),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      allowFromCache: null,
      groupPermissionCache: new GroupPermissionLRUCache(
        MAX_GROUP_PERMISSION_CACHE_SIZE,
        GROUP_PERMISSION_CACHE_TTL_MS
      ),
    };
  }

  /**
   * Remove account state and clean up resources
   */
  remove(accountId: string): void {
    const state = this.states.get(accountId);
    if (state) {
      if (state.watchInterval) {
        clearInterval(state.watchInterval);
        state.watchInterval = null;
      }
      state.messageCallbacks.clear();
      state.pendingPairings.clear();
      state.allowFromCache = null;
      state.groupPermissionCache?.clear();
      this.states.delete(accountId);
    }
  }

  /**
   * Get all states
   */
  getAll(): Map<string, AccountRuntimeState> {
    return this.states;
  }

  /**
   * Clean up expired pending pairings from all accounts
   * Enforces both time-based (expiration) and size-based (max count) limits
   */
  cleanupExpiredPairings(): number {
    const now = Date.now();
    let totalRemoved = 0;

    for (const [accountId, state] of this.states) {
      if (state.pendingPairings.size === 0) continue;

      let removed = 0;
      // Step 1: Remove expired pairings based on time
      for (const [peer, timestamp] of state.pendingPairings) {
        if (now - timestamp.getTime() > PAIRING_MAX_AGE_MS) {
          state.pendingPairings.delete(peer);
          removed++;
        }
      }
      if (removed > 0) {
        this.deps.logger.debug(`[${accountId}] Cleaned up ${removed} expired pairing(s)`);
        totalRemoved += removed;
      }

      // Step 2: Enforce size limit - keep most recent pairings
      if (state.pendingPairings.size > MAX_PAIRINGS_PER_ACCOUNT) {
        const entries = Array.from(state.pendingPairings.entries());
        // Sort by timestamp descending (most recent first)
        entries.sort(([, a], [, b]) => b.getTime() - a.getTime());
        // Keep only the most recent entries
        const toKeep = entries.slice(0, MAX_PAIRINGS_PER_ACCOUNT);
        state.pendingPairings.clear();
        for (const [peer, timestamp] of toKeep) {
          state.pendingPairings.set(peer, timestamp);
        }
        const excess = entries.length - MAX_PAIRINGS_PER_ACCOUNT;
        this.deps.logger.warn(
          `[${accountId}] Pairing limit exceeded (${entries.length}), removed ${excess} oldest entries`
        );
        totalRemoved += excess;
      }
    }

    return totalRemoved;
  }

  /**
   * Get cached allowFrom store or refresh if expired
   */
  async getAllowFromCache(
    accountId: string,
    rt: PluginRuntime | (() => PluginRuntime)
  ): Promise<string[] | null> {
    const runtime = typeof rt === 'function' ? rt() : rt;
    const state = this.states.get(accountId);

    if (!state) {
      try {
        return await runtime.channel.pairing.readAllowFromStore('ztm-chat');
      } catch (err) {
        this.deps.logger.error(
          `[${accountId}] readAllowFromStore failed: ${err instanceof Error ? err.message : String(err)}`
        );
        return null;
      }
    }

    const now = Date.now();

    if (state.allowFromCache && now - state.allowFromCache.timestamp < ALLOW_FROM_CACHE_TTL_MS) {
      return state.allowFromCache.value;
    }

    try {
      const freshAllowFrom = await runtime.channel.pairing.readAllowFromStore('ztm-chat');
      state.allowFromCache = {
        value: freshAllowFrom,
        timestamp: now,
      };
      return freshAllowFrom;
    } catch (err) {
      this.deps.logger.error(
        `[${accountId}] readAllowFromStore failed: ${err instanceof Error ? err.message : String(err)}`
      );
      if (state.allowFromCache) {
        return state.allowFromCache.value;
      }
      return null;
    }
  }

  /**
   * Clear the allowFrom cache for an account
   */
  clearAllowFromCache(accountId: string): void {
    const state = this.states.get(accountId);
    if (state) {
      state.allowFromCache = null;
    }
  }

  /**
   * Get cached group permission or compute and cache if not present
   */
  getGroupPermissionCached(
    accountId: string,
    creator: string,
    group: string,
    config: ZTMChatConfig
  ): GroupPermissions {
    const state = this.states.get(accountId);
    const cacheKey = `${creator}/${group}`;

    if (!state) {
      return getGroupPermission(creator, group, config);
    }

    const cached = state.groupPermissionCache?.get(cacheKey);
    if (cached) {
      return cached;
    }

    const permissions = getGroupPermission(creator, group, config);
    state.groupPermissionCache?.set(cacheKey, permissions);
    return permissions;
  }

  /**
   * Clear the group permission cache for an account
   */
  clearGroupPermissionCache(accountId: string): void {
    const state = this.states.get(accountId);
    if (state) {
      state.groupPermissionCache?.clear();
    }
  }

  /**
   * Initialize runtime for an account
   */
  async initializeRuntime(config: ZTMChatConfig, accountId: string): Promise<boolean> {
    const state = this.getOrCreate(accountId);
    state.config = config;

    // Create API client via DI factory
    const apiClient = this.deps.apiClientFactory(config);

    let meshInfo: ZTMMeshInfo | null = null;

    for (let attempt = 1; attempt <= MESH_CONNECT_MAX_RETRIES; attempt++) {
      const meshResult = await apiClient.getMeshInfo();
      if (!isSuccess(meshResult)) {
        if (attempt < MESH_CONNECT_MAX_RETRIES) {
          this.deps.logger.info(
            `[${accountId}] Mesh info request failed (attempt ${attempt}/${MESH_CONNECT_MAX_RETRIES}), retrying in ${RETRY_DELAY_MS}ms...`
          );
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }
        continue;
      }
      meshInfo = meshResult.value;
      if (meshInfo.connected) break;
      if (attempt < MESH_CONNECT_MAX_RETRIES) {
        this.deps.logger.info(
          `[${accountId}] Mesh not yet connected (attempt ${attempt}/${MESH_CONNECT_MAX_RETRIES}), retrying in ${RETRY_DELAY_MS}ms...`
        );
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }

    if (!meshInfo) {
      state.lastError = 'Failed to get mesh info after retries';
      state.connected = false;
      state.meshConnected = false;
      this.deps.logger.error(`[${accountId}] Initialization failed: ${state.lastError}`);
      return false;
    }

    state.apiClient = apiClient;
    state.connected = true;
    state.meshConnected = meshInfo.connected;
    state.peerCount = meshInfo.endpoints;
    state.lastError = meshInfo.connected ? null : 'Not connected to ZTM mesh';

    this.deps.logger.info(
      `[${accountId}] Connected: mesh=${config.meshName}, peers=${meshInfo.endpoints}`
    );

    return meshInfo.connected;
  }

  /**
   * Stop runtime for an account
   */
  async stopRuntime(accountId: string): Promise<void> {
    const state = this.states.get(accountId);
    if (!state) return;

    if (state.watchInterval) {
      clearInterval(state.watchInterval);
      state.watchInterval = null;
    }

    state.messageCallbacks.clear();
    state.pendingPairings.clear();
    state.allowFromCache = null;
    state.groupPermissionCache?.clear();
    state.apiClient = null;
    state.connected = false;
    state.meshConnected = false;
    state.lastStopAt = new Date();

    getAccountMessageStateStore(accountId).flush();

    this.deps.logger.info(`[${accountId}] Stopped`);
  }
}

// Singleton instance with default dependencies
const accountStateManager = new AccountStateManager({
  apiClientFactory: createZTMApiClient,
  logger: logger,
});

/**
 * Get the AccountStateManager singleton instance.
 *
 * This function provides explicit access to the AccountStateManager,
 * which owns all account runtime states with clear lifecycle management.
 *
 * For DI-based injection, prefer getting this instance through the
 * dependency injection container using getAccountStateManagerService().
 *
 * @returns The AccountStateManager singleton instance
 *
 * @example
 * // Using explicit manager for fine-grained control
 * const manager = getAccountStateManager();
 * const state = manager.getOrCreate('my-account');
 * manager.remove('my-account');
 */
export function getAccountStateManager(): AccountStateManager {
  return accountStateManager;
}

/**
 * Get an existing account state or create a new one.
 *
 * Each account (identified by accountId) has its own isolated runtime state,
 * including API client, connection status, message callbacks, and more.
 *
 * Note: This function delegates to AccountStateManager for explicit state ownership.
 * The AccountStateManager class manages the lifecycle of all account states,
 * including cleanup of resources like intervals and callbacks.
 *
 * @param accountId - Unique identifier for the account
 * @returns AccountRuntimeState for the specified account
 *
 * @example
 * const state = getOrCreateAccountState("my-account");
 * // Returns existing state or creates new empty state
 */
export function getOrCreateAccountState(accountId: string): AccountRuntimeState {
  return accountStateManager.getOrCreate(accountId);
}

/**
 * Remove an account state and clean up resources.
 *
 * This function removes the account from the state map and cleans up
 * any associated resources like watch intervals and message callbacks.
 *
 * Note: This function delegates to AccountStateManager.remove() which
 * performs proper cleanup including:
 * - Clearing watch intervals
 * - Clearing message callbacks
 * - Clearing pending pairings
 * - Clearing group permission cache
 *
 * @param accountId - The account identifier to remove
 *
 * @example
 * removeAccountState("my-account");
 * // Account state is removed and resources are cleaned up
 */
export function removeAccountState(accountId: string): void {
  accountStateManager.remove(accountId);
}

/**
 * Clean up expired pending pairings from all accounts.
 * Removes entries older than PAIRING_MAX_AGE_MS (1 hour).
 * Should be called periodically to prevent unbounded memory growth.
 *
 * @returns Total number of expired pairings removed
 */
export function cleanupExpiredPairings(): number {
  return accountStateManager.cleanupExpiredPairings();
}

/**
 * Get cached allowFrom store or refresh if expired.
 * Uses TTL to avoid redundant async calls every poll/watch cycle.
 *
 * @param accountId - The account identifier
 * @param rt - ZTM runtime to fetch fresh data if cache expired (or function that returns it)
 * @returns Promise resolving to allowFrom string array, or null if fetch failed and no cache available
 */
export async function getAllowFromCache(
  accountId: string,
  rt: PluginRuntime | (() => PluginRuntime)
): Promise<string[] | null> {
  return accountStateManager.getAllowFromCache(accountId, rt);
}

/**
 * Clear the allowFrom cache for an account.
 * Useful when the pairing state changes and needs immediate refresh.
 *
 * @param accountId - The account identifier
 */
export function clearAllowFromCache(accountId: string): void {
  accountStateManager.clearAllowFromCache(accountId);
}

/**
 * Get cached group permission or compute and cache if not present.
 * Uses memoization to avoid repeated lookups for the same group.
 *
 * @param accountId - The account identifier
 * @param creator - Group creator username
 * @param group - Group ID
 * @param config - ZTM Chat configuration
 * @returns GroupPermissions for the specified group
 */
export function getGroupPermissionCached(
  accountId: string,
  creator: string,
  group: string,
  config: ZTMChatConfig
): GroupPermissions {
  return accountStateManager.getGroupPermissionCached(accountId, creator, group, config);
}

/**
 * Clear the group permission cache for an account.
 * Useful when group permissions configuration changes.
 *
 * @param accountId - The account identifier
 */
export function clearGroupPermissionCache(accountId: string): void {
  accountStateManager.clearGroupPermissionCache(accountId);
}

/**
 * Get all account states.
 *
 * @returns Map of accountId to AccountRuntimeState for all managed accounts
 *
 * @example
 * const allStates = getAllAccountStates();
 * for (const [accountId, state] of allStates) {
 *   console.log(`${accountId}: ${state.connected ? "connected" : "disconnected"}`);
 * }
 */
/**
 * Get all account states as a Map.
 *
 * Returns a reference to the internal Map managed by AccountStateManager.
 * Use this for iterating over all active account states.
 *
 * Note: The returned Map is a live reference - changes to account states
 * will be reflected in this Map. For a snapshot, create a new Map from it.
 *
 * @returns Map of accountId to AccountRuntimeState
 *
 * @example
 * const allStates = getAllAccountStates();
 * for (const [accountId, state] of allStates) {
 *   console.log(`${accountId}: ${state.connected ? 'connected' : 'disconnected'}`);
 * }
 */
export function getAllAccountStates(): Map<string, AccountRuntimeState> {
  return accountStateManager.getAll();
}

/**
 * Initialize runtime for an account.
 *
 * This function:
 * 1. Creates or retrieves the account state
 * 2. Initializes the ZTM API client
 * 3. Attempts to connect to the mesh (with retries)
 * 4. Sets up state for message processing
 *
 * @param config - ZTM Chat configuration for this account
 * @param accountId - Unique identifier for the account
 * @returns Promise resolving to true if initialization succeeded, false otherwise
 *
 * @example
 * const success = await initializeRuntime(config, "my-account");
 * if (success) {
 *   console.log("Runtime initialized successfully");
 * }
 */
export async function initializeRuntime(
  config: ZTMChatConfig,
  accountId: string
): Promise<boolean> {
  return accountStateManager.initializeRuntime(config, accountId);
}

// Stop runtime for an account
/**
 * Stop runtime for an account.
 *
 * This function:
 * 1. Clears any watch intervals
 * 2. Clears message callbacks
 * 3. Marks the account as disconnected
 *
 * Note: The account state is NOT removed - call removeAccountState() to fully clean up.
 *
 * @param accountId - The account identifier to stop
 *
 * @example
 * await stopRuntime("my-account");
 * console.log("Runtime stopped");
 */
export async function stopRuntime(accountId: string): Promise<void> {
  return accountStateManager.stopRuntime(accountId);
}
