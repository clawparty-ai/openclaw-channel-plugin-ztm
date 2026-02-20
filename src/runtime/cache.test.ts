// Unit tests for GroupPermissionLRUCache

import { describe, it, expect } from 'vitest';
import { GroupPermissionLRUCache } from './cache.js';
import type { GroupPermissions, GroupPolicy } from '../types/group-policy.js';

function createTestPermissions(override?: Partial<GroupPermissions>): GroupPermissions {
  return {
    creator: 'test-creator',
    group: 'test-group',
    groupPolicy: 'open' as GroupPolicy,
    requireMention: false,
    allowFrom: [],
    ...override,
  };
}

describe('GroupPermissionLRUCache', () => {
  describe('constructor', () => {
    it('should create cache with default parameters', () => {
      const cache = new GroupPermissionLRUCache();
      expect(cache.size()).toBe(0);
    });

    it('should create cache with custom maxSize and ttlMs', () => {
      const cache = new GroupPermissionLRUCache(100, 5000);
      expect(cache.size()).toBe(0);
    });

    it('should throw error for invalid maxSize', () => {
      expect(() => new GroupPermissionLRUCache(0)).toThrow('maxSize must be positive');
      expect(() => new GroupPermissionLRUCache(-1)).toThrow('maxSize must be positive');
    });

    it('should throw error for invalid ttlMs', () => {
      expect(() => new GroupPermissionLRUCache(10, 0)).toThrow('ttlMs must be positive');
      expect(() => new GroupPermissionLRUCache(10, -1)).toThrow('ttlMs must be positive');
    });
  });

  describe('set and get', () => {
    it('should store and retrieve permissions', () => {
      const cache = new GroupPermissionLRUCache(10, 60000);
      cache.set('group1', createTestPermissions({ groupPolicy: 'open' as GroupPolicy }));

      const result = cache.get('group1');
      expect(result).toEqual(createTestPermissions({ groupPolicy: 'open' as GroupPolicy }));
    });

    it('should return undefined and delete expired entry on get', async () => {
      const cache = new GroupPermissionLRUCache(10, 50); // 50ms TTL
      cache.set('group1', createTestPermissions());

      // Wait for entry to expire
      await new Promise(resolve => setTimeout(resolve, 60));

      const result = cache.get('group1');
      expect(result).toBeUndefined();
    });

    it('should return undefined for missing key', () => {
      const cache = new GroupPermissionLRUCache(10, 60000);
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should update existing entry', () => {
      const cache = new GroupPermissionLRUCache(10, 60000);
      cache.set('group1', createTestPermissions({ groupPolicy: 'open' as GroupPolicy }));
      cache.set('group1', createTestPermissions({ groupPolicy: 'disabled' as GroupPolicy }));

      const result = cache.get('group1');
      expect(result).toEqual(createTestPermissions({ groupPolicy: 'disabled' as GroupPolicy }));
    });
  });

  describe('has', () => {
    it('should return true for existing key', () => {
      const cache = new GroupPermissionLRUCache(10, 60000);
      cache.set('group1', createTestPermissions({ groupPolicy: 'open' as GroupPolicy }));

      expect(cache.has('group1')).toBe(true);
    });

    it('should return false for missing key', () => {
      const cache = new GroupPermissionLRUCache(10, 60000);
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should return false for expired entry', async () => {
      const cache = new GroupPermissionLRUCache(10, 50); // 50ms TTL
      cache.set('group1', createTestPermissions({ groupPolicy: 'open' as GroupPolicy }));

      // Wait for entry to expire
      await new Promise(resolve => setTimeout(resolve, 60));

      expect(cache.has('group1')).toBe(false);
    });

    it('should clean up expired entry and return false', async () => {
      const cache = new GroupPermissionLRUCache(10, 50); // 50ms TTL
      cache.set('group1', createTestPermissions());

      // Wait for entry to expire
      await new Promise(resolve => setTimeout(resolve, 60));

      // has() should clean up expired entry and return false
      const result = cache.has('group1');
      expect(result).toBe(false);

      // Verify entry was actually deleted (size should be 0)
      expect(cache.size()).toBe(0);
    });
  });

  describe('size', () => {
    it('should return 0 for empty cache', () => {
      const cache = new GroupPermissionLRUCache(10, 60000);
      expect(cache.size()).toBe(0);
    });

    it('should return correct size after adding entries', () => {
      const cache = new GroupPermissionLRUCache(10, 60000);
      cache.set('group1', createTestPermissions({ groupPolicy: 'open' as GroupPolicy }));
      cache.set('group2', createTestPermissions({ groupPolicy: 'disabled' as GroupPolicy }));

      expect(cache.size()).toBe(2);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      const cache = new GroupPermissionLRUCache(10, 60000);
      cache.set('group1', createTestPermissions({ groupPolicy: 'open' as GroupPolicy }));
      cache.set('group2', createTestPermissions({ groupPolicy: 'disabled' as GroupPolicy }));
      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.get('group1')).toBeUndefined();
      expect(cache.get('group2')).toBeUndefined();
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used entry when cache is full', async () => {
      const cache = new GroupPermissionLRUCache(3, 60000);
      cache.set('group1', createTestPermissions({ groupPolicy: 'open' as GroupPolicy }));
      await new Promise(resolve => setTimeout(resolve, 1));
      cache.set('group2', createTestPermissions({ groupPolicy: 'disabled' as GroupPolicy }));
      await new Promise(resolve => setTimeout(resolve, 1));
      cache.set('group3', createTestPermissions({ groupPolicy: 'allowlist' as GroupPolicy }));

      // Access group1 to make it recently used
      cache.get('group1');

      // Add new entry, should evict group2 (LRU)
      cache.set('group4', createTestPermissions({ groupPolicy: 'open' as GroupPolicy }));

      expect(cache.has('group1')).toBe(true);
      expect(cache.has('group2')).toBe(false);
      expect(cache.has('group3')).toBe(true);
      expect(cache.has('group4')).toBe(true);
    });

    it('should not evict when updating existing key', () => {
      const cache = new GroupPermissionLRUCache(2, 60000);
      cache.set('group1', createTestPermissions({ groupPolicy: 'open' as GroupPolicy }));
      cache.set('group2', createTestPermissions({ groupPolicy: 'disabled' as GroupPolicy }));

      // Update existing key should not trigger eviction
      cache.set('group1', createTestPermissions({ groupPolicy: 'allowlist' as GroupPolicy }));

      expect(cache.size()).toBe(2);
      expect(cache.has('group1')).toBe(true);
      expect(cache.has('group2')).toBe(true);
    });

    it('should respect maxSize boundary', () => {
      const maxSize = 100;
      const cache = new GroupPermissionLRUCache(maxSize, 60000);

      // Add more entries than maxSize
      for (let i = 0; i < maxSize + 50; i++) {
        cache.set(`group${i}`, createTestPermissions({ groupPolicy: 'open' as GroupPolicy }));
      }

      // Size should not exceed maxSize
      expect(cache.size()).toBeLessThanOrEqual(maxSize);
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      const cache = new GroupPermissionLRUCache(10, 50); // 50ms TTL
      cache.set('group1', createTestPermissions({ groupPolicy: 'open' as GroupPolicy }));

      // Entry should exist before expiration
      expect(cache.get('group1')).toEqual(
        createTestPermissions({ groupPolicy: 'open' as GroupPolicy })
      );

      // Wait for entry to expire
      await new Promise(resolve => setTimeout(resolve, 60));

      // Entry should be expired
      expect(cache.get('group1')).toBeUndefined();
    });

    it('should not return expired entries from has', async () => {
      const cache = new GroupPermissionLRUCache(10, 50);
      cache.set('group1', createTestPermissions({ groupPolicy: 'open' as GroupPolicy }));

      await new Promise(resolve => setTimeout(resolve, 60));

      expect(cache.has('group1')).toBe(false);
    });

    it('should evict expired entries on set', async () => {
      const cache = new GroupPermissionLRUCache(2, 50);
      cache.set('group1', createTestPermissions({ groupPolicy: 'open' as GroupPolicy }));
      cache.set('group2', createTestPermissions({ groupPolicy: 'disabled' as GroupPolicy }));

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 60));

      // Adding new entry should trigger eviction of expired entries
      cache.set('group3', createTestPermissions({ groupPolicy: 'allowlist' as GroupPolicy }));

      // group1 and group2 should be expired, group3 should exist
      expect(cache.size()).toBe(1);
      expect(cache.has('group3')).toBe(true);
    });
  });

  describe('memory growth boundary', () => {
    it('should not grow unbounded with many entries', () => {
      const maxSize = 500;
      const cache = new GroupPermissionLRUCache(maxSize, 60000);

      // Simulate adding 10000 entries (20x the maxSize)
      for (let i = 0; i < 10000; i++) {
        cache.set(`group${i}`, createTestPermissions({ groupPolicy: 'open' as GroupPolicy }));
      }

      // Cache size should be bounded
      const size = cache.size();
      expect(size).toBeLessThanOrEqual(maxSize);

      // Oldest entries should have been evicted
      expect(cache.has('group0')).toBe(false);
      expect(cache.has('group9900')).toBe(true);
    });

    it('should handle rapid set operations efficiently', () => {
      const cache = new GroupPermissionLRUCache(100, 60000);
      const startTime = performance.now();

      // Rapidly add entries
      for (let i = 0; i < 1000; i++) {
        cache.set(`key${i}`, createTestPermissions({ groupPolicy: 'open' as GroupPolicy }));
      }

      const endTime = performance.now();
      // Should complete in reasonable time (< 100ms for 1000 operations)
      expect(endTime - startTime).toBeLessThan(100);
    });
  });
});
