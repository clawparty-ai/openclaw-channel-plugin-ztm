/**
 * Unit tests for MessageStateStore write failure handling
 * @module runtime/store-write-failures.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import { MessageStateStoreImpl, type FileSystem, type MessageStateStore } from './store.js';
import { defaultLogger } from '../utils/logger.js';

/**
 * Create a mock FileSystem that fails on write operations
 */
function createFailingWriteFs(errorType: 'writeFile' | 'mkdir' | 'both'): FileSystem {
  const realFs = require('fs');
  return {
    existsSync: (p: string) => realFs.existsSync(p),
    mkdirSync: (p: string, opts?: { recursive?: boolean }) => {
      if (errorType === 'mkdir' || errorType === 'both') {
        throw new Error('Mock mkdir error');
      }
      return realFs.mkdirSync(p, opts);
    },
    readFileSync: (p: string, enc: string) => realFs.readFileSync(p, enc as BufferEncoding),
    writeFileSync: (p: string, data: string) => {
      if (errorType === 'writeFile' || errorType === 'both') {
        throw new Error('Mock writeFile error');
      }
      return realFs.writeFileSync(p, data);
    },
    chmodSync: (p: string, mode: number) => realFs.chmodSync(p, mode),
    promises: {
      mkdir: async (p: string, opts?: { recursive?: boolean }) => {
        if (errorType === 'mkdir' || errorType === 'both') {
          throw new Error('Mock mkdir error');
        }
        await realFs.promises.mkdir(p, opts);
      },
      readFile: async (p: string, enc: string) =>
        realFs.promises.readFile(p, enc as BufferEncoding),
      writeFile: async (p: string, data: string) => {
        if (errorType === 'writeFile' || errorType === 'both') {
          throw new Error('Mock writeFile error');
        }
        await realFs.promises.writeFile(p, data);
      },
      access: async (p: string) => realFs.promises.access(p),
      chmod: async (p: string, mode: number) => realFs.promises.chmod(p, mode),
    },
  };
}

/**
 * Create a mock logger to track warning calls
 */
function createMockLogger() {
  return {
    ...defaultLogger,
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };
}

