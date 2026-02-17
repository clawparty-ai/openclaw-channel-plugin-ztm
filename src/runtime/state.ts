// Account runtime state management
// Manages runtime state for multiple ZTM Chat accounts
//
// This module provides:
// - Multi-account state storage using a Map
// - Account initialization and cleanup
// - Runtime start/stop operations
// - State retrieval utilities

import { logger } from '../utils/logger.js';
import { getAccountMessageStateStore } from './store.js';
import { GroupPermissionLRUCache } from './cache.js';
import type { PluginRuntime } from 'openclaw/plugin-sdk';
import { createZTMApiClient } from '../api/ztm-api.js';
import type { ZTMChatConfig } from '../types/config.js';
import type { ZTMMeshInfo } from '../types/api.js';
import type { AccountRuntimeState } from '../types/runtime.js';
import type { GroupPermissions } from '../types/group-policy.js';
import { getGroupPermission } from '../core/group-policy.js';
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
} from '../constants.js';

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
    return {
      accountId,
      config: {} as ZTMChatConfig,
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
   */
  cleanupExpiredPairings(): number {
    const now = Date.now();
    let totalRemoved = 0;

    for (const [accountId, state] of this.states) {
      if (state.pendingPairings.size === 0) continue;

      let removed = 0;
      for (const [peer, timestamp] of state.pendingPairings) {
        if (now - timestamp.getTime() > PAIRING_MAX_AGE_MS) {
          state.pendingPairings.delete(peer);
          removed++;
        }
      }
      if (removed > 0) {
        logger.debug(`[${accountId}] Cleaned up ${removed} expired pairing(s)`);
        totalRemoved += removed;
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
        logger.error(
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
      logger.error(
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

    const apiClient = createZTMApiClient(config);

    let meshInfo: ZTMMeshInfo | null = null;

    for (let attempt = 1; attempt <= MESH_CONNECT_MAX_RETRIES; attempt++) {
      const meshResult = await apiClient.getMeshInfo();
      if (!isSuccess(meshResult)) {
        if (attempt < MESH_CONNECT_MAX_RETRIES) {
          logger.info(
            `[${accountId}] Mesh info request failed (attempt ${attempt}/${MESH_CONNECT_MAX_RETRIES}), retrying in ${RETRY_DELAY_MS}ms...`
          );
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }
        continue;
      }
      meshInfo = meshResult.value;
      if (meshInfo.connected) break;
      if (attempt < MESH_CONNECT_MAX_RETRIES) {
        logger.info(
          `[${accountId}] Mesh not yet connected (attempt ${attempt}/${MESH_CONNECT_MAX_RETRIES}), retrying in ${RETRY_DELAY_MS}ms...`
        );
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }

    if (!meshInfo) {
      state.lastError = 'Failed to get mesh info after retries';
      state.connected = false;
      state.meshConnected = false;
      logger.error(`[${accountId}] Initialization failed: ${state.lastError}`);
      return false;
    }

    state.apiClient = apiClient;
    state.connected = true;
    state.meshConnected = meshInfo.connected;
    state.peerCount = meshInfo.endpoints;
    state.lastError = meshInfo.connected ? null : 'Not connected to ZTM mesh';

    logger.info(`[${accountId}] Connected: mesh=${config.meshName}, peers=${meshInfo.endpoints}`);

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

    logger.info(`[${accountId}] Stopped`);
  }
}

// Singleton instance
const accountStateManager = new AccountStateManager();

/**
 * Get the AccountStateManager singleton instance
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
