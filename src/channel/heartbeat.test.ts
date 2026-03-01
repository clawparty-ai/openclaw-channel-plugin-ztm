/**
 * Heartbeat Adapter Tests
 * @module channel/heartbeat.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { failure, success } from '../types/common.js';
import { ZTMTimeoutError, ZTMApiError } from '../types/errors.js';
import { testConfig } from '../test-utils/fixtures.js';

// Mock the container
vi.mock('../di/index.js', () => ({
  container: {
    get: vi.fn(),
  },
  DEPENDENCIES: {
    API_CLIENT_FACTORY: 'API_CLIENT_FACTORY',
    LOGGER: 'LOGGER',
  },
}));

// Mock the config resolution
vi.mock('./config.js', () => ({
  resolveZTMChatAccount: vi.fn(() => ({
    accountId: 'test-account',
    config: testConfig,
  })),
}));

// Mock ztm-config
vi.mock('../utils/ztm-config.js', () => ({
  getZTMChatConfig: vi.fn(() => testConfig),
}));

describe('ztmChatHeartbeatAdapter', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  describe('checkReady', () => {
    it('should export checkReady function', async () => {
      const { ztmChatHeartbeatAdapter } = await import('./heartbeat.js');
      expect(typeof ztmChatHeartbeatAdapter.checkReady).toBe('function');
    });

    it('should return ok false when not configured', async () => {
      const { getZTMChatConfig } = await import('../utils/ztm-config.js');
      // Override mock to return null (invalid config)
      vi.mocked(getZTMChatConfig).mockReturnValueOnce(null);

      const { ztmChatHeartbeatAdapter } = await import('./heartbeat.js');
      const result = await ztmChatHeartbeatAdapter.checkReady!({
        cfg: {},
        accountId: 'default',
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/not configured|unreachable/);
    });

    it('should return ok:true when connected to mesh', async () => {
      const { container } = await import('../di/index.js');
      const { createMockApiClient } = await import('../test-utils/mocks.js');

      // Mock connected state
      const mockClient = createMockApiClient({
        getMeshInfo: vi
          .fn()
          .mockResolvedValue(success({ name: 'test-mesh', connected: true, endpoints: 1 })),
      });

      vi.mocked(container.get).mockImplementation(key => {
        if (String(key).includes('API_CLIENT_FACTORY')) {
          return vi.fn(() => mockClient);
        }
        if (String(key).includes('LOGGER')) {
          return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
        }
        return undefined;
      });

      const { ztmChatHeartbeatAdapter } = await import('./heartbeat.js');
      const result = await ztmChatHeartbeatAdapter.checkReady!({
        cfg: {},
        accountId: 'default',
      });

      expect(result.ok).toBe(true);
      expect(result.reason).toBe('Connected');
    });

    it('should return not connected when mesh disconnected', async () => {
      const { container } = await import('../di/index.js');
      const { createMockApiClient } = await import('../test-utils/mocks.js');

      // Mock disconnected state
      const mockClient = createMockApiClient({
        getMeshInfo: vi
          .fn()
          .mockResolvedValue(success({ name: 'test-mesh', connected: false, endpoints: 0 })),
      });

      vi.mocked(container.get).mockImplementation(key => {
        if (String(key).includes('API_CLIENT_FACTORY')) {
          return vi.fn(() => mockClient);
        }
        if (String(key).includes('LOGGER')) {
          return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
        }
        return undefined;
      });

      const { ztmChatHeartbeatAdapter } = await import('./heartbeat.js');
      const result = await ztmChatHeartbeatAdapter.checkReady!({
        cfg: {},
        accountId: 'default',
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('ZTM Agent is not connected to the mesh network');
    });

    it('should return "Network timeout" on ZTMTimeoutError', async () => {
      const { container } = await import('../di/index.js');

      const timeoutError = new ZTMTimeoutError({
        method: 'GET',
        path: '/mesh',
        timeoutMs: 5000,
      });

      const mockClient = {
        getMeshInfo: vi.fn().mockResolvedValue(failure(timeoutError)),
      };

      vi.mocked(container.get).mockImplementation(key => {
        if (String(key).includes('API_CLIENT_FACTORY')) {
          return vi.fn(() => mockClient);
        }
        if (String(key).includes('LOGGER')) {
          return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
        }
        return undefined;
      });

      const { ztmChatHeartbeatAdapter } = await import('./heartbeat.js');
      const result = await ztmChatHeartbeatAdapter.checkReady!({
        cfg: {},
        accountId: 'default',
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('Network timeout');
    });

    it('should return "Authentication failed" on 401', async () => {
      const { container } = await import('../di/index.js');

      const authError = new ZTMApiError({
        method: 'GET',
        path: '/mesh',
        statusCode: 401,
        statusText: 'Unauthorized',
      });

      const mockClient = {
        getMeshInfo: vi.fn().mockResolvedValue(failure(authError)),
      };

      vi.mocked(container.get).mockImplementation(key => {
        if (String(key).includes('API_CLIENT_FACTORY')) {
          return vi.fn(() => mockClient);
        }
        if (String(key).includes('LOGGER')) {
          return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
        }
        return undefined;
      });

      const { ztmChatHeartbeatAdapter } = await import('./heartbeat.js');
      const result = await ztmChatHeartbeatAdapter.checkReady!({
        cfg: {},
        accountId: 'default',
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('Authentication failed');
    });

    it('should return "Authentication failed" on 403', async () => {
      const { container } = await import('../di/index.js');

      const authError = new ZTMApiError({
        method: 'GET',
        path: '/mesh',
        statusCode: 403,
        statusText: 'Forbidden',
      });

      const mockClient = {
        getMeshInfo: vi.fn().mockResolvedValue(failure(authError)),
      };

      vi.mocked(container.get).mockImplementation(key => {
        if (String(key).includes('API_CLIENT_FACTORY')) {
          return vi.fn(() => mockClient);
        }
        if (String(key).includes('LOGGER')) {
          return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
        }
        return undefined;
      });

      const { ztmChatHeartbeatAdapter } = await import('./heartbeat.js');
      const result = await ztmChatHeartbeatAdapter.checkReady!({
        cfg: {},
        accountId: 'default',
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('Authentication failed');
    });

    it('should return "Server error: 500" on 5xx', async () => {
      const { container } = await import('../di/index.js');

      const serverError = new ZTMApiError({
        method: 'GET',
        path: '/mesh',
        statusCode: 500,
        statusText: 'Internal Server Error',
      });

      const mockClient = {
        getMeshInfo: vi.fn().mockResolvedValue(failure(serverError)),
      };

      vi.mocked(container.get).mockImplementation(key => {
        if (String(key).includes('API_CLIENT_FACTORY')) {
          return vi.fn(() => mockClient);
        }
        if (String(key).includes('LOGGER')) {
          return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
        }
        return undefined;
      });

      const { ztmChatHeartbeatAdapter } = await import('./heartbeat.js');
      const result = await ztmChatHeartbeatAdapter.checkReady!({
        cfg: {},
        accountId: 'default',
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('Server error: 500');
    });

    it('should return generic error for unknown error type', async () => {
      const { container } = await import('../di/index.js');

      const genericError = new Error('Unknown error');

      const mockClient = {
        getMeshInfo: vi.fn().mockResolvedValue(failure(genericError as any)),
      };

      vi.mocked(container.get).mockImplementation(key => {
        if (String(key).includes('API_CLIENT_FACTORY')) {
          return vi.fn(() => mockClient);
        }
        if (String(key).includes('LOGGER')) {
          return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
        }
        return undefined;
      });

      const { ztmChatHeartbeatAdapter } = await import('./heartbeat.js');
      const result = await ztmChatHeartbeatAdapter.checkReady!({
        cfg: {},
        accountId: 'default',
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toContain('Failed to get mesh info');
    });

    it('should return "Agent unreachable" on unexpected exception', async () => {
      const { container } = await import('../di/index.js');

      const mockClient = {
        getMeshInfo: vi.fn().mockRejectedValue(new Error('Unexpected network failure')),
      };

      vi.mocked(container.get).mockImplementation(key => {
        if (String(key).includes('API_CLIENT_FACTORY')) {
          return vi.fn(() => mockClient);
        }
        if (String(key).includes('LOGGER')) {
          return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
        }
        return undefined;
      });

      const { ztmChatHeartbeatAdapter } = await import('./heartbeat.js');
      const result = await ztmChatHeartbeatAdapter.checkReady!({
        cfg: {},
        accountId: 'default',
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toContain('Agent unreachable');
    });
  });

  describe('resolveRecipients', () => {
    it('should export resolveRecipients function', async () => {
      const { ztmChatHeartbeatAdapter } = await import('./heartbeat.js');
      expect(typeof ztmChatHeartbeatAdapter.resolveRecipients).toBe('function');
    });

    it('should return explicit recipient when to is provided', async () => {
      const { ztmChatHeartbeatAdapter } = await import('./heartbeat.js');
      const result = ztmChatHeartbeatAdapter.resolveRecipients!({
        cfg: {},
        opts: { to: 'test-user' },
      });

      expect(result.recipients).toContain('test-user');
      expect(result.source).toBe('explicit');
    });

    it('should return empty when all is true but no peers', async () => {
      const { ztmChatHeartbeatAdapter } = await import('./heartbeat.js');
      const result = ztmChatHeartbeatAdapter.resolveRecipients!({
        cfg: {},
        opts: { all: true },
      });

      expect(result.recipients).toEqual([]);
      expect(result.source).toBe('mesh');
    });
  });
});
