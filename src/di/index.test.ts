// Unit tests for DI service factories
// Tests the factory functions exported from di/index.ts

import { describe, it, expect } from 'vitest';

describe('DI Service Factories', () => {
  describe('createLogger', () => {
    it('should create logger factory', async () => {
      const { createLogger } = await import('./index.js');
      const factory = createLogger('test-service');
      expect(typeof factory).toBe('function');
    });

    it('should return ILogger instance', async () => {
      const { createLogger } = await import('./index.js');
      const factory = createLogger('test-service');
      const logger = factory();

      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });
  });

  describe('createConfigService', () => {
    it('should create config service factory', async () => {
      const { createConfigService } = await import('./index.js');
      const factory = createConfigService();
      expect(typeof factory).toBe('function');
    });

    it('should return IConfig with get and isValid methods', async () => {
      const { createConfigService } = await import('./index.js');
      const factory = createConfigService();
      const config = factory();

      expect(typeof config.get).toBe('function');
      expect(typeof config.isValid).toBe('function');
    });
  });

  describe('createApiClientService', () => {
    it('should create API client service factory', async () => {
      const { createApiClientService } = await import('./index.js');
      const factory = createApiClientService();
      expect(typeof factory).toBe('function');
    });

    it('should return IApiClient with required methods', async () => {
      const { createApiClientService } = await import('./index.js');
      const factory = createApiClientService();
      const client = factory();

      expect(typeof client.getMeshInfo).toBe('function');
      expect(typeof client.getChats).toBe('function');
      expect(typeof client.sendPeerMessage).toBe('function');
    });
  });

  describe('createApiClientFactory', () => {
    it('should create API client factory', async () => {
      const { createApiClientFactory } = await import('./index.js');
      const factory = createApiClientFactory();
      expect(typeof factory).toBe('function');
    });

    it('should return factory that creates API clients', async () => {
      const { createApiClientFactory } = await import('./index.js');
      const factory = createApiClientFactory();
      const clientFactory = factory();

      expect(typeof clientFactory).toBe('function');
    });
  });

  describe('createAllowFromRepositoryService', () => {
    it('should create allow from repository service factory', async () => {
      const { createAllowFromRepositoryService } = await import('./index.js');
      const factory = createAllowFromRepositoryService();
      expect(typeof factory).toBe('function');
    });

    it('should return IAllowFromRepository with required methods', async () => {
      const { createAllowFromRepositoryService } = await import('./index.js');
      const factory = createAllowFromRepositoryService();
      const repo = factory();

      expect(typeof repo.getAllowFrom).toBe('function');
      expect(typeof repo.clearCache).toBe('function');
    });
  });

  describe('createMessageStateRepositoryService', () => {
    it('should create message state repository service factory', async () => {
      const { createMessageStateRepositoryService } = await import('./index.js');
      const factory = createMessageStateRepositoryService();
      expect(typeof factory).toBe('function');
    });

    it('should return IMessageStateRepository with required methods', async () => {
      const { createMessageStateRepositoryService } = await import('./index.js');
      const factory = createMessageStateRepositoryService();
      const repo = factory();

      expect(typeof repo.getWatermark).toBe('function');
      expect(typeof repo.setWatermark).toBe('function');
    });
  });
});
