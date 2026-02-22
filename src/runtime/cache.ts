/**
 * @fileoverview Cache utilities for runtime state management
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
   * @param key - Cache key (format: "creator/group")
   * @returns Cached permissions or undefined if not found/expired
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
   * @param key - Cache key (format: "creator/group")
   * @returns true if key exists and is not expired, false otherwise
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
   * @param key - Cache key (format: "creator/group")
   * @param permissions - Group permissions to cache
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
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the number of entries in the cache (excludes expired entries)
   * @returns Number of valid cache entries
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
