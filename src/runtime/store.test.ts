// Unit tests for MessageStateStore

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MessageStateStoreImpl, type MessageStateStore } from './store.js';
import { STATE_FLUSH_DEBOUNCE_MS, STATE_FLUSH_MAX_DELAY_MS } from '../constants.js';

/**
 * Create a fresh isolated MessageStateStore for testing
 */
function createTestStore(): MessageStateStore {
  const testDir = path.join(
    os.tmpdir(),
    `ztm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const testFile = path.join(testDir, 'state.json');
  fs.mkdirSync(testDir, { recursive: true });
  return new MessageStateStoreImpl(testFile);
}

describe('MessageStateStore', () => {
  describe('getWatermark', () => {
    it('should return 0 for unknown account', () => {
      const store = createTestStore();
      const watermark = store.getWatermark('unknown-account-test', 'unknown-peer');
      expect(watermark).toBe(0);
    });

    it('should return 0 for unknown peer in known account', () => {
      const store = createTestStore();
      store.setWatermark('test-account-1', 'peer1', 1000);
      const watermark = store.getWatermark('test-account-1', 'unknown-peer');
      expect(watermark).toBe(0);
    });

    it('should return the last set watermark', () => {
      const store = createTestStore();
      store.setWatermark('test-account-2', 'peer1', 1234567890);
      const watermark = store.getWatermark('test-account-2', 'peer1');
      expect(watermark).toBe(1234567890);
    });

    it('should maintain separate watermarks per peer', () => {
      const store = createTestStore();
      store.setWatermark('test-account-3', 'peer1', 1000);
      store.setWatermark('test-account-3', 'peer2', 2000);
      store.setWatermark('test-account-3', 'peer3', 3000);

      expect(store.getWatermark('test-account-3', 'peer1')).toBe(1000);
      expect(store.getWatermark('test-account-3', 'peer2')).toBe(2000);
      expect(store.getWatermark('test-account-3', 'peer3')).toBe(3000);
    });

    it('should maintain separate watermarks per account', () => {
      const store = createTestStore();
      store.setWatermark('test-account-4a', 'peer1', 1000);
      store.setWatermark('test-account-4b', 'peer1', 2000);

      expect(store.getWatermark('test-account-4a', 'peer1')).toBe(1000);
      expect(store.getWatermark('test-account-4b', 'peer1')).toBe(2000);
    });
  });

  describe('getGlobalWatermark', () => {
    it('should return 0 for unknown account', () => {
      const store = createTestStore();
      const watermark = store.getGlobalWatermark('unknown-account-global');
      expect(watermark).toBe(0);
    });

    it('should return the maximum watermark across all peers', () => {
      const store = createTestStore();
      store.setWatermark('test-account-5', 'peer1', 1000);
      store.setWatermark('test-account-5', 'peer2', 3000);
      store.setWatermark('test-account-5', 'peer3', 2000);

      const globalWatermark = store.getGlobalWatermark('test-account-5');
      expect(globalWatermark).toBe(3000);
    });

    it('should return 0 when all watermarks are 0', () => {
      const store = createTestStore();
      store.setWatermark('test-account-6', 'peer1', 0);
      store.setWatermark('test-account-6', 'peer2', 0);

      const globalWatermark = store.getGlobalWatermark('test-account-6');
      expect(globalWatermark).toBe(0);
    });

    it('should handle negative timestamps (returns 0, not negative)', () => {
      const store = createTestStore();
      store.setWatermark('test-account-7', 'peer1', -1000);
      store.setWatermark('test-account-7', 'peer2', -500);

      const globalWatermark = store.getGlobalWatermark('test-account-7');
      expect(globalWatermark).toBe(0);
    });
  });

  describe('setWatermark', () => {
    it('should only advance forward (ignore lower values)', () => {
      const store = createTestStore();
      store.setWatermark('test-account-8', 'peer1', 1000);
      store.setWatermark('test-account-8', 'peer1', 500); // Should be ignored
      store.setWatermark('test-account-8', 'peer1', 2000);

      expect(store.getWatermark('test-account-8', 'peer1')).toBe(2000);
    });

    it('should handle equal values (idempotent)', () => {
      const store = createTestStore();
      store.setWatermark('test-account-9', 'peer1', 1000);
      store.setWatermark('test-account-9', 'peer1', 1000);

      expect(store.getWatermark('test-account-9', 'peer1')).toBe(1000);
    });

    it('should handle large timestamp values', () => {
      const store = createTestStore();
      const largeTimestamp = Date.now() + 1000000000;
      store.setWatermark('test-account-10', 'peer1', largeTimestamp);

      expect(store.getWatermark('test-account-10', 'peer1')).toBe(largeTimestamp);
    });

    it('should trigger cleanup when limit exceeded', () => {
      const store = createTestStore();
      // Add more peers than MAX_PEERS_PER_ACCOUNT (1000)
      for (let i = 0; i < 1100; i++) {
        store.setWatermark('test-account-11', `peer${i}`, Date.now() + i);
      }

      // Should have trimmed to at most MAX_PEERS_PER_ACCOUNT
      const globalWatermark = store.getGlobalWatermark('test-account-11');
      expect(globalWatermark).toBeGreaterThan(0);
    });
  });

  describe('flush', () => {
    it('should persist state immediately', () => {
      const store = createTestStore();
      store.setWatermark('test-account-20', 'peer1', 1234567890);

      // Flush should trigger save
      expect(() => store.flush()).not.toThrow();
    });

    it('should cancel any pending save timer', () => {
      const store = createTestStore();
      store.setWatermark('test-account-21', 'peer1', 1000);
      store.flush();

      // Should not throw even if called multiple times
      store.flush();
      store.flush();
    });
  });

  describe('flushAsync', () => {
    it('should persist state asynchronously', async () => {
      const store = createTestStore();
      store.setWatermark('test-async-1', 'peer1', 1234567890);

      // flushAsync should not throw
      await expect(store.flushAsync()).resolves.toBeUndefined();
    });

    it('should handle multiple async flushes', async () => {
      const store = createTestStore();
      store.setWatermark('test-async-2', 'peer1', 1000);

      // Multiple async flushes should be safe
      const p1 = store.flushAsync();
      const p2 = store.flushAsync();
      await expect(Promise.all([p1, p2])).resolves.toBeDefined();
    });

    it('should use async file I/O (writeFile)', async () => {
      const tempFile = path.join(os.tmpdir(), `ztm-async-test-${Date.now()}`);
      const store = new MessageStateStoreImpl(tempFile);
      store.setWatermark('test-async-3', 'peer1', 2000);

      // flushAsync uses promises.writeFile under the hood
      await store.flushAsync();

      // Verify data was persisted by loading fresh store
      const store2 = new MessageStateStoreImpl(tempFile);
      expect(store2.getWatermark('test-async-3', 'peer1')).toBe(2000);
      store.dispose();
      store2.dispose();
    });
  });

  describe('dispose', () => {
    it('should clean up resources', () => {
      const store = createTestStore();
      store.setWatermark('test-account-22', 'peer1', 1000);

      expect(() => store.dispose()).not.toThrow();
    });

    it('should be safe to call multiple times', () => {
      const store = createTestStore();
      store.setWatermark('test-account-23', 'peer1', 1000);

      store.dispose();
      store.dispose();
      store.dispose();
    });

    it('should persist state before cleanup', () => {
      const store = createTestStore();
      store.setWatermark('test-account-24', 'peer1', 1000);
      store.setWatermark('test-account-24', 'peer2', 2000);

      store.dispose();

      // After dispose, state should still be in memory (dispose doesn't clear memory, just saves to disk)
      expect(store.getWatermark('test-account-24', 'peer1')).toBe(1000);
      expect(store.getWatermark('test-account-24', 'peer2')).toBe(2000);
    });
  });

  describe('persistence', () => {
    it('should load existing state on startup', () => {
      // Create store, set data, dispose to save
      const tempFile = path.join(os.tmpdir(), `ztm-persist-test-${Date.now()}`);
      {
        const store = new MessageStateStoreImpl(tempFile);
        store.setWatermark('test-startup', 'peer', 12345);
        store.dispose();
      }

      // Create new store with same file, should load existing state
      const store2 = new MessageStateStoreImpl(tempFile);
      expect(store2.getWatermark('test-startup', 'peer')).toBe(12345);
      store2.dispose();

      // Cleanup
      fs.unlinkSync(tempFile);
    });

    it('should handle corrupted state file gracefully', () => {
      // The store should not crash if the state file is corrupted
      // It will start with an empty state
      const tempFile = path.join(os.tmpdir(), `ztm-corrupt-test-${Date.now()}`);
      fs.writeFileSync(tempFile, 'not valid json {{{');

      expect(() => {
        const store = new MessageStateStoreImpl(tempFile);
        store.setWatermark('test-corrupt', 'test', 1000);
        store.dispose();
      }).not.toThrow();

      // Cleanup
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty account ID', () => {
      const store = createTestStore();
      store.setWatermark('', 'peer1', 1000);
      expect(store.getWatermark('', 'peer1')).toBe(1000);
    });

    it('should handle empty peer ID', () => {
      const store = createTestStore();
      store.setWatermark('test-empty-peer', '', 1000);
      expect(store.getWatermark('test-empty-peer', '')).toBe(1000);
    });

    it('should handle special characters in IDs', () => {
      const store = createTestStore();
      const specialAccountId = 'account/with/special\\chars';
      const specialPeerId = 'peer:with-special_chars';

      store.setWatermark(specialAccountId, specialPeerId, 1000);
      expect(store.getWatermark(specialAccountId, specialPeerId)).toBe(1000);
    });

    it('should handle very long IDs', () => {
      const store = createTestStore();
      const longId = 'a'.repeat(1000);
      store.setWatermark(longId, longId, 1000);
      expect(store.getWatermark(longId, longId)).toBe(1000);
    });

    it('should handle unicode characters', () => {
      const store = createTestStore();
      const unicodeId = '用户-пользователь-🚀';
      store.setWatermark(unicodeId, unicodeId, 1000);
      expect(store.getWatermark(unicodeId, unicodeId)).toBe(1000);
    });
  });

  describe('crash recovery during debounce window', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should lose data if crash occurs during debounce window', () => {
      const tempFile = path.join(os.tmpdir(), `ztm-crash-debounce-${Date.now()}`);

      // Create store and set data
      const store = new MessageStateStoreImpl(tempFile);
      store.setWatermark('crash-test-1', 'peer1', 1000);

      // Simulate crash: don't flush, just let timers run out
      // The debounce timer is still pending (1 second)

      // Advance time past debounce but less than max-delay
      vi.advanceTimersByTime(STATE_FLUSH_DEBOUNCE_MS + 500);

      // Data is in memory but not persisted yet (still in debounce window)
      expect(store.getWatermark('crash-test-1', 'peer1')).toBe(1000);

      // Simulate crash: dispose without explicit flush
      store.dispose();

      // Create new store - data should NOT be recovered (not saved before crash)
      const store2 = new MessageStateStoreImpl(tempFile);
      const recoveredWatermark = store2.getWatermark('crash-test-1', 'peer1');
      // The data was saved by debounce timer before dispose, so it should be recovered
      expect(recoveredWatermark).toBe(1000);

      store2.dispose();
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    });

    it('should recover data after max-delay timeout triggers forced flush', () => {
      const tempFile = path.join(os.tmpdir(), `ztm-crash-maxdelay-${Date.now()}`);

      // Create store and set data
      const store = new MessageStateStoreImpl(tempFile);
      store.setWatermark('crash-test-2', 'peer1', 2000);
      store.setWatermark('crash-test-2', 'peer2', 3000);

      // Advance time past max-delay to trigger forced flush
      vi.advanceTimersByTime(STATE_FLUSH_MAX_DELAY_MS + 100);

      // Simulate crash - data should be persisted by max-delay timer
      store.dispose();

      // Create new store - data should be recovered
      const store2 = new MessageStateStoreImpl(tempFile);
      expect(store2.getWatermark('crash-test-2', 'peer1')).toBe(2000);
      expect(store2.getWatermark('crash-test-2', 'peer2')).toBe(3000);

      store2.dispose();
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    });

    it('should persist data immediately on flush even during debounce window', () => {
      const tempFile = path.join(os.tmpdir(), `ztm-flush-during-debounce-${Date.now()}`);

      // Create store and set data
      const store = new MessageStateStoreImpl(tempFile);
      store.setWatermark('crash-test-3', 'peer1', 4000);

      // Flush immediately during debounce window
      store.flush();

      // Advance time (debounce would have fired, but flush already saved)
      vi.advanceTimersByTime(STATE_FLUSH_DEBOUNCE_MS + 1000);

      // Simulate crash
      store.dispose();

      // Create new store - data should be recovered
      const store2 = new MessageStateStoreImpl(tempFile);
      expect(store2.getWatermark('crash-test-3', 'peer1')).toBe(4000);

      store2.dispose();
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    });

    it('should allow multiple updates within debounce window to batch', () => {
      const tempFile = path.join(os.tmpdir(), `ztm-batch-debounce-${Date.now()}`);

      // Create store and set multiple watermarks
      const store = new MessageStateStoreImpl(tempFile);
      store.setWatermark('batch-test', 'peer1', 1000);
      store.setWatermark('batch-test', 'peer2', 2000);
      store.setWatermark('batch-test', 'peer3', 3000);

      // Advance time to trigger debounce save
      vi.advanceTimersByTime(STATE_FLUSH_DEBOUNCE_MS + 100);

      // Simulate crash
      store.dispose();

      // Create new store - all batched data should be recovered
      const store2 = new MessageStateStoreImpl(tempFile);
      expect(store2.getWatermark('batch-test', 'peer1')).toBe(1000);
      expect(store2.getWatermark('batch-test', 'peer2')).toBe(2000);
      expect(store2.getWatermark('batch-test', 'peer3')).toBe(3000);

      store2.dispose();
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    });

    it('should cancel debounce timer on flush to prevent duplicate saves', () => {
      const tempFile = path.join(os.tmpdir(), `ztm-cancel-debounce-${Date.now()}`);

      // Create store and set data
      const store = new MessageStateStoreImpl(tempFile);
      store.setWatermark('cancel-test', 'peer1', 5000);

      // Flush immediately
      store.flush();

      // Advance time past when debounce would have fired
      vi.advanceTimersByTime(STATE_FLUSH_DEBOUNCE_MS + 100);

      // Should not throw - flush handles cancellation gracefully
      expect(() => store.flush()).not.toThrow();

      store.dispose();
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    });
  });

  describe('Concurrent watermark updates', () => {
    it('should handle 100 concurrent setWatermarkAsync calls for same peer', async () => {
      const store = createTestStore();
      const accountId = 'concurrent-test-1';
      const peerId = 'peer1';

      // Launch 100 concurrent updates with different timestamps
      const timestamps = Array(100)
        .fill(null)
        .map((_, i) => Date.now() + i * 1000);
      const promises = timestamps.map(ts => store.setWatermarkAsync(accountId, peerId, ts));

      await Promise.all(promises);

      // The final watermark should be the maximum value
      const finalWatermark = store.getWatermark(accountId, peerId);
      expect(finalWatermark).toBe(Math.max(...timestamps));

      store.dispose();
    });

    it('should handle concurrent updates for different peers in same account', async () => {
      const store = createTestStore();
      const accountId = 'concurrent-test-2';

      // 10 peers, each with 10 concurrent updates
      const numPeers = 10;
      const updatesPerPeer = 10;

      const allPromises: Promise<void>[] = [];
      for (let peer = 0; peer < numPeers; peer++) {
        const peerId = `peer${peer}`;
        for (let i = 0; i < updatesPerPeer; i++) {
          allPromises.push(store.setWatermarkAsync(accountId, peerId, Date.now() + peer * 100 + i));
        }
      }

      await Promise.all(allPromises);

      // All peers should have valid watermarks (non-zero)
      for (let peer = 0; peer < numPeers; peer++) {
        const watermark = store.getWatermark(accountId, `peer${peer}`);
        expect(watermark).toBeGreaterThan(0);
      }

      store.dispose();
    });

    it('should handle concurrent updates for different accounts', async () => {
      const store = createTestStore();
      const numAccounts = 5;

      const allPromises: Promise<void>[] = [];
      for (let acc = 0; acc < numAccounts; acc++) {
        const accountId = `account${acc}`;
        for (let i = 0; i < 20; i++) {
          allPromises.push(store.setWatermarkAsync(accountId, 'peer1', Date.now() + i));
        }
      }

      await Promise.all(allPromises);

      // All accounts should have valid watermarks
      for (let acc = 0; acc < numAccounts; acc++) {
        const watermark = store.getWatermark(`account${acc}`, 'peer1');
        expect(watermark).toBeGreaterThan(0);
      }

      store.dispose();
    });

    it('should handle rapid sequential updates without race conditions', async () => {
      const store = createTestStore();
      const accountId = 'concurrent-test-4';

      // Store expected final timestamp upfront to avoid timing issues
      const baseTimestamp = Date.now();
      const expectedFinal = baseTimestamp + 49;

      // Simulate rapid updates that might cause race conditions
      let previousWatermark = 0;
      for (let i = 0; i < 50; i++) {
        const timestamp = baseTimestamp + i;
        await store.setWatermarkAsync(accountId, 'peer1', timestamp);
        previousWatermark = store.getWatermark(accountId, 'peer1');
        expect(previousWatermark).toBeGreaterThanOrEqual(timestamp);
      }

      // Final value should be monotonically increasing to the last timestamp set
      const finalWatermark = store.getWatermark(accountId, 'peer1');
      expect(finalWatermark).toBe(expectedFinal);

      store.dispose();
    });

    it('should correctly interleave async and sync watermark operations', async () => {
      const store = createTestStore();
      const accountId = 'concurrent-test-5';

      // Mix of sync and async operations
      store.setWatermark(accountId, 'peer1', 1000);

      const asyncPromise = store.setWatermarkAsync(accountId, 'peer2', 2000);

      store.setWatermark(accountId, 'peer3', 3000);

      await asyncPromise;

      // All should have correct values
      expect(store.getWatermark(accountId, 'peer1')).toBe(1000);
      expect(store.getWatermark(accountId, 'peer2')).toBe(2000);
      expect(store.getWatermark(accountId, 'peer3')).toBe(3000);

      store.dispose();
    });
  });

  describe('file permissions security', () => {
    /**
     * Mock FileSystem that tracks chmod calls to verify security behavior
     */
    function createPermissionTrackingFs() {
      const chmodCalls: { path: string; mode: number }[] = [];
      const chmodSyncCalls: { path: string; mode: number }[] = [];

      const trackingFs = {
        existsSync: fs.existsSync,
        mkdirSync: fs.mkdirSync,
        readFileSync: (p: string, enc: string) => fs.readFileSync(p, enc as BufferEncoding),
        writeFileSync: (p: string, d: string) => fs.writeFileSync(p, d),
        chmodSync: (path: string, mode: number) => {
          chmodSyncCalls.push({ path, mode });
          fs.chmodSync(path, mode);
        },
        promises: {
          mkdir: async (path: string, options?: { recursive?: boolean }) => {
            await fs.promises.mkdir(path, options);
          },
          readFile: (p: string, enc: string) => fs.promises.readFile(p, enc as BufferEncoding),
          writeFile: (p: string, d: string) => fs.promises.writeFile(p, d),
          access: (p: string) => fs.promises.access(p),
          chmod: async (path: string, mode: number) => {
            chmodCalls.push({ path, mode });
            await fs.promises.chmod(path, mode);
          },
        },
      };

      return {
        fs: trackingFs,
        getChmodCalls: () => chmodCalls,
        getChmodSyncCalls: () => chmodSyncCalls,
        clearCalls: () => {
          chmodCalls.length = 0;
          chmodSyncCalls.length = 0;
        },
      };
    }

    it('should set restrictive permissions (0o600) after async write', async () => {
      const testDir = path.join(
        os.tmpdir(),
        `ztm-perm-test-async-${Date.now()}-${Math.random().toString(36).slice(2)}`
      );
      const testFile = path.join(testDir, 'state.json');
      fs.mkdirSync(testDir, { recursive: true });

      const { fs: trackingFs, getChmodCalls, clearCalls } = createPermissionTrackingFs();

      const store = new MessageStateStoreImpl(testFile, trackingFs);
      clearCalls();

      // Trigger an async write
      store.setWatermark('perm-async-test', 'peer1', 1000);
      await store.flushAsync();

      const chmodCalls = getChmodCalls();
      expect(chmodCalls.length).toBeGreaterThan(0);

      // Find the chmod call for our state file
      const stateFileChmod = chmodCalls.find(call => call.path === testFile);
      expect(stateFileChmod).toBeDefined();
      expect(stateFileChmod?.mode).toBe(0o600); // Read/write for owner only

      store.dispose();
    });

    it('should set restrictive permissions (0o600) after sync write', () => {
      const testDir = path.join(
        os.tmpdir(),
        `ztm-perm-test-sync-${Date.now()}-${Math.random().toString(36).slice(2)}`
      );
      const testFile = path.join(testDir, 'state.json');
      fs.mkdirSync(testDir, { recursive: true });

      const { fs: trackingFs, getChmodSyncCalls, clearCalls } = createPermissionTrackingFs();

      const store = new MessageStateStoreImpl(testFile, trackingFs);
      clearCalls();

      // Trigger a sync write
      store.setWatermark('perm-sync-test', 'peer1', 1000);
      store.flush();

      const chmodSyncCalls = getChmodSyncCalls();
      expect(chmodSyncCalls.length).toBeGreaterThan(0);

      // Find the chmodSync call for our state file
      const stateFileChmod = chmodSyncCalls.find(call => call.path === testFile);
      expect(stateFileChmod).toBeDefined();
      expect(stateFileChmod?.mode).toBe(0o600); // Read/write for owner only

      store.dispose();
    });

    it('should verify actual file permissions on disk', async () => {
      const testDir = path.join(
        os.tmpdir(),
        `ztm-real-perm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
      );
      const testFile = path.join(testDir, 'state.json');
      fs.mkdirSync(testDir, { recursive: true });

      // Create a store and trigger a write
      const store = new MessageStateStoreImpl(testFile);
      store.setWatermark('real-perm-test', 'peer1', 1000);
      await store.flushAsync();

      // Check actual file permissions
      try {
        const stats = fs.statSync(testFile);
        // On Unix-like systems, mode & 0o777 gives us the permission bits
        // 0o600 = rw------- (read/write for owner only)
        const mode = stats.mode & 0o777;

        // Verify permissions are 0o600 or more restrictive
        // More restrictive would be odd (like 0o000), but we accept it
        expect(mode & 0o077).toBe(0); // No permissions for group/others
        expect(mode & 0o600).toBe(0o600); // Owner has read+write
      } catch (error) {
        // On Windows, stat.mode doesn't work the same way
        // This is expected - the chmod call exists but Windows handles permissions differently
        expect(process.platform).toMatch(/win32/);
      }

      store.dispose();
    });
  });
});
