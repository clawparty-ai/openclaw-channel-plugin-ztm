/**
 * Account runtime state management
 * @module runtime/state
 * Manages runtime state for multiple ZTM Chat accounts
 *
 * This module provides:
 * - AccountStateManager class: Explicit state ownership with clear lifecycle
 * - Module-level convenience functions wrapping AccountStateManager
 * - Account initialization and cleanup
 * - Runtime start/stop operations
 *
 * Architecture Note:
 * The AccountStateManager class provides explicit state ownership with a clear lifecycle.
 * Module-level functions (getOrCreateAccountState, removeAccountState, getAllAccountStates)
 * delegate to the AccountStateManager singleton.
 * For DI-based injection, use getAccountStateManager() to obtain the manager instance.
 */

// External dependencies - these will use DI
import { createZTMApiClient } from '../api/ztm-api.js';
import { logger, type Logger } from '../utils/logger.js';
import type { IChatReader, IChatSender, IDiscovery } from '../di/container.js';

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
  ALLOW_FROM_CACHE_TTL_MS,
  MAX_GROUP_PERMISSION_CACHE_SIZE,
  GROUP_PERMISSION_CACHE_TTL_MS,
  MESH_CONNECT_MAX_RETRIES,
  RETRY_DELAY_MS,
  CALLBACK_SEMAPHORE_PERMITS,
} from '../constants.js';

// Dependencies interface for AccountStateManager
interface AccountStateManagerDeps {
  apiClientFactory: (config: ZTMChatConfig) => ZTMApiClient;
  logger: Logger;
}

// Re-export types and cache
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

  // Request coalescing maps to prevent cache stampede
  // When cache expires, only one request rebuilds while others wait for the result
  private allowFromFetchPromises = new Map<string, Promise<string[] | null>>();
  private groupPermissionFetchPromises = new Map<string, Promise<GroupPermissions>>();

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
    };

    return {
      accountId,
      config: emptyConfig,
      chatReader: null,
      chatSender: null,
      discovery: null,
      started: false,
      lastError: null,
      lastStartAt: null,
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      messageCallbacks: new Set(),
      callbackSemaphore: new Semaphore(CALLBACK_SEMAPHORE_PERMITS),
      watchInterval: null,
      watchErrorCount: 0,
      allowFromCache: null,
      groupPermissionCache: new GroupPermissionLRUCache(
        MAX_GROUP_PERMISSION_CACHE_SIZE,
        GROUP_PERMISSION_CACHE_TTL_MS
      ),
      messageRetries: new Map(),
    };
  }

  /**
   * Clear all timers from account state
   * Extracted to reduce duplication between remove() and stopRuntime()
   */
  private clearTimers(state: AccountRuntimeState): void {
    if (state.messageRetries) {
      for (const timerId of state.messageRetries.values()) {
        clearTimeout(timerId);
      }
      state.messageRetries.clear();
    }
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
      if (state.watchAbortController) {
        state.watchAbortController.abort();
        state.watchAbortController = undefined;
      }
      state.messageCallbacks.clear();
      state.allowFromCache = null;
      state.groupPermissionCache?.clear();
      // Clear all timers
      this.clearTimers(state);
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
   * Get cached allowFrom store or refresh if expired
   *
   * Returns:
   * - string[]: Valid result (may be empty if no approved users)
   * - null: Error occurred (logged), caller should use getOrDefault to provide fallback
   *
   * Note: This uses graceful degradation - errors are logged but don't throw.
   * Callers should use getOrDefault(result, []) to provide fallback values.
   *
   * Uses request coalescing to prevent cache stampede - multiple concurrent
   * requests will share a single fetch operation.
   */
  async getAllowFromCache(
    accountId: string,
    rt: PluginRuntime | (() => PluginRuntime)
  ): Promise<string[] | null> {
    const runtime = typeof rt === 'function' ? rt() : rt;
    const state = this.states.get(accountId);

    // If no state, fetch directly without caching
    if (!state) {
      try {
        return await runtime.channel.pairing.readAllowFromStore({ channel: 'ztm-chat', accountId });
      } catch (err) {
        this.deps.logger.error(
          `[${accountId}] readAllowFromStore failed: ${err instanceof Error ? err.message : String(err)}`
        );
        return null;
      }
    }

    const now = Date.now();

    // Return cached value if still valid
    if (state.allowFromCache && now - state.allowFromCache.timestamp < ALLOW_FROM_CACHE_TTL_MS) {
      return state.allowFromCache.value;
    }

    // Check if there's already an in-flight request - coalesce requests
    const existingPromise = this.allowFromFetchPromises.get(accountId);
    if (existingPromise) {
      // Wait for the existing request to complete
      const result = await existingPromise;
      // Update cache with the result (timestamp may be different but value is still valid)
      if (result !== null) {
        state.allowFromCache = { value: result, timestamp: now };
      }
      return result;
    }

    // Create new fetch promise and store it to coalesce concurrent requests
    const fetchPromise = (async (): Promise<string[] | null> => {
      try {
        const freshAllowFrom = await runtime.channel.pairing.readAllowFromStore({
          channel: 'ztm-chat',
          accountId,
        });
        state.allowFromCache = {
          value: freshAllowFrom,
          timestamp: Date.now(),
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
      } finally {
        // Remove the promise after completion to allow future fetches
        this.allowFromFetchPromises.delete(accountId);
      }
    })();

    this.allowFromFetchPromises.set(accountId, fetchPromise);
    return fetchPromise;
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
   *
   * Uses request coalescing to prevent cache stampede - multiple concurrent
   * requests for the same group will share the computation result.
   *
   * Note: getGroupPermission is synchronous, but we still use coalescing
   * for consistency and to handle the case where it might become async in future.
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

    // Return cached value if present
    const cached = state.groupPermissionCache?.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Check if there's already an in-flight computation
    const existingPromise = this.groupPermissionFetchPromises.get(cacheKey);
    if (existingPromise) {
      // Wait for the existing computation and cache the result
      const result = getGroupPermission(creator, group, config);
      state.groupPermissionCache?.set(cacheKey, result);
      return result;
    }

    // Create new computation and track it
    const permissions = getGroupPermission(creator, group, config);
    this.groupPermissionFetchPromises.set(cacheKey, Promise.resolve(permissions));

    state.groupPermissionCache?.set(cacheKey, permissions);

    // Clean up after a tick
    Promise.resolve().then(() => this.groupPermissionFetchPromises.delete(cacheKey));

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
      this.deps.logger.error(`[${accountId}] Initialization failed: ${state.lastError}`);
      return false;
    }

    state.chatReader = apiClient as unknown as IChatReader;
    state.chatSender = apiClient as unknown as IChatSender;
    state.discovery = apiClient as unknown as IDiscovery;
    state.started = true;
    state.lastError = meshInfo.connected ? null : 'Not connected to ZTM mesh';

    this.deps.logger.info(`[${accountId}] Connected: mesh=${config.meshName}`);

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

    if (state.watchAbortController) {
      state.watchAbortController.abort();
      state.watchAbortController = undefined;
    }

    state.messageCallbacks.clear();
    state.allowFromCache = null;
    state.groupPermissionCache?.clear();
    // Clear all timers
    this.clearTimers(state);
    state.chatReader = null;
    state.chatSender = null;
    state.discovery = null;
    state.started = false;
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
