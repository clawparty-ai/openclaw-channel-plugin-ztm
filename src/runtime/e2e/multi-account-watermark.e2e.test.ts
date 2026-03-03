/**
 * E2E Tests for Multi-Account Watermark Isolation
 *
 * Tests multi-account watermark scenarios:
 * - Separate watermarks per account
 * - No data leak between accounts
 * - Concurrent watermark updates
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getOrCreateAccountState,
  disposeMessageStateStore,
  resetDefaultProvider,
} from '../index.js';
import { getAccountMessageStateStore } from '../../runtime/store.js';

describe('E2E: Multi-Account Watermark Isolation', () => {
  const baseAccountId = `test-multi-watermark-${Date.now()}`;

  beforeEach(() => {
    disposeMessageStateStore();
    resetDefaultProvider();
  });

  afterEach(async () => {
    disposeMessageStateStore();
    resetDefaultProvider();
  });

  // Helper to get unique account IDs per test
  const getTestAccountId = (suffix = '') =>
    `${baseAccountId}-${suffix}-${Math.random().toString(36).slice(2, 8)}`;

  describe('Separate watermarks per account', () => {
    it('should maintain completely separate watermark stores', () => {
      const accountId1 = getTestAccountId('sep1');
      const accountId2 = getTestAccountId('sep2');

      // Create two separate stores
      getOrCreateAccountState(accountId1);
      getOrCreateAccountState(accountId2);
      const store1 = getAccountMessageStateStore(accountId1);
      const store2 = getAccountMessageStateStore(accountId2);

      // Set watermarks with same peer ID but different accounts
      store1.setWatermark(accountId1, 'peer:same', 100);
      store2.setWatermark(accountId2, 'peer:same', 200);

      // Should be completely isolated
      expect(store1.getWatermark(accountId1, 'peer:same')).toBe(100);
      expect(store2.getWatermark(accountId2, 'peer:same')).toBe(200);
    });

    it('should have independent global watermarks', () => {
      const accountId1 = getTestAccountId('global1');
      const accountId2 = getTestAccountId('global2');

      getOrCreateAccountState(accountId1);
      getOrCreateAccountState(accountId2);
      const store1 = getAccountMessageStateStore(accountId1);
      const store2 = getAccountMessageStateStore(accountId2);

      // Account 1: max watermark is 500
      store1.setWatermark(accountId1, 'peer:a', 300);
      store1.setWatermark(accountId1, 'peer:b', 500);

      // Account 2: max watermark is 1000
      store2.setWatermark(accountId2, 'peer:x', 700);
      store2.setWatermark(accountId2, 'peer:y', 1000);

      // Global watermarks should be independent
      expect(store1.getGlobalWatermark(accountId1)).toBe(500);
      expect(store2.getGlobalWatermark(accountId2)).toBe(1000);
    });

    it('should handle different number of peers per account', () => {
      const accountId1 = getTestAccountId('diff1');
      const accountId2 = getTestAccountId('diff2');

      getOrCreateAccountState(accountId1);
      getOrCreateAccountState(accountId2);
      const store1 = getAccountMessageStateStore(accountId1);
      const store2 = getAccountMessageStateStore(accountId2);

      // Account 1: many peers
      for (let i = 0; i < 50; i++) {
        store1.setWatermark(accountId1, `peer:${i}`, i * 100);
      }

      // Account 2: few peers
      store2.setWatermark(accountId2, 'peer:only', 999);

      // Each should have correct counts
      expect(store1.getGlobalWatermark(accountId1)).toBe(4900);
      expect(store2.getGlobalWatermark(accountId2)).toBe(999);
    });
  });

  describe('No data leak between accounts', () => {
    it('should not leak watermarks across account boundaries', () => {
      const accountId1 = getTestAccountId('leak1');
      const accountId2 = getTestAccountId('leak2');

      getOrCreateAccountState(accountId1);
      getOrCreateAccountState(accountId2);
      const store1 = getAccountMessageStateStore(accountId1);
      const store2 = getAccountMessageStateStore(accountId2);

      // Set multiple watermarks for account 1
      store1.setWatermark(accountId1, 'peer:alice', 100);
      store1.setWatermark(accountId1, 'peer:bob', 200);
      store1.setWatermark(accountId1, 'peer:charlie', 300);

      // Account 2 should see nothing from account 1
      expect(store2.getWatermark(accountId2, 'peer:alice')).toBe(0);
      expect(store2.getWatermark(accountId2, 'peer:bob')).toBe(0);
      expect(store2.getWatermark(accountId2, 'peer:charlie')).toBe(0);

      // And global should be 0
      expect(store2.getGlobalWatermark(accountId2)).toBe(0);
    });

    it('should not leak when querying wrong account ID', () => {
      const accountId1 = getTestAccountId('wrong1');
      const accountId2 = getTestAccountId('wrong2');

      getOrCreateAccountState(accountId1);
      getOrCreateAccountState(accountId2);
      const store1 = getAccountMessageStateStore(accountId1);

      store1.setWatermark(accountId1, 'peer:test', 555);

      // Querying with wrong account ID should return 0
      expect(store1.getWatermark(accountId2, 'peer:test')).toBe(0);
      expect(store1.getGlobalWatermark(accountId2)).toBe(0);
    });

    it('should maintain isolation after many operations', () => {
      const accountId1 = getTestAccountId('many1');
      const accountId2 = getTestAccountId('many2');

      getOrCreateAccountState(accountId1);
      getOrCreateAccountState(accountId2);
      const store1 = getAccountMessageStateStore(accountId1);
      const store2 = getAccountMessageStateStore(accountId2);

      // Many operations on account 1
      for (let i = 0; i < 20; i++) {
        store1.setWatermark(accountId1, `peer:${i}`, i * 100);
      }

      // Single operation on account 2
      store2.setWatermark(accountId2, 'peer:only', 7777);

      // Isolation should still hold
      expect(store1.getGlobalWatermark(accountId1)).toBe(1900);
      expect(store2.getGlobalWatermark(accountId2)).toBe(7777);

      // Account 2 should not see any of account 1's peers
      expect(store2.getWatermark(accountId2, 'peer:0')).toBe(0);
      expect(store2.getWatermark(accountId2, 'peer:19')).toBe(0);
    });
  });

  describe('Concurrent watermark updates', () => {
    it('should handle rapid concurrent updates per account', async () => {
      const accountId = getTestAccountId('concurrent1');

      getOrCreateAccountState(accountId);
      const store = getAccountMessageStateStore(accountId);

      // Rapid concurrent updates to same peer
      const updates = Array(100)
        .fill(null)
        .map((_, i) => store.setWatermarkAsync(accountId, 'peer:fast', Date.now() + i));

      await Promise.all(updates);

      // Final watermark should be the max
      const final = store.getWatermark(accountId, 'peer:fast');
      expect(final).toBeGreaterThan(0);
    });

    it('should handle concurrent updates to different peers in same account', async () => {
      const accountId = getTestAccountId('concurrent2');

      getOrCreateAccountState(accountId);
      const store = getAccountMessageStateStore(accountId);

      // Update 10 different peers concurrently
      const peerUpdates = Array(10)
        .fill(null)
        .map(async (_, peerIdx) => {
          const peerUpdates = Array(10)
            .fill(null)
            .map((_, i) =>
              store.setWatermarkAsync(accountId, `peer:${peerIdx}`, Date.now() + peerIdx * 100 + i)
            );
          await Promise.all(peerUpdates);
        });

      await Promise.all(peerUpdates);

      // All peers should have valid watermarks
      for (let i = 0; i < 10; i++) {
        expect(store.getWatermark(accountId, `peer:${i}`)).toBeGreaterThan(0);
      }
    });

    it('should handle concurrent updates across multiple accounts', async () => {
      const accountId1 = getTestAccountId('concurrent3a');
      const accountId2 = getTestAccountId('concurrent3b');
      const accountId3 = getTestAccountId('concurrent3c');

      getOrCreateAccountState(accountId1);
      getOrCreateAccountState(accountId2);
      getOrCreateAccountState(accountId3);

      const store1 = getAccountMessageStateStore(accountId1);
      const store2 = getAccountMessageStateStore(accountId2);
      const store3 = getAccountMessageStateStore(accountId3);

      // Concurrent updates across 3 accounts
      const allUpdates = [
        ...Array(10)
          .fill(null)
          .map((_, i) => store1.setWatermarkAsync(accountId1, 'peer:a', Date.now() + i)),
        ...Array(10)
          .fill(null)
          .map((_, i) => store2.setWatermarkAsync(accountId2, 'peer:b', Date.now() + i + 100)),
        ...Array(10)
          .fill(null)
          .map((_, i) => store3.setWatermarkAsync(accountId3, 'peer:c', Date.now() + i + 200)),
      ];

      await Promise.all(allUpdates);

      // Each account should have independent state
      expect(store1.getWatermark(accountId1, 'peer:a')).toBeGreaterThan(0);
      expect(store2.getWatermark(accountId2, 'peer:b')).toBeGreaterThan(0);
      expect(store3.getWatermark(accountId3, 'peer:c')).toBeGreaterThan(0);

      // Cross-account queries should be 0
      expect(store1.getWatermark(accountId1, 'peer:b')).toBe(0);
      expect(store1.getWatermark(accountId1, 'peer:c')).toBe(0);
      expect(store2.getWatermark(accountId2, 'peer:a')).toBe(0);
      expect(store2.getWatermark(accountId2, 'peer:c')).toBe(0);
      expect(store3.getWatermark(accountId3, 'peer:a')).toBe(0);
      expect(store3.getWatermark(accountId3, 'peer:b')).toBe(0);
    });
  });
});
