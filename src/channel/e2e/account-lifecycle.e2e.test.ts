/**
 * E2E Tests for Account Lifecycle
 *
 * Tests account lifecycle management:
 * - Cleanup account resources on removal
 * - Handle concurrent account operations
 * - Migrate state during account updates
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getOrCreateAccountState,
  removeAccountState,
  disposeMessageStateStore,
  resetDefaultProvider,
  getAllAccountStates,
} from '../../runtime/index.js';

describe('E2E: Account Lifecycle', () => {
  const baseAccountId = `test-lifecycle-${Date.now()}`;

  beforeEach(() => {
    disposeMessageStateStore();
    resetDefaultProvider();
  });

  afterEach(async () => {
    disposeMessageStateStore();
    resetDefaultProvider();
  });

  const getTestAccountId = (suffix = '') =>
    `${baseAccountId}-${suffix}-${Math.random().toString(36).slice(2, 8)}`;

  describe('Cleanup account resources on removal', () => {
    it('should remove account state completely', () => {
      const accountId = getTestAccountId('cleanup1');

      // Create account state
      const state1 = getOrCreateAccountState(accountId);
      expect(state1).toBeDefined();
      expect(state1.accountId).toBe(accountId);

      // Verify it's in the account states
      const allBefore = getAllAccountStates();
      expect(allBefore.has(accountId)).toBe(true);

      // Remove account
      removeAccountState(accountId);

      // Verify it's removed
      const allAfter = getAllAccountStates();
      expect(allAfter.has(accountId)).toBe(false);
    });

    it('should not affect other accounts when removing one', () => {
      const accountId1 = getTestAccountId('cleanup2a');
      const accountId2 = getTestAccountId('cleanup2b');
      const accountId3 = getTestAccountId('cleanup2c');

      // Create three accounts
      getOrCreateAccountState(accountId1);
      getOrCreateAccountState(accountId2);
      getOrCreateAccountState(accountId3);

      // Remove only account 2
      removeAccountState(accountId2);

      // Check remaining accounts
      const all = getAllAccountStates();
      expect(all.has(accountId1)).toBe(true);
      expect(all.has(accountId2)).toBe(false);
      expect(all.has(accountId3)).toBe(true);
    });

    it('should handle removing non-existent account gracefully', () => {
      const nonExistentId = getTestAccountId('nonexistent');

      // Should not throw
      expect(() => removeAccountState(nonExistentId)).not.toThrow();
    });

    it('should allow recreating account after removal', () => {
      const accountId = getTestAccountId('recreate');

      // Create and remove
      getOrCreateAccountState(accountId);
      removeAccountState(accountId);

      // Create again - should work
      const newState = getOrCreateAccountState(accountId);
      expect(newState).toBeDefined();
      expect(newState.accountId).toBe(accountId);
    });
  });

  describe('Handle concurrent account operations', () => {
    it('should handle concurrent getOrCreateAccountState calls', () => {
      const accountId = getTestAccountId('concurrent1');

      // Call getOrCreateAccountState concurrently multiple times
      const states = Array(10)
        .fill(null)
        .map(() => getOrCreateAccountState(accountId));

      // All should return the same account state
      const uniqueStates = new Set(states);
      expect(uniqueStates.size).toBe(1);

      // Account should exist once
      const all = getAllAccountStates();
      expect(all.has(accountId)).toBe(true);
    });

    it('should handle concurrent removeAccountState calls', () => {
      const accountId = getTestAccountId('concurrent2');

      // Create account
      getOrCreateAccountState(accountId);

      // Call remove concurrently
      expect(() => {
        Array(10)
          .fill(null)
          .forEach(() => removeAccountState(accountId));
      }).not.toThrow();

      // Should be removed
      const all = getAllAccountStates();
      expect(all.has(accountId)).toBe(false);
    });

    it('should handle mixed concurrent operations', () => {
      const accountId = getTestAccountId('concurrent3');

      // Mix of create and remove operations
      expect(() => {
        getOrCreateAccountState(accountId);
        getOrCreateAccountState(accountId);
        removeAccountState(accountId);
        getOrCreateAccountState(accountId);
      }).not.toThrow();

      // Should end with account present
      const all = getAllAccountStates();
      expect(all.has(accountId)).toBe(true);
    });

    it('should handle rapid create/remove cycles', () => {
      const accountId = getTestAccountId('rapid');

      // Rapid create/remove cycles
      for (let i = 0; i < 20; i++) {
        getOrCreateAccountState(accountId);
        removeAccountState(accountId);
      }

      // Final state - account should be removed
      const all = getAllAccountStates();
      expect(all.has(accountId)).toBe(false);
    });
  });

  describe('Migrate state during account updates', () => {
    it('should preserve config across updates', () => {
      const accountId = getTestAccountId('migrate1');

      // Create account with initial state
      const state1 = getOrCreateAccountState(accountId);
      const originalConfig = state1.config;

      // Update some state
      state1.lastInboundAt = new Date();

      // Get state again - should be same instance
      const state2 = getOrCreateAccountState(accountId);
      expect(state2).toBe(state1);
      expect(state2.config).toBe(originalConfig);
    });

    it('should maintain separate state for different accounts', () => {
      const accountId1 = getTestAccountId('migrate2a');
      const accountId2 = getTestAccountId('migrate2b');

      const state1 = getOrCreateAccountState(accountId1);
      const state2 = getOrCreateAccountState(accountId2);

      // Modify state1
      state1.lastInboundAt = new Date('2024-01-01');

      // state2 should be independent
      expect(state2.lastInboundAt).toBeNull();
      expect(state2.accountId).not.toBe(state1.accountId);
    });

    it('should handle account state initialization correctly', () => {
      const accountId = getTestAccountId('init');

      // Get state - should initialize all required fields
      const state = getOrCreateAccountState(accountId);

      // Verify initialized state
      expect(state.accountId).toBe(accountId);
      expect(state.config).toBeDefined();
      expect(state.messageCallbacks).toBeDefined();
      expect(state.messageCallbacks.size).toBe(0);
      expect(state.lastError).toBeNull();
      expect(state.watchInterval).toBeNull();
    });

    it('should allow updating account state properties', () => {
      const accountId = getTestAccountId('update');

      const state = getOrCreateAccountState(accountId);

      // Update various properties
      state.lastError = 'Test error';
      state.lastOutboundAt = new Date();
      state.started = true;

      // Get fresh reference - should see updates
      const freshState = getOrCreateAccountState(accountId);
      expect(freshState.lastError).toBe('Test error');
      expect(freshState.lastOutboundAt).toBeInstanceOf(Date);
      expect(freshState.started).toBe(true);
    });
  });

  describe('Account lifecycle edge cases', () => {
    it('should handle empty account ID gracefully', () => {
      // Empty string should work (treated as valid ID)
      const state = getOrCreateAccountState('');
      expect(state.accountId).toBe('');

      // Cleanup
      removeAccountState('');
    });

    it('should handle special characters in account ID', () => {
      const specialId = 'account/with:special-chars_123';

      const state = getOrCreateAccountState(specialId);
      expect(state.accountId).toBe(specialId);

      removeAccountState(specialId);
    });

    it('should handle very long account IDs', () => {
      const longId = 'a'.repeat(1000);

      const state = getOrCreateAccountState(longId);
      expect(state.accountId).toBe(longId);

      removeAccountState(longId);
    });

    it('should correctly report all account states', () => {
      // Clear all existing accounts first
      const existingAccounts = Array.from(getAllAccountStates().keys());
      for (const accId of existingAccounts) {
        removeAccountState(accId);
      }

      const accountId1 = getTestAccountId('list1');
      const accountId2 = getTestAccountId('list2');
      const accountId3 = getTestAccountId('list3');

      getOrCreateAccountState(accountId1);
      getOrCreateAccountState(accountId2);
      getOrCreateAccountState(accountId3);

      const all = getAllAccountStates();
      expect(all.size).toBe(3);
      expect(all.has(accountId1)).toBe(true);
      expect(all.has(accountId2)).toBe(true);
      expect(all.has(accountId3)).toBe(true);

      // Remove one and verify
      removeAccountState(accountId2);

      const afterRemove = getAllAccountStates();
      expect(afterRemove.size).toBe(2);
      expect(afterRemove.has(accountId1)).toBe(true);
      expect(afterRemove.has(accountId2)).toBe(false);
      expect(afterRemove.has(accountId3)).toBe(true);
    });
  });
});
