// Cache utilities for runtime state management
// Provides bounded caches with TTL support

import { logger } from '../utils/logger.js';
import type { GroupPermissions } from '../types/group-policy.js';
import { MAX_GROUP_PERMISSION_CACHE_SIZE, GROUP_PERMISSION_CACHE_TTL_MS } from '../constants.js';

/**
 * LRU Cache for group permissions with bounded size and TTL.
 * Prevents unbounded memory growth by evicting least recently used entries
 * and expired entries.
 */
export class GroupPermissionLRUCache {
  private cache = new Map<
    string,
    { permissions: GroupPermissions; accessOrder: number; expiresAt: number }
  >();
  private maxSize: number;
  private ttlMs: number;
  private accessCounter = 0;

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
   * Evict expired entries and return current cache size
   */
  private evictExpired(): number {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
      }
    }
    return this.cache.size;
  }

  /**
   * Evict least recently used entry to make room for new entry
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let oldestOrder = Infinity;

    for (const [cacheKey, entry] of this.cache.entries()) {
      if (entry.accessOrder < oldestOrder) {
        lruKey = cacheKey;
        oldestOrder = entry.accessOrder;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      logger.debug(`Evicted LRU group permission cache entry: ${lruKey}`);
    }
  }

  get(key: string): GroupPermissions | undefined {
    // First evict any expired entries
    this.evictExpired();

    const entry = this.cache.get(key);
    if (entry) {
      // Check if entry has expired
      if (entry.expiresAt < Date.now()) {
        this.cache.delete(key);
        return undefined;
      }
      // Update access order for LRU (using counter for deterministic ordering)
      entry.accessOrder = ++this.accessCounter;
      return entry.permissions;
    }
    return undefined;
  }

  has(key: string): boolean {
    this.evictExpired();
    const entry = this.cache.get(key);
    if (entry && entry.expiresAt >= Date.now()) {
      return true;
    }
    // Clean up expired entry if present
    if (entry) {
      this.cache.delete(key);
    }
    return false;
  }

  set(key: string, permissions: GroupPermissions): void {
    // First evict expired entries
    this.evictExpired();

    // Evict LRU entries until we have room
    while (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const now = Date.now();
    this.cache.set(key, {
      permissions,
      accessOrder: ++this.accessCounter,
      expiresAt: now + this.ttlMs,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    this.evictExpired();
    return this.cache.size;
  }
}
