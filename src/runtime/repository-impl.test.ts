// Unit tests for Repository implementations

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testAccountId } from '../test-utils/fixtures.js';
import {
  AllowFromRepository,
  MessageStateRepository,
  getAllowFromRepository,
  getMessageStateRepository,
} from './repository-impl.js';
import type { IAllowFromRepository, IMessageStateRepository } from './repository.js';

// Mock dependencies
vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('./store.js', () => ({
  getAccountMessageStateStore: vi.fn(),
}));

vi.mock('./state.js', () => ({
  getAllowFromCache: vi.fn(),
  clearAllowFromCache: vi.fn(),
}));

import { getAccountMessageStateStore } from './store.js';
import { getAllowFromCache, clearAllowFromCache } from './state.js';

describe('AllowFromRepository', () => {
  let repository: IAllowFromRepository;
  const mockRuntime = { channel: { pairing: { readAllowFromStore: vi.fn() } } } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    (getAccountMessageStateStore as ReturnType<typeof vi.fn>).mockReturnValue({
      getWatermark: vi.fn(() => 0),
      setWatermark: vi.fn(),
      flush: vi.fn(),
      dispose: vi.fn(),
    });
    repository = new AllowFromRepository();
  });

  describe('getAllowFrom', () => {
    it('should return cached allowFrom array', async () => {
      const mockAllowFrom = ['alice', 'bob'];
      (getAllowFromCache as ReturnType<typeof vi.fn>).mockResolvedValue(mockAllowFrom);

      const result = await repository.getAllowFrom(testAccountId, mockRuntime);

      expect(result).toEqual(['alice', 'bob']);
      expect(getAllowFromCache).toHaveBeenCalledWith(testAccountId, mockRuntime);
    });

    it('should return null when cache fetch fails', async () => {
      (getAllowFromCache as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await repository.getAllowFrom(testAccountId, mockRuntime);

      expect(result).toBeNull();
    });

    it('should return empty array when no allowFrom entries', async () => {
      (getAllowFromCache as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await repository.getAllowFrom(testAccountId, mockRuntime);

      expect(result).toEqual([]);
    });
  });

  describe('clearCache', () => {
    it('should clear cache for account', () => {
      repository.clearCache(testAccountId);

      expect(clearAllowFromCache).toHaveBeenCalledWith(testAccountId);
    });
  });
});

describe('MessageStateRepository', () => {
  let repository: IMessageStateRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    (getAccountMessageStateStore as ReturnType<typeof vi.fn>).mockReturnValue({
      getWatermark: vi.fn((accountId: string, key: string) => {
        if (key === 'peer:alice') return 1000;
        if (key === 'group:test/group1') return 2000;
        return 0;
      }),
      setWatermark: vi.fn(),
      flush: vi.fn(),
      dispose: vi.fn(),
    });
    repository = new MessageStateRepository();
  });

  describe('getWatermark', () => {
    it('should return watermark for peer key', () => {
      const watermark = repository.getWatermark(testAccountId, 'peer:alice');

      expect(watermark).toBe(1000);
    });

    it('should return watermark for group key', () => {
      const watermark = repository.getWatermark(testAccountId, 'group:test/group1');

      expect(watermark).toBe(2000);
    });

    it('should return 0 for unknown key', () => {
      const watermark = repository.getWatermark(testAccountId, 'peer:unknown');

      expect(watermark).toBe(0);
    });
  });

  describe('setWatermark', () => {
    it('should set watermark for key', () => {
      repository.setWatermark(testAccountId, 'peer:bob', 5000);

      const mockStore = (getAccountMessageStateStore as ReturnType<typeof vi.fn>).mock.results[0]
        .value;
      expect(mockStore.setWatermark).toHaveBeenCalledWith(testAccountId, 'peer:bob', 5000);
    });
  });

  describe('flush', () => {
    it('should be a no-op implementation', () => {
      expect(() => repository.flush()).not.toThrow();
    });
  });
});

describe('Repository Singletons', () => {
  it('should return same AllowFromRepository instance', () => {
    const repo1 = getAllowFromRepository();
    const repo2 = getAllowFromRepository();

    expect(repo1).toBe(repo2);
  });

  it('should return same MessageStateRepository instance', () => {
    const repo1 = getMessageStateRepository();
    const repo2 = getMessageStateRepository();

    expect(repo1).toBe(repo2);
  });

  it('should return instances that implement correct interfaces', () => {
    const allowFromRepo = getAllowFromRepository();
    const messageStateRepo = getMessageStateRepository();

    expect(allowFromRepo).toHaveProperty('getAllowFrom');
    expect(allowFromRepo).toHaveProperty('clearCache');
    expect(messageStateRepo).toHaveProperty('getWatermark');
    expect(messageStateRepo).toHaveProperty('setWatermark');
    expect(messageStateRepo).toHaveProperty('flush');
  });
});

describe('Repository Integration', () => {
  let allowFromRepo: IAllowFromRepository;
  let messageStateRepo: IMessageStateRepository;
  const mockRuntime = { channel: { pairing: { readAllowFromStore: vi.fn() } } } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    (getAccountMessageStateStore as ReturnType<typeof vi.fn>).mockReturnValue({
      getWatermark: vi.fn((_: string, key: string) => {
        if (key === 'peer:alice') return 1000;
        return 0;
      }),
      setWatermark: vi.fn(),
      flush: vi.fn(),
      dispose: vi.fn(),
    });
    allowFromRepo = new AllowFromRepository();
    messageStateRepo = new MessageStateRepository();
  });

  it('should work together for message processing workflow', async () => {
    // Step 1: Check if sender is allowed
    (getAllowFromCache as ReturnType<typeof vi.fn>).mockResolvedValue(['alice', 'charlie']);
    const allowFrom = await allowFromRepo.getAllowFrom(testAccountId, mockRuntime);

    // Step 2: Get watermark for this peer
    const watermark = messageStateRepo.getWatermark(testAccountId, 'peer:alice');

    // Verify both operations completed
    expect(allowFrom).toContain('alice');
    expect(watermark).toBe(1000);
  });

  it('should handle full state lifecycle', () => {
    // Save watermark
    messageStateRepo.setWatermark(testAccountId, 'peer:alice', 5000);

    // Verify setWatermark was called
    const mockStore = (getAccountMessageStateStore as ReturnType<typeof vi.fn>).mock.results[0]
      .value;
    expect(mockStore.setWatermark).toHaveBeenCalledWith(testAccountId, 'peer:alice', 5000);

    // Clear allowFrom cache
    allowFromRepo.clearCache(testAccountId);
    expect(clearAllowFromCache).toHaveBeenCalledWith(testAccountId);
  });
});
