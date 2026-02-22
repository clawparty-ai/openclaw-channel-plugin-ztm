/**
 * Integration tests for Runtime Persistence
 *
 * Tests for message state persistence across gateway lifecycle using REAL file I/O.
 * These tests verify actual file system operations, not mocked behavior.
 *
 * Test categories:
 * 1. Basic persistence - save/load with real files
 * 2. File corruption recovery - handling malformed JSON
 * 3. Multiple instance scenarios
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testAccountId } from '../test-utils/fixtures.js';
import {
  withTempDir,
  writeJSONFile,
  readJSONFile,
  checkFileExists,
} from '../test-utils/fs-helpers.js';
import type { PairingStateData } from './pairing-store.js';
import { join } from 'node:path';
import { writeFile, chmod } from 'node:fs/promises';

// Import the actual PairingStateStore implementation
import { PairingStateStoreImpl } from './pairing-store.js';
import { createMessageStateStore } from './store.js';

// Mock logger for cleaner test output - using hoisted for vi.mock
const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../utils/logger.js', () => ({
  logger: mockLogger,
  defaultLogger: mockLogger,
}));

describe('Runtime Persistence Integration (Real File I/O)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Pairing State File Persistence', () => {
    it('should persist pairing data to real file', async () => {
      await withTempDir(async dir => {
        const statePath = join(dir, 'pairings.json');
        const store = new PairingStateStoreImpl(statePath);

        // Save some pairings
        store.savePendingPairing(testAccountId, 'alice', new Date('2024-01-01'));
        store.savePendingPairing(testAccountId, 'bob', new Date('2024-01-02'));

        // Force flush to write to disk
        store.flush();

        // Verify file exists
        const exists = await checkFileExists(statePath);
        expect(exists).not.toBeNull();

        // Read and verify content
        const content = await readJSONFile<PairingStateData>(statePath);
        expect(content.accounts[testAccountId]).toBeDefined();
        expect(content.accounts[testAccountId].alice).toBe('2024-01-01T00:00:00.000Z');
        expect(content.accounts[testAccountId].bob).toBe('2024-01-02T00:00:00.000Z');

        store.dispose();
      });
    });

    it('should restore pairing data from real file', async () => {
      await withTempDir(async dir => {
        const statePath = join(dir, 'pairings.json');

        // Create initial state file
        const initialData: PairingStateData = {
          accounts: {
            [testAccountId]: {
              alice: '2024-01-01T00:00:00.000Z',
              bob: '2024-01-02T00:00:00.000Z',
            },
          },
        };
        await writeJSONFile(statePath, initialData);

        // Load into new store instance
        const store = new PairingStateStoreImpl(statePath);
        const pairings = store.loadPendingPairings(testAccountId);

        expect(pairings.size).toBe(2);
        expect(pairings.get('alice')?.toISOString()).toBe('2024-01-01T00:00:00.000Z');
        expect(pairings.get('bob')?.toISOString()).toBe('2024-01-02T00:00:00.000Z');

        store.dispose();
      });
    });

    it('should handle non-existent state file gracefully', async () => {
      await withTempDir(async dir => {
        const statePath = join(dir, 'nonexistent-pairings.json');

        // Should not throw when file doesn't exist
        const store = new PairingStateStoreImpl(statePath);
        const pairings = store.loadPendingPairings(testAccountId);

        expect(pairings.size).toBe(0);
        expect(mockLogger.warn).not.toHaveBeenCalled();

        store.dispose();
      });
    });

    it('should recover from corrupted JSON file', async () => {
      await withTempDir(async dir => {
        const statePath = join(dir, 'corrupted-pairings.json');

        // Create corrupted file
        await writeFile(statePath, '{ invalid json content');

        // Should recover and start fresh
        const store = new PairingStateStoreImpl(statePath);
        const pairings = store.loadPendingPairings(testAccountId);

        expect(pairings.size).toBe(0);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Failed to load pairing state')
        );

        // Should be able to save new data
        store.savePendingPairing(testAccountId, 'charlie', new Date());
        store.flush();

        // File should now be valid
        const content = await readJSONFile<PairingStateData>(statePath);
        expect(content.accounts[testAccountId]?.charlie).toBeDefined();

        store.dispose();
      });
    });

    it('should recover from malformed JSON structure', async () => {
      await withTempDir(async dir => {
        const statePath = join(dir, 'malformed-pairings.json');

        // Create file with valid JSON but wrong structure
        await writeFile(statePath, '{"wrongField": "data"}');

        // Should recover and start fresh
        const store = new PairingStateStoreImpl(statePath);
        const pairings = store.loadPendingPairings(testAccountId);

        expect(pairings.size).toBe(0);

        store.dispose();
      });
    });

    it('should persist changes across instances', async () => {
      await withTempDir(async dir => {
        const statePath = join(dir, 'pairings.json');

        // First instance saves data
        const store1 = new PairingStateStoreImpl(statePath);
        store1.savePendingPairing(testAccountId, 'alice', new Date('2024-01-01'));
        store1.flush();
        store1.dispose();

        // Second instance should load the data
        const store2 = new PairingStateStoreImpl(statePath);
        const pairings = store2.loadPendingPairings(testAccountId);

        expect(pairings.size).toBe(1);
        expect(pairings.has('alice')).toBe(true);

        store2.dispose();
      });
    });

    it('should handle concurrent operations safely', async () => {
      await withTempDir(async dir => {
        const statePath = join(dir, 'pairings.json');

        const store = new PairingStateStoreImpl(statePath);

        // Perform multiple concurrent operations
        const promises = [
          Promise.resolve(store.savePendingPairing(testAccountId, 'peer1', new Date())),
          Promise.resolve(store.savePendingPairing(testAccountId, 'peer2', new Date())),
          Promise.resolve(store.savePendingPairing(testAccountId, 'peer3', new Date())),
          Promise.resolve(store.savePendingPairing(testAccountId, 'peer4', new Date())),
          Promise.resolve(store.savePendingPairing(testAccountId, 'peer5', new Date())),
        ];

        await Promise.all(promises);
        store.flush();

        // Verify all were saved
        const pairings = store.loadPendingPairings(testAccountId);
        expect(pairings.size).toBe(5);

        store.dispose();
      });
    });

    it('should clean up expired pairings and persist', async () => {
      await withTempDir(async dir => {
        const statePath = join(dir, 'pairings.json');

        const store = new PairingStateStoreImpl(statePath);

        // Add expired pairing
        const expiredDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
        store.savePendingPairing(testAccountId, 'expired_peer', expiredDate);

        // Add fresh pairing
        const freshDate = new Date();
        store.savePendingPairing(testAccountId, 'fresh_peer', freshDate);

        store.flush();

        // Cleanup expired
        const removedCount = store.cleanupExpiredPairings(testAccountId);
        expect(removedCount).toBe(1);

        store.flush();

        // Verify persistence after cleanup
        const store2 = new PairingStateStoreImpl(statePath);
        const pairings = store2.loadPendingPairings(testAccountId);

        expect(pairings.size).toBe(1);
        expect(pairings.has('fresh_peer')).toBe(true);
        expect(pairings.has('expired_peer')).toBe(false);

        store.dispose();
        store2.dispose();
      });
    });

    it('should respect max pairings limit and persist', async () => {
      await withTempDir(async dir => {
        const statePath = join(dir, 'pairings.json');

        const store = new PairingStateStoreImpl(statePath);

        // Add more than MAX_PAIRINGS_PER_ACCOUNT (default is 100)
        for (let i = 0; i < 150; i++) {
          store.savePendingPairing(testAccountId, `peer-${i}`, new Date());
        }

        store.flush();

        // Load and verify limit was enforced
        const pairings = store.loadPendingPairings(testAccountId);
        expect(pairings.size).toBe(100); // Should be capped at MAX_PAIRINGS_PER_ACCOUNT

        // Verify persistence across restarts
        const store2 = new PairingStateStoreImpl(statePath);
        const pairings2 = store2.loadPendingPairings(testAccountId);
        expect(pairings2.size).toBe(100);

        store.dispose();
        store2.dispose();
      });
    });
  });

  describe('File Permission Scenarios', () => {
    it('should handle read-only file gracefully', async () => {
      await withTempDir(async dir => {
        const statePath = join(dir, 'readonly-pairings.json');

        // Create initial file with data
        const initialData: PairingStateData = {
          accounts: {
            [testAccountId]: {
              alice: '2024-01-01T00:00:00.000Z',
            },
          },
        };
        await writeJSONFile(statePath, initialData);

        // Make file read-only
        await chmod(statePath, 0o444);

        const store = new PairingStateStoreImpl(statePath);

        // Should be able to read existing data
        const pairings = store.loadPendingPairings(testAccountId);
        expect(pairings.has('alice')).toBe(true);

        // Saving should not throw, but should log warning
        store.savePendingPairing(testAccountId, 'bob', new Date());
        store.flush();

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Failed to persist pairing state')
        );

        // Restore permissions for cleanup
        await chmod(statePath, 0o644);
        store.dispose();
      });
    });
  });

  describe('Large Dataset Performance', () => {
    it('should handle large number of peers efficiently', async () => {
      await withTempDir(async dir => {
        const statePath = join(dir, 'large-pairings.json');

        const store = new PairingStateStoreImpl(statePath);

        // Add 90 pairings (close to MAX_PAIRINGS_PER_ACCOUNT)
        for (let i = 0; i < 90; i++) {
          store.savePendingPairing(testAccountId, `peer-${i}`, new Date());
        }

        const startTime = Date.now();
        store.flush();
        const flushTime = Date.now() - startTime;

        // Flush should complete reasonably fast (< 1 second for 90 entries)
        expect(flushTime).toBeLessThan(1000);

        // Loading should also be fast
        const loadStartTime = Date.now();
        const pairings = store.loadPendingPairings(testAccountId);
        const loadTime = Date.now() - loadStartTime;

        expect(pairings.size).toBe(90);
        expect(loadTime).toBeLessThan(100);

        store.dispose();
      });
    });
  });

  describe('Message State Store Interface', () => {
    it('should have all required methods', async () => {
      await withTempDir(async dir => {
        const statePath = join(dir, 'state.json');
        const store = createMessageStateStore(statePath);

        expect(typeof store.getWatermark).toBe('function');
        expect(typeof store.setWatermark).toBe('function');
        expect(typeof store.getFileMetadata).toBe('function');
        expect(typeof store.setFileMetadataBulk).toBe('function');
        expect(typeof store.flush).toBe('function');
      });
    });
  });
});
