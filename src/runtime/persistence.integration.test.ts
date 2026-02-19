// Integration tests for Runtime Persistence
// Tests for message state persistence across gateway lifecycle

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { testAccountId } from '../test-utils/fixtures.js';

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  defaultLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../utils/paths.js', () => ({
  resolveStatePath: vi.fn().mockReturnValue('/mock/state/path'),
}));

describe('Runtime Persistence Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('pairing persistence', () => {
    it('should create pairing state store', async () => {
      const { PairingStateStoreImpl } = await import('./pairing-store.js');

      const store = new PairingStateStoreImpl();

      expect(store).toBeDefined();
    });

    it('should save and load pending pairings', async () => {
      const { PairingStateStoreImpl } = await import('./pairing-store.js');

      const store = new PairingStateStoreImpl();
      store.savePendingPairing(testAccountId, 'alice', new Date());
      store.savePendingPairing(testAccountId, 'bob', new Date());

      const pairings = store.loadPendingPairings(testAccountId);
      expect(pairings.size).toBe(2);
      expect(pairings.has('alice')).toBe(true);
      expect(pairings.has('bob')).toBe(true);
    });

    it('should remove expired pairings', async () => {
      const { PairingStateStoreImpl } = await import('./pairing-store.js');

      const store = new PairingStateStoreImpl();

      // Add expired pairing
      const expiredDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      store.savePendingPairing(testAccountId, 'alice', expiredDate);

      // Add fresh pairing
      const freshDate = new Date();
      store.savePendingPairing(testAccountId, 'bob', freshDate);

      // Cleanup expired
      store.cleanupExpiredPairings(testAccountId);

      const pairings = store.loadPendingPairings(testAccountId);
      expect(pairings.size).toBe(1);
      expect(pairings.has('bob')).toBe(true);
      expect(pairings.has('alice')).toBe(false);
    });

    it('should delete pending pairings', async () => {
      const { PairingStateStoreImpl } = await import('./pairing-store.js');

      const store = new PairingStateStoreImpl();
      store.savePendingPairing(testAccountId, 'alice', new Date());
      store.savePendingPairing(testAccountId, 'bob', new Date());

      store.deletePendingPairing(testAccountId, 'alice');

      const pairings = store.loadPendingPairings(testAccountId);
      expect(pairings.size).toBe(1);
      expect(pairings.has('bob')).toBe(true);
      expect(pairings.has('alice')).toBe(false);
    });

    it('should cleanup with custom max age', async () => {
      const { PairingStateStoreImpl } = await import('./pairing-store.js');

      const store = new PairingStateStoreImpl();

      // Add pairing that's 30 minutes old
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
      store.savePendingPairing(testAccountId, 'alice', thirtyMinAgo);

      // Add fresh pairing
      store.savePendingPairing(testAccountId, 'bob', new Date());

      // Cleanup with 1 hour max age - should keep alice
      store.cleanupExpiredPairings(testAccountId, 60 * 60 * 1000);

      const pairings = store.loadPendingPairings(testAccountId);
      expect(pairings.size).toBe(2);

      // Cleanup with 10 minute max age - should remove alice
      store.cleanupExpiredPairings(testAccountId, 10 * 60 * 1000);

      const remainingPairings = store.loadPendingPairings(testAccountId);
      expect(remainingPairings.size).toBe(1);
      expect(remainingPairings.has('bob')).toBe(true);
    });

    it('should flush pending writes', async () => {
      const { PairingStateStoreImpl } = await import('./pairing-store.js');

      const store = new PairingStateStoreImpl();
      store.savePendingPairing(testAccountId, 'alice', new Date());

      // Should not throw
      expect(() => store.flush()).not.toThrow();
    });

    it('should dispose resources', async () => {
      const { PairingStateStoreImpl } = await import('./pairing-store.js');

      const store = new PairingStateStoreImpl();
      store.savePendingPairing(testAccountId, 'alice', new Date());

      // Should not throw
      expect(() => store.dispose()).not.toThrow();
    });
  });

  describe('message state store interface', () => {
    it('should have getWatermark method', async () => {
      const { createMessageStateStore } = await import('./store.js');
      const store = createMessageStateStore(testAccountId);

      expect(typeof store.getWatermark).toBe('function');
    });

    it('should have setWatermark method', async () => {
      const { createMessageStateStore } = await import('./store.js');
      const store = createMessageStateStore(testAccountId);

      expect(typeof store.setWatermark).toBe('function');
    });

    it('should have getFileMetadata method', async () => {
      const { createMessageStateStore } = await import('./store.js');
      const store = createMessageStateStore(testAccountId);

      expect(typeof store.getFileMetadata).toBe('function');
    });

    it('should have setFileMetadataBulk method', async () => {
      const { createMessageStateStore } = await import('./store.js');
      const store = createMessageStateStore(testAccountId);

      expect(typeof store.setFileMetadataBulk).toBe('function');
    });

    it('should have flush method', async () => {
      const { createMessageStateStore } = await import('./store.js');
      const store = createMessageStateStore(testAccountId);

      expect(typeof store.flush).toBe('function');
    });
  });
});
