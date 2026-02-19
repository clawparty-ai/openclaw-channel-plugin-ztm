// Unit tests for Messaging Context
// Tests for createMessagingContext function and MessagingContext interface

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMessagingContext } from './context.js';

// Mock the DI container
vi.mock('../di/index.js', () => ({
  container: {
    get: vi.fn(),
  },
  DEPENDENCIES: {
    ALLOW_FROM_REPO: 'ALLOW_FROM_REPO',
    MESSAGE_STATE_REPO: 'MESSAGE_STATE_REPO',
  },
}));

// Mock repositories based on actual interface
const mockAllowFromRepo = {
  getAllowFrom: vi.fn().mockResolvedValue(['alice', 'bob']),
  clearCache: vi.fn(),
};

const mockMessageStateRepo = {
  getWatermark: vi.fn().mockReturnValue(0),
  setWatermark: vi.fn(),
  getFileMetadata: vi.fn().mockReturnValue(undefined),
  setFileMetadataBulk: vi.fn(),
};

describe('MessagingContext', () => {
  let mockContainer: {
    get: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const { container } = await import('../di/index.js');
    mockContainer = container as unknown as typeof mockContainer;
    mockContainer.get = vi.fn();
  });

  describe('createMessagingContext', () => {
    it('should create messaging context with required repositories', async () => {
      mockContainer.get
        .mockReturnValueOnce(mockAllowFromRepo)
        .mockReturnValueOnce(mockMessageStateRepo);

      const context = createMessagingContext({} as any);

      expect(context).toHaveProperty('allowFromRepo');
      expect(context).toHaveProperty('messageStateRepo');
      expect(context.allowFromRepo).toBe(mockAllowFromRepo);
      expect(context.messageStateRepo).toBe(mockMessageStateRepo);
    });

    it('should throw error when allowFromRepo is not available', async () => {
      mockContainer.get.mockReturnValueOnce(null).mockReturnValueOnce(mockMessageStateRepo);

      expect(() => createMessagingContext({} as any)).toThrow(
        'Required repositories not available in container'
      );
    });

    it('should throw error when messageStateRepo is not available', async () => {
      mockContainer.get.mockReturnValueOnce(mockAllowFromRepo).mockReturnValueOnce(null);

      expect(() => createMessagingContext({} as any)).toThrow(
        'Required repositories not available in container'
      );
    });

    it('should throw error when both repositories are not available', async () => {
      mockContainer.get.mockReturnValueOnce(null).mockReturnValueOnce(null);

      expect(() => createMessagingContext({} as any)).toThrow(
        'Required repositories not available in container'
      );
    });
  });

  describe('MessagingContext interface', () => {
    it('should provide allowFromRepo with required methods', async () => {
      mockContainer.get
        .mockReturnValueOnce(mockAllowFromRepo)
        .mockReturnValueOnce(mockMessageStateRepo);

      const context = createMessagingContext({} as any);

      expect(typeof context.allowFromRepo.getAllowFrom).toBe('function');
      expect(typeof context.allowFromRepo.clearCache).toBe('function');
    });

    it('should provide messageStateRepo with required methods', async () => {
      mockContainer.get
        .mockReturnValueOnce(mockAllowFromRepo)
        .mockReturnValueOnce(mockMessageStateRepo);

      const context = createMessagingContext({} as any);

      expect(typeof context.messageStateRepo.getWatermark).toBe('function');
      expect(typeof context.messageStateRepo.setWatermark).toBe('function');
      expect(typeof context.messageStateRepo.getFileMetadata).toBe('function');
      expect(typeof context.messageStateRepo.setFileMetadataBulk).toBe('function');
    });
  });

  describe('allowFromRepo operations', () => {
    it('should get allowFrom list', async () => {
      const mockSenders = ['alice', 'bob'];
      mockAllowFromRepo.getAllowFrom.mockResolvedValue(mockSenders);

      mockContainer.get
        .mockReturnValueOnce(mockAllowFromRepo)
        .mockReturnValueOnce(mockMessageStateRepo);

      const context = createMessagingContext({} as any);
      const runtime = {} as any;
      const result = await context.allowFromRepo.getAllowFrom('test-account', runtime);

      expect(result).toEqual(mockSenders);
      expect(mockAllowFromRepo.getAllowFrom).toHaveBeenCalledWith('test-account', runtime);
    });

    it('should clear allowFrom cache', async () => {
      mockContainer.get
        .mockReturnValueOnce(mockAllowFromRepo)
        .mockReturnValueOnce(mockMessageStateRepo);

      const context = createMessagingContext({} as any);
      context.allowFromRepo.clearCache('test-account');

      expect(mockAllowFromRepo.clearCache).toHaveBeenCalledWith('test-account');
    });

    it('should handle null from getAllowFrom', async () => {
      mockAllowFromRepo.getAllowFrom.mockResolvedValue(null);

      mockContainer.get
        .mockReturnValueOnce(mockAllowFromRepo)
        .mockReturnValueOnce(mockMessageStateRepo);

      const context = createMessagingContext({} as any);
      const runtime = {} as any;
      const result = await context.allowFromRepo.getAllowFrom('test-account', runtime);

      expect(result).toBeNull();
    });
  });

  describe('messageStateRepo operations', () => {
    it('should get watermark', async () => {
      mockMessageStateRepo.getWatermark.mockReturnValue(100);

      mockContainer.get
        .mockReturnValueOnce(mockAllowFromRepo)
        .mockReturnValueOnce(mockMessageStateRepo);

      const context = createMessagingContext({} as any);
      const watermark = context.messageStateRepo.getWatermark('test-account', 'alice');

      expect(watermark).toBe(100);
      expect(mockMessageStateRepo.getWatermark).toHaveBeenCalledWith('test-account', 'alice');
    });

    it('should set watermark', async () => {
      mockContainer.get
        .mockReturnValueOnce(mockAllowFromRepo)
        .mockReturnValueOnce(mockMessageStateRepo);

      const context = createMessagingContext({} as any);
      context.messageStateRepo.setWatermark('test-account', 'alice', 100);

      expect(mockMessageStateRepo.setWatermark).toHaveBeenCalledWith('test-account', 'alice', 100);
    });

    it('should get file metadata', async () => {
      const mockMetadata = { time: 1234567890, size: 1024 };
      mockMessageStateRepo.getFileMetadata.mockReturnValue(mockMetadata);

      mockContainer.get
        .mockReturnValueOnce(mockAllowFromRepo)
        .mockReturnValueOnce(mockMessageStateRepo);

      const context = createMessagingContext({} as any);
      const metadata = context.messageStateRepo.getFileMetadata('test-account');

      expect(metadata).toEqual(mockMetadata);
      expect(mockMessageStateRepo.getFileMetadata).toHaveBeenCalledWith('test-account');
    });

    it('should set file metadata in bulk', async () => {
      const mockMetadata = { file1: { time: 1234567890, size: 1024 } };

      mockContainer.get
        .mockReturnValueOnce(mockAllowFromRepo)
        .mockReturnValueOnce(mockMessageStateRepo);

      const context = createMessagingContext({} as any);
      context.messageStateRepo.setFileMetadataBulk('test-account', mockMetadata);

      expect(mockMessageStateRepo.setFileMetadataBulk).toHaveBeenCalledWith(
        'test-account',
        mockMetadata
      );
    });

    it('should return 0 for missing watermark', async () => {
      mockMessageStateRepo.getWatermark.mockReturnValue(0);

      mockContainer.get
        .mockReturnValueOnce(mockAllowFromRepo)
        .mockReturnValueOnce(mockMessageStateRepo);

      const context = createMessagingContext({} as any);
      const watermark = context.messageStateRepo.getWatermark('test-account', 'nonexistent');

      expect(watermark).toBe(0);
    });
  });
});