describe('MessageStateStore write failures', () => {
  describe('saveAsync write failure', () => {
    it('should log warning when writeFile fails', async () => {
      const tempFile = path.join(os.tmpdir(), `ztm-write-fail-${Date.now()}`);
      const mockLogger = createMockLogger();
      const failingFs = createFailingWriteFs('writeFile');

      // Create store with failing fs
      const store = new MessageStateStoreImpl(tempFile, failingFs, mockLogger);
      store.setWatermark('fail-test-1', 'peer1', 1000);

      // flushAsync should fail gracefully
      await expect(store.flushAsync()).resolves.toBeUndefined();

      // Warning should be logged with path and error details
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to persist message state to ${tempFile}`)
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Mock writeFile error'));

      // Data should still be in memory
      expect(store.getWatermark('fail-test-1', 'peer1')).toBe(1000);

      store.dispose();
    });

    it('should log warning when mkdir fails during saveAsync', async () => {
      const tempFile = path.join(os.tmpdir(), `ztm-mkdir-fail-${Date.now()}`);
      const mockLogger = createMockLogger();
      const failingFs = createFailingWriteFs('mkdir');

      // Ensure parent directory exists so mkdir failure is the cause
      const dir = path.dirname(tempFile);
      require('fs').mkdirSync(dir, { recursive: true });

      const store = new MessageStateStoreImpl(tempFile, failingFs, mockLogger);
      store.setWatermark('fail-test-2', 'peer1', 2000);

      // flushAsync should fail gracefully
      await expect(store.flushAsync()).resolves.toBeUndefined();

      // Warning should be logged (at least once for mkdir or writeFile)
      expect(mockLogger.warn).toHaveBeenCalled();

      // Data should still be in memory
      expect(store.getWatermark('fail-test-2', 'peer1')).toBe(2000);

      store.dispose();
    });

    it('should preserve data in memory after write failure', async () => {
      const tempFile = path.join(os.tmpdir(), `ztm-memory-preserve-${Date.now()}`);
      const failingFs = createFailingWriteFs('writeFile');
      const mockLogger = createMockLogger();

      const store = new MessageStateStoreImpl(tempFile, failingFs, mockLogger);

      // Set multiple watermarks
      store.setWatermark('fail-test-3', 'peer1', 1000);
      store.setWatermark('fail-test-3', 'peer2', 2000);
      store.setWatermark('fail-test-3', 'peer3', 3000);

      // Attempt flush - will fail but data should remain
      await store.flushAsync();

      // All data should still be accessible in memory
      expect(store.getWatermark('fail-test-3', 'peer1')).toBe(1000);
      expect(store.getWatermark('fail-test-3', 'peer2')).toBe(2000);
      expect(store.getWatermark('fail-test-3', 'peer3')).toBe(3000);

      // Global watermark should be max
      expect(store.getGlobalWatermark('fail-test-3')).toBe(3000);

      store.dispose();
    });
  });

  describe('save (sync) write failure', () => {
    it('should log warning when sync writeFile fails', () => {
      const tempFile = path.join(os.tmpdir(), `ztm-sync-write-fail-${Date.now()}`);
      const mockLogger = createMockLogger();
      const failingFs = createFailingWriteFs('writeFile');

      const store = new MessageStateStoreImpl(tempFile, failingFs, mockLogger);
      store.setWatermark('sync-fail-1', 'peer1', 1000);

      // flush() should not throw
      expect(() => store.flush()).not.toThrow();

      // Warning should be logged with path and error details
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to persist message state to ${tempFile}`)
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Mock writeFile error'));

      // Data should still be in memory
      expect(store.getWatermark('sync-fail-1', 'peer1')).toBe(1000);

      store.dispose();
    });

    it('should preserve data in memory after sync write failure', () => {
      const tempFile = path.join(os.tmpdir(), `ztm-sync-memory-${Date.now()}`);
      const failingFs = createFailingWriteFs('writeFile');
      const mockLogger = createMockLogger();

      const store = new MessageStateStoreImpl(tempFile, failingFs, mockLogger);
      store.setWatermark('sync-fail-2', 'peer1', 1000);
      store.setWatermark('sync-fail-2', 'peer2', 2000);

      // flush() will fail but data should remain
      store.flush();

      expect(store.getWatermark('sync-fail-2', 'peer1')).toBe(1000);
      expect(store.getWatermark('sync-fail-2', 'peer2')).toBe(2000);

      store.dispose();
    });
  });

  describe('dispose write failure', () => {
    it('should not throw when dispose fails to write', () => {
      const tempFile = path.join(os.tmpdir(), `ztm-dispose-fail-${Date.now()}`);
      const failingFs = createFailingWriteFs('writeFile');
      const mockLogger = createMockLogger();

      const store = new MessageStateStoreImpl(tempFile, failingFs, mockLogger);
      store.setWatermark('dispose-fail-1', 'peer1', 1000);

      // dispose() should not throw even if write fails
      expect(() => store.dispose()).not.toThrow();

      // Warning should be logged with path and error details
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to persist message state to ${tempFile}`)
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Mock writeFile error'));
    });

    it('should preserve data after dispose with write failure', () => {
      const tempFile = path.join(os.tmpdir(), `ztm-dispose-data-${Date.now()}`);
      const failingFs = createFailingWriteFs('writeFile');
      const mockLogger = createMockLogger();

      const store = new MessageStateStoreImpl(tempFile, failingFs, mockLogger);
      store.setWatermark('dispose-fail-2', 'peer1', 1000);

      // dispose with write failure
      store.dispose();

      // Data should still be accessible in memory (store doesn't clear memory on dispose)
      expect(store.getWatermark('dispose-fail-2', 'peer1')).toBe(1000);
    });
  });

  describe('concurrent write failures', () => {
    it('should handle multiple flushAsync calls when writes fail', async () => {
      const tempFile = path.join(os.tmpdir(), `ztm-concurrent-fail-${Date.now()}`);
      const failingFs = createFailingWriteFs('writeFile');
      const mockLogger = createMockLogger();

      const store = new MessageStateStoreImpl(tempFile, failingFs, mockLogger);
      store.setWatermark('concurrent-fail-1', 'peer1', 1000);

      // Multiple concurrent flushAsync calls - all should fail gracefully
      const p1 = store.flushAsync();
      const p2 = store.flushAsync();
      const p3 = store.flushAsync();

      await expect(Promise.all([p1, p2, p3])).resolves.toBeDefined();

      // Data should still be in memory
      expect(store.getWatermark('concurrent-fail-1', 'peer1')).toBe(1000);

      store.dispose();
    });

    it('should handle setWatermarkAsync with write failure', async () => {
      const tempFile = path.join(os.tmpdir(), `ztm-async-set-fail-${Date.now()}`);
      const failingFs = createFailingWriteFs('writeFile');
      const mockLogger = createMockLogger();

      const store = new MessageStateStoreImpl(tempFile, failingFs, mockLogger);

      // setWatermarkAsync should work (writes to memory)
      await store.setWatermarkAsync('async-set-fail', 'peer1', 1000);

      // Data should be in memory
      expect(store.getWatermark('async-set-fail', 'peer1')).toBe(1000);

      // flushAsync will fail but data should remain
      await store.flushAsync();
      expect(store.getWatermark('async-set-fail', 'peer1')).toBe(1000);

      store.dispose();
    });

    it('should maintain data integrity after failed flush with multiple updates', async () => {
      const tempFile = path.join(os.tmpdir(), `ztm-integrity-fail-${Date.now()}`);
      const failingFs = createFailingWriteFs('writeFile');
      const mockLogger = createMockLogger();

      const store = new MessageStateStoreImpl(tempFile, failingFs, mockLogger);

      // Multiple updates after a failed flush
      store.setWatermark('integrity-fail', 'peer1', 1000);
      await store.flushAsync(); // fails

      store.setWatermark('integrity-fail', 'peer1', 2000);
      await store.flushAsync(); // fails

      store.setWatermark('integrity-fail', 'peer1', 3000);

      // Latest value should be in memory
      expect(store.getWatermark('integrity-fail', 'peer1')).toBe(3000);

      store.dispose();
    });
  });

  describe('load failure handling', () => {
    it('should handle initial load when file does not exist', async () => {
      const tempFile = path.join(os.tmpdir(), `ztm-nonexistent-${Date.now()}-${Math.random()}`);
      const mockLogger = createMockLogger();

      const store = new MessageStateStoreImpl(tempFile, undefined, mockLogger);
      await store.ensureLoaded();

      // Should work fine - empty state
      expect(store.getWatermark('new-account', 'peer1')).toBe(0);

      store.dispose();
    });

    it('should handle corrupted file gracefully', async () => {
      const tempFile = path.join(os.tmpdir(), `ztm-corrupted-${Date.now()}`);
      const fs = require('fs');

      // Write corrupted data
      fs.writeFileSync(tempFile, 'not valid json {{{', 'utf-8');

      const mockLogger = createMockLogger();
      const store = new MessageStateStoreImpl(tempFile, undefined, mockLogger);
      await store.ensureLoaded();

      // Should handle gracefully and start fresh
      expect(store.getWatermark('any', 'any')).toBe(0);

      // Warning should be logged
      expect(mockLogger.warn).toHaveBeenCalled();

      store.dispose();

      // Cleanup
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    });
  });

  describe('error recovery', () => {
    it('should recover after write failure when fs starts working again', async () => {
      const tempFile = path.join(os.tmpdir(), `ztm-recovery-${Date.now()}`);
      const realFs = require('fs');

      // Start with failing fs
      let useFailingFs = true;
      const hybridFs: FileSystem = {
        existsSync: (p: string) => realFs.existsSync(p),
        mkdirSync: (p: string, opts?: { recursive?: boolean }) => realFs.mkdirSync(p, opts),
        readFileSync: (p: string, enc: string) => realFs.readFileSync(p, enc as BufferEncoding),
        writeFileSync: (p: string, data: string) => {
          if (useFailingFs) {
            throw new Error('Temporary failure');
          }
          return realFs.writeFileSync(p, data);
        },
        chmodSync: (p: string, mode: number) => realFs.chmodSync(p, mode),
        promises: {
          mkdir: async (p: string, opts?: { recursive?: boolean }) =>
            realFs.promises.mkdir(p, opts),
          readFile: async (p: string, enc: string) =>
            realFs.promises.readFile(p, enc as BufferEncoding),
          writeFile: async (p: string, data: string) => {
            if (useFailingFs) {
              throw new Error('Temporary failure');
            }
            await realFs.promises.writeFile(p, data);
          },
          access: async (p: string) => realFs.promises.access(p),
          chmod: async (p: string, mode: number) => realFs.promises.chmod(p, mode),
        },
      };

      const mockLogger = createMockLogger();
      const store = new MessageStateStoreImpl(tempFile, hybridFs, mockLogger);

      // First write - fails
      store.setWatermark('recovery-test', 'peer1', 1000);
      await store.flushAsync();
      expect(store.getWatermark('recovery-test', 'peer1')).toBe(1000);

      // Enable successful writes
      useFailingFs = false;

      // Second write - should succeed now
      store.setWatermark('recovery-test', 'peer1', 2000);
      await store.flushAsync();

      // Verify data persisted
      const store2 = new MessageStateStoreImpl(tempFile);
      expect(store2.getWatermark('recovery-test', 'peer1')).toBe(2000);

      store.dispose();
      store2.dispose();
    });
  });
});
