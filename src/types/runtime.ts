/**
 * ZTM Chat Runtime Types
 * @module types/runtime
 * Runtime state and management types
 */

import type { ZTMChatConfig } from './config.js';
import type { ZTMChatMessage } from './messaging.js';
import type { ZTMApiClient } from './api.js';
import type { GroupPermissions } from './group-policy.js';
import type { Semaphore } from '../utils/concurrency.js';

/**
 * Cache entry with timestamp for TTL tracking
 */
export interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

/**
 * Interface for group permission cache with bounded size and TTL.
 * Implementations must provide:
 * - LRU eviction to prevent unbounded growth
 * - TTL-based expiration to prevent stale data
 *
 * Note: Unlike allowFromCache which uses CacheEntry<T> externally,
 * groupPermissionCache handles TTL internally in the implementation.
 * This design difference is for performance - avoiding object allocation
 * on every cache access.
 */
export interface IGroupPermissionCache {
  /**
   * Get permissions from cache if not expired
   * @returns GroupPermissions if found and not expired, undefined otherwise
   */
  get(key: string): GroupPermissions | undefined;
  /**
   * Check if key exists in cache and is not expired
   */
  has(key: string): boolean;
  /**
   * Set permissions in cache with TTL
   */
  set(key: string, permissions: GroupPermissions): void;
  /**
   * Clear all cached entries
   */
  clear(): void;
  /**
   * Get current cache size (after expired entry eviction)
   */
  size(): number;
}

/**
 * Message callback type - must be async
 */
export type MessageCallback = (message: ZTMChatMessage) => Promise<void>;

/**
 * Runtime state per account
 */
export interface AccountRuntimeState {
  accountId: string;
  config: ZTMChatConfig;
  apiClient: ZTMApiClient | null;
  // Connection status tracking for network resilience tests
  // connected: API client connectivity status
  // meshConnected: ZTM mesh network connectivity status
  connected?: boolean;
  meshConnected?: boolean;
  started?: boolean; // Process running state: watcher is active
  lastError: string | null;
  lastStartAt: Date | null;
  lastStopAt: Date | null;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  messageCallbacks: Set<MessageCallback>;
  // Semaphore for controlling concurrent callback execution
  // Prevents slow callbacks from blocking the watch loop
  // Not required in test fixtures - initialized in getOrCreateAccountState
  callbackSemaphore?: Semaphore;
  watchInterval: ReturnType<typeof setInterval> | null;
  watchAbortController?: AbortController;
  watchErrorCount: number;
  // Kept for test compatibility - not actively used in simplified flow
  pendingPairings: Map<string, Date>;
  // Cached allowFrom store to avoid redundant async calls every poll/watch cycle
  // Not required in test fixtures - initialized in getOrCreateAccountState
  allowFromCache?: CacheEntry<string[]> | null;
  // Cached group permissions to avoid repeated lookups
  // Uses LRU cache with bounded size to prevent unbounded memory growth
  // Accepts Map for test compatibility, runtime always uses LRU cache
  // Not required in test fixtures - initialized in getOrCreateAccountState
  groupPermissionCache?: Map<string, GroupPermissions> | IGroupPermissionCache;
}
