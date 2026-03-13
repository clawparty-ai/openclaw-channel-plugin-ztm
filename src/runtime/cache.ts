/**
 * Cache utilities for runtime state management
 * @module runtime/cache
 * Provides bounded caches with TTL support for group permissions
 */

import { logger } from '../utils/logger.js';
import type { GroupPermissions } from '../types/group-policy.js';
import { MAX_GROUP_PERMISSION_CACHE_SIZE, GROUP_PERMISSION_CACHE_TTL_MS } from '../constants.js';

/**
 * LRU Cache for group permissions with bounded size and TTL.
 * Prevents unbounded memory growth by evicting least recently used entries
 * and expired entries.
 *
 * Uses JavaScript Map's insertion order for O(1) LRU operations:
 * - Most recent entry is at the end of the Map
 * - Least recent entry is at the beginning of the Map
 * - Accessing an entry moves it to the end (most recently used)
 *
 * TTL eviction is amortized O(1) using lazy expiration checking.
 */
/**
 * @internal
 */
export class GroupPermissionLRUCache {
  // Map maintains insertion order: [oldest, ..., newest]
  // This enables O(1) LRU eviction by deleting the first entry
  private cache = new Map<string, { permissions: GroupPermissions; expiresAt: number }>();
  private maxSize: number;
  private ttlMs: number;

  constructor(
    maxSize: number = MAX_GROUP_PERMISSION_CACHE_SIZE,
    ttlMs: number = GROUP_PERMISSION_CACHE_TTL_MS
  ) {
    if (maxSize <= 0) {
      throw new Error(`maxSize must be positive, got: ${maxSize}`);
    }
    if (ttlMs <= 0) {
      throw new Error(`ttlMs must be positive, got: ${ttlMs}`);
    }
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Check if a single entry is expired (O(1))
   */
  private isExpired(entry: { expiresAt: number }): boolean {
    return entry.expiresAt < Date.now();
  }

  /**
   * Evict oldest (least recently used) entry - O(1)
   * Map.entries().next().value gives the first entry (oldest due to insertion order)
   */
  private evictLRU(): void {
    const firstKey = this.cache.keys().next().value;
    if (firstKey !== undefined) {
      this.cache.delete(firstKey);
      logger.debug(`Evicted LRU group permission cache entry: ${firstKey}`);
    }
  }

  /**
   * Get cached group permissions for a key
   *
   * Retrieves cached permissions if available and not expired.
   * Automatically performs lazy expiration and LRU update on access.
   *
   * @param key - Cache key (format: "creator/group")
   * @returns Cached permissions or undefined if not found/expired
   *
   * @example
   * ```typescript
   * const perms = cache.get('alice/project-alpha');
   * if (perms) {
   *   console.log('Group policy:', perms.groupPolicy);
   * }
   * ```
   *
   * @complexity O(1) - Constant time map access with LRU update
   * @performance Lazy expiration check only on access, not background scan
   * @since 2026.3.13
   * @see {@link set} For setting cache entries
   * @see {@link has} For existence check without LRU update
   */
  get(key: string): GroupPermissions | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    // Check if entry has expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return undefined;
    }

    // O(1) LRU update: delete and re-insert moves entry to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.permissions;
  }

  /**
   * Check if a key exists in cache and is not expired
   *
   * Performs existence check without triggering LRU update.
   * Useful for validation without affecting cache order.
   *
   * @param key - Cache key (format: "creator/group")
   * @returns true if key exists and is not expired, false otherwise
   *
   * @example
   * ```typescript
   * if (cache.has('alice/project-alpha')) {
   *   console.log('Permissions are cached');
   * }
   * ```
   *
   * @complexity O(1) - Constant time map lookup
   * @performance Does not update LRU order (unlike get())
   * @since 2026.3.13
   * @see {@link get} For retrieving with LRU update
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Set group permissions in cache
   *
   * Stores permissions with TTL and manages cache size by evicting
   * LRU entries when the cache is full. Existing keys are moved to MRU position.
   *
   * @param key - Cache key (format: "creator/group")
   * @param permissions - Group permissions to cache
   *
   * @example
   * ```typescript
   * cache.set('alice/project-alpha', {
   *   creator: 'alice',
   *   group: 'project-alpha',
   *   groupPolicy: 'open',
   *   requireMention: true,
   *   allowFrom: [],
   * });
   * ```
   *
   * @complexity O(k) - Where k is number of evictions (amortized O(1))
   * @performance Evicts LRU entries until space available, then O(1) insertion
   * @since 2026.3.13
   * @see {@link get} For retrieving cached entries
   * @see {@link clear} For clearing all cache entries
   */
  set(key: string, permissions: GroupPermissions): void {
    // If key exists, delete it first (will be re-added at end)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict LRU entries until we have room - O(1) per eviction
    while (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    const now = Date.now();
    this.cache.set(key, {
      permissions,
      expiresAt: now + this.ttlMs,
    });
  }

  /**
   * Clear all entries from the cache
   *
   * Removes all cached permissions and resets the cache to empty state.
   *
   * @example
   * ```typescript
   * cache.clear();
   * console.log('Cache cleared, size:', cache.size());
   * ```
   *
   * @complexity O(n) - Where n is the cache size (Map.clear operation)
   * @since 2026.3.13
   * @see {@link size} For getting cache size
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the number of entries in the cache (excludes expired entries)
   *
   * Performs lazy expiration check on the oldest entry only.
   * This keeps size() O(1) amortized instead of O(n) full scan.
   *
   * @returns Number of valid cache entries
   *
   * @example
   * ```typescript
   * const count = cache.size();
   * console.log(`Cache has ${count} entries`);
   * ```
   *
   * @complexity O(1) - Amortized constant time with lazy expiration
   * @performance Only checks oldest entry for expiration, not full scan
   * @since 2026.3.13
   * @see {@link clear} For clearing cache entries
   */
  size(): number {
    // Lazy expiration: only check first entry (oldest)
    // This keeps size() O(1) amortized instead of O(n)
    const firstEntry = this.cache.entries().next().value;
    if (firstEntry) {
      const [key, entry] = firstEntry;
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        // Check if more expired entries at the start
        return this.size(); // Recursive but O(1) amortized
      }
    }
    return this.cache.size;
  }
}
