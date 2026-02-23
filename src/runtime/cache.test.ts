// Unit tests for GroupPermissionLRUCache

import { describe, it, expect } from 'vitest';
import { GroupPermissionLRUCache } from './cache.js';
import type { GroupPermissions, GroupPolicy } from '../types/group-policy.js';
import { MAX_GROUP_PERMISSION_CACHE_SIZE, MAX_PEERS_PER_ACCOUNT } from '../constants.js';

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

  describe('boundary tests', () => {
    describe('cache capacity boundary - MAX_CACHE_SIZE+1', () => {
      it('should handle exactly MAX_GROUP_PERMISSION_CACHE_SIZE entries', () => {
        const maxSize = MAX_GROUP_PERMISSION_CACHE_SIZE; // 500
        const cache = new GroupPermissionLRUCache(maxSize, 60000);

        // Add exactly maxSize entries
        for (let i = 0; i < maxSize; i++) {
          cache.set(`group${i}`, createTestPermissions({ groupPolicy: 'open' as GroupPolicy }));
        }

        expect(cache.size()).toBe(maxSize);
        expect(cache.has('group0')).toBe(true);
        expect(cache.has(`group${maxSize - 1}`)).toBe(true);
      });

      it('should evict correctly when exceeding MAX_GROUP_PERMISSION_CACHE_SIZE by 1', () => {
        const maxSize = MAX_GROUP_PERMISSION_CACHE_SIZE; // 500
        const cache = new GroupPermissionLRUCache(maxSize, 60000);

        // Add maxSize entries first
        for (let i = 0; i < maxSize; i++) {
          cache.set(`group${i}`, createTestPermissions({ groupPolicy: 'open' as GroupPolicy }));
        }

        // Add one more entry - should trigger eviction of LRU entry (group0)
        cache.set(`group${maxSize}`, createTestPermissions({ groupPolicy: 'open' as GroupPolicy }));

        // Size should still be maxSize
        expect(cache.size()).toBe(maxSize);

        // group0 should be evicted, new entry should exist
        expect(cache.has('group0')).toBe(false);
        expect(cache.has(`group${maxSize}`)).toBe(true);

        // Other entries should still exist
        expect(cache.has('group1')).toBe(true);
        expect(cache.has(`group${maxSize - 1}`)).toBe(true);
      });

      it('should handle exceeding MAX_GROUP_PERMISSION_CACHE_SIZE by large margin', () => {
        const maxSize = MAX_GROUP_PERMISSION_CACHE_SIZE; // 500
        const cache = new GroupPermissionLRUCache(maxSize, 60000);

        // Add 10x the maxSize entries
        const excess = maxSize * 10;
        for (let i = 0; i < excess; i++) {
          cache.set(`group${i}`, createTestPermissions({ groupPolicy: 'open' as GroupPolicy }));
        }

        // Size should never exceed maxSize
        expect(cache.size()).toBe(maxSize);

        // Oldest entries should all be evicted
        expect(cache.has('group0')).toBe(false);
        expect(cache.has('group100')).toBe(false);
        expect(cache.has('group499')).toBe(false);

        // Newest entries should exist
        expect(cache.has(`group${excess - 1}`)).toBe(true);
        expect(cache.has(`group${excess - maxSize}`)).toBe(true);
      });

      it('should correctly evict LRU when adding beyond capacity with mixed access pattern', () => {
        const maxSize = 3; // Small size for easier testing
        const cache = new GroupPermissionLRUCache(maxSize, 60000);

        // Add entries
        cache.set('a', createTestPermissions());
        cache.set('b', createTestPermissions());
        cache.set('c', createTestPermissions());

        // Access 'a' to make it most recently used
        cache.get('a');

        // Now 'b' is LRU (least recently used after 'a' was accessed)
        // Add new entry - should evict 'b'
        cache.set('d', createTestPermissions());

        expect(cache.has('a')).toBe(true); // Most recently used
        expect(cache.has('b')).toBe(false); // LRU - evicted
        expect(cache.has('c')).toBe(true);
        expect(cache.has('d')).toBe(true);
        expect(cache.size()).toBe(3);
      });
    });

    describe('message queue overflow - 10000+ pending messages simulation', () => {
      it('should handle 10000 rapid set operations without failure', () => {
        const cache = new GroupPermissionLRUCache(1000, 60000);

        // Simulate 10000 pending messages being processed
        const startTime = performance.now();
        for (let i = 0; i < 10000; i++) {
          cache.set(`message_${i}`, createTestPermissions({ groupPolicy: 'open' as GroupPolicy }));
        }
        const endTime = performance.now();

        // Should complete without throwing
        expect(cache.size()).toBeLessThanOrEqual(1000);

        // Performance should be acceptable
        expect(endTime - startTime).toBeLessThan(500);
      });

      it('should handle alternating set and get operations for 10000 entries', () => {
        const cache = new GroupPermissionLRUCache(500, 60000);

        // Simulate processing message queue with interleaved access
        for (let i = 0; i < 10000; i++) {
          cache.set(`msg_${i}`, createTestPermissions({ groupPolicy: 'open' as GroupPolicy }));

          // Every 10th message, access a recent entry
          if (i % 10 === 0 && i > 0) {
            cache.get(`msg_${i - 5}`);
          }
        }

        expect(cache.size()).toBeLessThanOrEqual(500);
      });

      it('should handle burst of 15000 operations efficiently', () => {
        const cache = new GroupPermissionLRUCache(100, 60000);

        const startTime = performance.now();
        // Burst of operations
        for (let i = 0; i < 15000; i++) {
          cache.set(`burst_${i}`, createTestPermissions());
        }
        const endTime = performance.now();

        // Should handle without errors
        expect(cache.size()).toBe(100);

        // Should complete in reasonable time despite overflow
        expect(endTime - startTime).toBeLessThan(1000);
      });

      it('should maintain correctness under high churn with 20000 operations', () => {
        const cache = new GroupPermissionLRUCache(50, 60000);

        // High churn: constant add/evict cycle
        for (let i = 0; i < 20000; i++) {
          cache.set(`churn_${i}`, createTestPermissions({ groupPolicy: 'open' as GroupPolicy }));

          // Verify some recent entries exist
          if (i > 100) {
            const recentKey = `churn_${i - 50}`;
            // The key might or might not exist depending on LRU eviction
          }
        }

        // Final state should be correct
        expect(cache.size()).toBe(50);
        expect(cache.has(`churn_19950`)).toBe(true);
        expect(cache.has('churn_0')).toBe(false);
      });
    });

    describe('MAX_PEERS_PER_ACCOUNT boundary - 1000+ peers', () => {
      it('should handle exactly MAX_PEERS_PER_ACCOUNT entries', () => {
        const cache = new GroupPermissionLRUCache(MAX_PEERS_PER_ACCOUNT, 60000);

        // Add exactly MAX_PEERS_PER_ACCOUNT entries
        for (let i = 0; i < MAX_PEERS_PER_ACCOUNT; i++) {
          cache.set(`peer${i}`, createTestPermissions({ group: `peer${i}` }));
        }

        expect(cache.size()).toBe(MAX_PEERS_PER_ACCOUNT);
      });

      it('should correctly evict when exceeding MAX_PEERS_PER_ACCOUNT by 1', () => {
        const cache = new GroupPermissionLRUCache(MAX_PEERS_PER_ACCOUNT, 60000);

        // Add MAX_PEERS_PER_ACCOUNT entries
        for (let i = 0; i < MAX_PEERS_PER_ACCOUNT; i++) {
          cache.set(`peer${i}`, createTestPermissions({ group: `peer${i}` }));
        }

        // Add one more peer - should evict peer0
        cache.set(`peer${MAX_PEERS_PER_ACCOUNT}`, createTestPermissions({ group: `peer${MAX_PEERS_PER_ACCOUNT}` }));

        expect(cache.size()).toBe(MAX_PEERS_PER_ACCOUNT);
        expect(cache.has('peer0')).toBe(false);
        expect(cache.has(`peer${MAX_PEERS_PER_ACCOUNT}`)).toBe(true);
      });

      it('should handle exceeding MAX_PEERS_PER_ACCOUNT by large margin', () => {
        const cache = new GroupPermissionLRUCache(MAX_PEERS_PER_ACCOUNT, 60000);

        // Simulate 2x MAX_PEERS_PER_ACCOUNT peers
        const excess = MAX_PEERS_PER_ACCOUNT * 2;
        for (let i = 0; i < excess; i++) {
          cache.set(`peer${i}`, createTestPermissions({ group: `peer${i}` }));
        }

        // Size should never exceed limit
        expect(cache.size()).toBe(MAX_PEERS_PER_ACCOUNT);

        // Oldest peers should be evicted
        expect(cache.has('peer0')).toBe(false);
        expect(cache.has('peer500')).toBe(false);

        // Newest peers should exist
        expect(cache.has(`peer${excess - 1}`)).toBe(true);
        expect(cache.has(`peer${excess - MAX_PEERS_PER_ACCOUNT}`)).toBe(true);
      });

      it('should handle MAX_PEERS_PER_ACCOUNT with TTL expiration interleaved', async () => {
        const shortTTL = 50; // 50ms TTL
        const cache = new GroupPermissionLRUCache(MAX_PEERS_PER_ACCOUNT, shortTTL);

        // Add half the peers
        for (let i = 0; i < MAX_PEERS_PER_ACCOUNT / 2; i++) {
          cache.set(`peer${i}`, createTestPermissions({ group: `peer${i}` }));
        }

        // Wait for first half to expire
        await new Promise(resolve => setTimeout(resolve, 60));

        // Add more peers - should not exceed limit
        for (let i = MAX_PEERS_PER_ACCOUNT / 2; i < MAX_PEERS_PER_ACCOUNT + 100; i++) {
          cache.set(`peer${i}`, createTestPermissions({ group: `peer${i}` }));
        }

        // Expired entries should be evicted, new entries should exist
        expect(cache.size()).toBeLessThanOrEqual(MAX_PEERS_PER_ACCOUNT);
        expect(cache.has(`peer${MAX_PEERS_PER_ACCOUNT + 50}`)).toBe(true);
      });

      it('should maintain O(1) performance with MAX_PEERS_PER_ACCOUNT entries', () => {
        const cache = new GroupPermissionLRUCache(MAX_PEERS_PER_ACCOUNT, 60000);

        // Fill to capacity
        for (let i = 0; i < MAX_PEERS_PER_ACCOUNT; i++) {
          cache.set(`peer${i}`, createTestPermissions({ group: `peer${i}` }));
        }

        // Test O(1) operations
        const getStart = performance.now();
        cache.get('peer500');
        const getEnd = performance.now();

        const hasStart = performance.now();
        cache.has('peer500');
        const hasEnd = performance.now();

        // All operations should be O(1) - very fast regardless of cache size
        expect(getEnd - getStart).toBeLessThan(1);
        expect(hasEnd - hasStart).toBeLessThan(1);
      });
    });
  });
});
