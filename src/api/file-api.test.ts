// Unit tests for File API

import { describe, it, expect, beforeEach } from 'vitest';
import { createFileApi } from './file-api.js';
import { testConfig } from '../test-utils/fixtures.js';

describe('createFileApi', () => {
  const mockLogger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  const mockRequest = async () => ({ ok: true, value: [], error: null });

  beforeEach(() => {
    // Reset any shared state if needed
  });

  describe('seedFileMetadata', () => {
    it('should seed file metadata', () => {
      const fileApi = createFileApi(testConfig, mockRequest as any, mockLogger);

      fileApi.seedFileMetadata({
        '/path/to/file1.json': { time: 1000, size: 100 },
      });

      const exported = fileApi.exportFileMetadata();
      expect(exported).toHaveProperty('/path/to/file1.json');
      expect(exported['/path/to/file1.json'].time).toBe(1000);
    });

    it('should update existing file if time is newer', () => {
      const fileApi = createFileApi(testConfig, mockRequest as any, mockLogger);

      fileApi.seedFileMetadata({
        '/path/to/file1.json': { time: 1000, size: 100 },
      });

      fileApi.seedFileMetadata({
        '/path/to/file1.json': { time: 2000, size: 200 },
      });

      const exported = fileApi.exportFileMetadata();
      expect(exported['/path/to/file1.json'].time).toBe(2000);
      expect(exported['/path/to/file1.json'].size).toBe(200);
    });

    it('should not update existing file if time is older', () => {
      const fileApi = createFileApi(testConfig, mockRequest as any, mockLogger);

      fileApi.seedFileMetadata({
        '/path/to/file1.json': { time: 2000, size: 200 },
      });

      fileApi.seedFileMetadata({
        '/path/to/file1.json': { time: 1000, size: 100 },
      });

      const exported = fileApi.exportFileMetadata();
      expect(exported['/path/to/file1.json'].time).toBe(2000);
      expect(exported['/path/to/file1.json'].size).toBe(200);
    });

    it('should not update existing file if size is smaller', () => {
      const fileApi = createFileApi(testConfig, mockRequest as any, mockLogger);

      fileApi.seedFileMetadata({
        '/path/to/file1.json': { time: 1000, size: 200 },
      });

      fileApi.seedFileMetadata({
        '/path/to/file1.json': { time: 1000, size: 100 },
      });

      const exported = fileApi.exportFileMetadata();
      expect(exported['/path/to/file1.json'].size).toBe(200);
    });

    it('should update file if same time but larger size', () => {
      const fileApi = createFileApi(testConfig, mockRequest as any, mockLogger);

      fileApi.seedFileMetadata({
        '/path/to/file1.json': { time: 1000, size: 100 },
      });

      fileApi.seedFileMetadata({
        '/path/to/file1.json': { time: 1000, size: 200 },
      });

      const exported = fileApi.exportFileMetadata();
      expect(exported['/path/to/file1.json'].size).toBe(200);
    });

    it('should seed multiple files', () => {
      const fileApi = createFileApi(testConfig, mockRequest as any, mockLogger);

      fileApi.seedFileMetadata({
        '/path/to/file1.json': { time: 1000, size: 100 },
        '/path/to/file2.json': { time: 2000, size: 200 },
        '/path/to/file3.json': { time: 3000, size: 300 },
      });

      const exported = fileApi.exportFileMetadata();
      expect(Object.keys(exported).length).toBe(3);
    });

    it('should handle empty metadata', () => {
      const fileApi = createFileApi(testConfig, mockRequest as any, mockLogger);

      fileApi.seedFileMetadata({});

      const exported = fileApi.exportFileMetadata();
      expect(Object.keys(exported).length).toBe(0);
    });
  });

  describe('exportFileMetadata', () => {
    it('should return empty object initially', () => {
      const fileApi = createFileApi(testConfig, mockRequest as any, mockLogger);

      const exported = fileApi.exportFileMetadata();
      expect(exported).toEqual({});
    });

    it('should export previously seeded metadata', () => {
      const fileApi = createFileApi(testConfig, mockRequest as any, mockLogger);

      fileApi.seedFileMetadata({
        '/path/to/file1.json': { time: 1000, size: 100 },
      });

      const exported = fileApi.exportFileMetadata();
      expect(exported).toEqual({
        '/path/to/file1.json': { time: 1000, size: 100 },
      });
    });

    it('should return reference to internal map, not a copy', () => {
      const fileApi = createFileApi(testConfig, mockRequest as any, mockLogger);

      fileApi.seedFileMetadata({
        '/path/to/file1.json': { time: 1000, size: 100 },
      });

      const exported1 = fileApi.exportFileMetadata();
      const exported2 = fileApi.exportFileMetadata();

      // The function returns the same reference, so modifications affect both
      exported1['/path/to/file1.json'].time = 9999;

      expect(exported2['/path/to/file1.json'].time).toBe(9999);
    });
  });

  describe('memory management', () => {
    it('should limit tracked files to MAX_TRACKED_FILES', () => {
      const fileApi = createFileApi(testConfig, mockRequest as any, mockLogger);

      // Seed more than MAX_TRACKED_FILES (500) files
      for (let i = 0; i < 600; i++) {
        fileApi.seedFileMetadata({
          [`/path/to/file${i}.json`]: { time: i, size: i },
        });
      }

      const exported = fileApi.exportFileMetadata();
      // Should have trimmed to MAX_TRACKED_FILES or less
      expect(Object.keys(exported).length).toBeLessThanOrEqual(500);
    });
  });

  describe('file metadata edge cases', () => {
    it('should handle zero time', () => {
      const fileApi = createFileApi(testConfig, mockRequest as any, mockLogger);

      fileApi.seedFileMetadata({
        '/path/to/file1.json': { time: 0, size: 100 },
      });

      const exported = fileApi.exportFileMetadata();
      expect(exported['/path/to/file1.json'].time).toBe(0);
    });

    it('should handle zero size', () => {
      const fileApi = createFileApi(testConfig, mockRequest as any, mockLogger);

      fileApi.seedFileMetadata({
        '/path/to/file1.json': { time: 1000, size: 0 },
      });

      const exported = fileApi.exportFileMetadata();
      expect(exported['/path/to/file1.json'].size).toBe(0);
    });

    it('should handle very large values', () => {
      const fileApi = createFileApi(testConfig, mockRequest as any, mockLogger);

      fileApi.seedFileMetadata({
        '/path/to/file1.json': { time: Number.MAX_SAFE_INTEGER, size: Number.MAX_SAFE_INTEGER },
      });

      const exported = fileApi.exportFileMetadata();
      expect(exported['/path/to/file1.json'].time).toBe(Number.MAX_SAFE_INTEGER);
    });
  });
});
