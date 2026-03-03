/**
 * E2E Tests for Watermark Persistence
 *
 * Tests watermark persistence:
 * - Watermark tracking and retrieval
 * - Global watermark calculation
 * - Multiple account watermarks
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getOrCreateAccountState,
  disposeMessageStateStore,
  resetDefaultProvider,
} from '../index.js';
import { getAccountMessageStateStore } from '../../runtime/store.js';

describe('E2E: Watermark Persistence', () => {
  const baseAccountId = `test-watermark-${Date.now()}`;

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

  describe('Watermark tracking', () => {
    it('should get watermark for account', () => {
      const accountId = getTestAccountId('track1');
      getOrCreateAccountState(accountId);
      const store = getAccountMessageStateStore(accountId);

      // Initially watermark should be 0
      const watermark = store.getGlobalWatermark(accountId);
      expect(watermark).toBe(0);
    });

    it('should set and get watermark', () => {
      const accountId = getTestAccountId('track2');
      getOrCreateAccountState(accountId);
      const store = getAccountMessageStateStore(accountId);

      // Set watermark for a peer
      store.setWatermark(accountId, 'peer:alice', 1000);

      // Get should return the value
      const watermark = store.getWatermark(accountId, 'peer:alice');
      expect(watermark).toBe(1000);
    });

    it('should only advance watermark forward', () => {
      const accountId = getTestAccountId('track3');
      getOrCreateAccountState(accountId);
      const store = getAccountMessageStateStore(accountId);

      // Set initial watermark
      store.setWatermark(accountId, 'peer:bob', 500);

      // Try to set lower watermark - should be ignored
      store.setWatermark(accountId, 'peer:bob', 300);

      // Should still be 500
      const watermark = store.getWatermark(accountId, 'peer:bob');
      expect(watermark).toBe(500);

      // Set higher watermark - should work
      store.setWatermark(accountId, 'peer:bob', 800);
      const watermark2 = store.getWatermark(accountId, 'peer:bob');
      expect(watermark2).toBe(800);
    });
  });

  describe('Global watermark', () => {
    it('should calculate global watermark as max across all peers', () => {
      const accountId = getTestAccountId('global1');
      getOrCreateAccountState(accountId);
      const store = getAccountMessageStateStore(accountId);

      // Set different watermarks for different peers
      store.setWatermark(accountId, 'peer:alice', 100);
      store.setWatermark(accountId, 'peer:bob', 500);
      store.setWatermark(accountId, 'peer:charlie', 300);

      // Global should be max
      const global = store.getGlobalWatermark(accountId);
      expect(global).toBe(500);
    });

    it('should return 0 when no watermarks set', () => {
      const accountId = getTestAccountId('global2');
      getOrCreateAccountState(accountId);
      const store = getAccountMessageStateStore(accountId);

      const global = store.getGlobalWatermark(accountId);
      expect(global).toBe(0);
    });
  });

  describe('Multiple accounts', () => {
    it('should maintain separate watermarks per account', () => {
      const accountId1 = getTestAccountId('multi1');
      const accountId2 = getTestAccountId('multi2');

      getOrCreateAccountState(accountId1);
      getOrCreateAccountState(accountId2);
      const store1 = getAccountMessageStateStore(accountId1);
      const store2 = getAccountMessageStateStore(accountId2);

      // Set watermark for account 1
      store1.setWatermark(accountId1, 'peer:alice', 1000);

      // Set different watermark for account 2
      store2.setWatermark(accountId2, 'peer:bob', 500);

      // Each should be independent
      expect(store1.getWatermark(accountId1, 'peer:alice')).toBe(1000);
      expect(store2.getWatermark(accountId2, 'peer:bob')).toBe(500);

      // Account 1 shouldn't see account 2's watermark
      expect(store1.getWatermark(accountId1, 'peer:bob')).toBe(0);
    });
  });

  describe('Watermark for different keys', () => {
    it('should handle peer watermarks', () => {
      const accountId = getTestAccountId('keys1');
      getOrCreateAccountState(accountId);
      const store = getAccountMessageStateStore(accountId);

      store.setWatermark(accountId, 'peer:alice', 1000);
      store.setWatermark(accountId, 'peer:bob', 2000);

      expect(store.getWatermark(accountId, 'peer:alice')).toBe(1000);
      expect(store.getWatermark(accountId, 'peer:bob')).toBe(2000);
    });

    it('should handle group watermarks', () => {
      const accountId = getTestAccountId('keys2');
      getOrCreateAccountState(accountId);
      const store = getAccountMessageStateStore(accountId);

      store.setWatermark(accountId, 'group:admin/test-group', 1500);

      expect(store.getWatermark(accountId, 'group:admin/test-group')).toBe(1500);
    });
  });
});
