// Unit tests for Messaging Context
// Tests for createMessagingContext function and MessagingContext interface

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMessagingContext } from './context.js';
import type { IAllowFromRepository, IMessageStateRepository } from '../runtime/repository.js';

// Mock repositories based on actual interface
const mockAllowFromRepo: IAllowFromRepository = {
  getAllowFrom: vi.fn().mockResolvedValue(['alice', 'bob']),
  clearCache: vi.fn(),
};

const mockMessageStateRepo: IMessageStateRepository = {
  getWatermark: vi.fn().mockReturnValue(0),
  setWatermark: vi.fn(),
  flush: vi.fn(),
};

describe('MessagingContext', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  describe('createMessagingContext', () => {
    it('should create messaging context with required repositories', () => {
      const context = createMessagingContext(mockAllowFromRepo, mockMessageStateRepo);

      expect(context).toHaveProperty('allowFromRepo');
      expect(context).toHaveProperty('messageStateRepo');
      expect(context.allowFromRepo).toBe(mockAllowFromRepo);
      expect(context.messageStateRepo).toBe(mockMessageStateRepo);
    });

    it('should throw error when allowFromRepo is not available', () => {
      expect(() => createMessagingContext(null as any, mockMessageStateRepo)).toThrow(
        'Required repositories not available'
      );
    });

    it('should throw error when messageStateRepo is not available', () => {
      expect(() => createMessagingContext(mockAllowFromRepo, null as any)).toThrow(
        'Required repositories not available'
      );
    });

    it('should throw error when both repositories are not available', () => {
      expect(() => createMessagingContext(null as any, null as any)).toThrow(
        'Required repositories not available'
      );
    });

    it('should return context with correct structure', () => {
      const context = createMessagingContext(mockAllowFromRepo, mockMessageStateRepo);

      expect(context.allowFromRepo.getAllowFrom).toBeDefined();
      expect(context.allowFromRepo.clearCache).toBeDefined();
      expect(context.messageStateRepo.getWatermark).toBeDefined();
      expect(context.messageStateRepo.setWatermark).toBeDefined();
      expect(context.messageStateRepo.flush).toBeDefined();
    });

    it('should allow calling repository methods on returned context', async () => {
      const context = createMessagingContext(mockAllowFromRepo, mockMessageStateRepo);
      const mockRuntime = {} as any;

      await context.allowFromRepo.getAllowFrom('account1', mockRuntime);
      expect(mockAllowFromRepo.getAllowFrom).toHaveBeenCalledWith('account1', mockRuntime);

      context.messageStateRepo.setWatermark('account1', 'peer:alice', 100);
      expect(mockMessageStateRepo.setWatermark).toHaveBeenCalledWith('account1', 'peer:alice', 100);

      context.messageStateRepo.flush();
      expect(mockMessageStateRepo.flush).toHaveBeenCalledTimes(1);
    });
  });

  // Step 5: Message context edge cases - Partial repository failures
  describe('edge cases - partial repository failures', () => {
    it('should handle getWatermark success but setWatermark failure', () => {
      const failingSetRepo: IMessageStateRepository = {
        getWatermark: vi.fn().mockReturnValue(100),
        setWatermark: vi.fn().mockImplementation(() => {
          throw new Error('Storage write failed');
        }),
        flush: vi.fn(),
      };

      const context = createMessagingContext(mockAllowFromRepo, failingSetRepo);

      // getWatermark should work
      const watermark = context.messageStateRepo.getWatermark('account1', 'peer:alice');
      expect(watermark).toBe(100);
      expect(failingSetRepo.getWatermark).toHaveBeenCalledWith('account1', 'peer:alice');

      // setWatermark should throw when called
      expect(() => {
        context.messageStateRepo.setWatermark('account1', 'peer:alice', 200);
      }).toThrow('Storage write failed');
    });

    it('should handle getWatermark returning invalid values', () => {
      const invalidWatermarkRepo: IMessageStateRepository = {
        getWatermark: vi.fn().mockReturnValue(-1),
        setWatermark: vi.fn(),
        flush: vi.fn(),
      };

      const context = createMessagingContext(mockAllowFromRepo, invalidWatermarkRepo);

      // Invalid watermark should still be returned (caller handles -1)
      const watermark = context.messageStateRepo.getWatermark('account1', 'peer:alice');
      expect(watermark).toBe(-1);
    });

    it('should handle getWatermark returning undefined-like value', () => {
      const undefinedWatermarkRepo: IMessageStateRepository = {
        getWatermark: vi.fn().mockReturnValue(0),
        setWatermark: vi.fn(),
        flush: vi.fn(),
      };

      const context = createMessagingContext(mockAllowFromRepo, undefinedWatermarkRepo);

      // 0 is the default "not found" value
      const watermark = context.messageStateRepo.getWatermark('account1', 'peer:unknown');
      expect(watermark).toBe(0);
    });
  });

  // Edge cases - incomplete group data
  describe('edge cases - incomplete group data', () => {
    it('should handle getAllowFrom returning null', async () => {
      const nullAllowFromRepo: IAllowFromRepository = {
        getAllowFrom: vi.fn().mockResolvedValue(null),
        clearCache: vi.fn(),
      };

      const context = createMessagingContext(nullAllowFromRepo, mockMessageStateRepo);
      const mockRuntime = {} as any;

      const result = await context.allowFromRepo.getAllowFrom('account1', mockRuntime);
      expect(result).toBeNull();
    });

    it('should handle getAllowFrom throwing error', async () => {
      const failingAllowFromRepo: IAllowFromRepository = {
        getAllowFrom: vi.fn().mockRejectedValue(new Error('Network error')),
        clearCache: vi.fn(),
      };

      const context = createMessagingContext(failingAllowFromRepo, mockMessageStateRepo);
      const mockRuntime = {} as any;

      await expect(context.allowFromRepo.getAllowFrom('account1', mockRuntime)).rejects.toThrow(
        'Network error'
      );
    });

    it('should handle empty allowFrom array', async () => {
      const emptyAllowFromRepo: IAllowFromRepository = {
        getAllowFrom: vi.fn().mockResolvedValue([]),
        clearCache: vi.fn(),
      };

      const context = createMessagingContext(emptyAllowFromRepo, mockMessageStateRepo);
      const mockRuntime = {} as any;

      const result = await context.allowFromRepo.getAllowFrom('account1', mockRuntime);
      expect(result).toEqual([]);
    });

    it('should handle allowFrom with null/undefined entries', async () => {
      const allowFromWithNullsRepo: IAllowFromRepository = {
        getAllowFrom: vi.fn().mockResolvedValue(['alice', null as any, 'bob', undefined as any]),
        clearCache: vi.fn(),
      };

      const context = createMessagingContext(allowFromWithNullsRepo, mockMessageStateRepo);
      const mockRuntime = {} as any;

      const result = await context.allowFromRepo.getAllowFrom('account1', mockRuntime);
      expect(result).toEqual(['alice', null, 'bob', undefined]);
    });
  });
});
