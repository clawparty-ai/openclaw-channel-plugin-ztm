// Unit tests for Mesh API

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMeshApi } from './mesh-api.js';
import { testConfig } from '../test-utils/fixtures.js';
import type { ZTMMeshInfo } from '../types/api.js';
import type { ZTMLogger, RequestHandler } from './request.js';

// Mock logger module
vi.mock('../utils/logger.js', async () => {
  const mod = await vi.importActual<typeof import('../utils/logger.js')>('../utils/logger.js');
  return {
    ...mod,
    defaultLogger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

describe('Mesh API', () => {
  let mockLogger: ZTMLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  });

  function createMockRequest<T>(response: {
    ok: boolean;
    value?: T;
    error?: Error;
  }): RequestHandler {
    return vi.fn().mockResolvedValue(response) as unknown as RequestHandler;
  }

  describe('createMeshApi', () => {
    it('should return an object with all required methods', () => {
      // Return valid API response format to avoid accessing undefined properties
      const mockRequest = createMockRequest({
        ok: true,
        value: { name: 'test-mesh', connected: false, agent: { username: 'test' } },
      });
      const meshApi = createMeshApi(testConfig, mockRequest, mockLogger);

      expect(meshApi).toHaveProperty('getMeshInfo');
      expect(meshApi).toHaveProperty('listUsers');
      expect(meshApi).toHaveProperty('discoverUsers');
      expect(meshApi).toHaveProperty('discoverPeers');
    });

    it('should use config.meshName in API paths', () => {
      const customConfig = { ...testConfig, meshName: 'custom-mesh' };
      const mockRequest = createMockRequest({
        ok: true,
        value: { name: 'custom-mesh', connected: false, agent: { username: 'test' } },
      });
      const meshApi = createMeshApi(customConfig, mockRequest, mockLogger);

      // Call getMeshInfo to trigger the request
      meshApi.getMeshInfo();

      expect(mockRequest).toHaveBeenCalledWith('GET', '/api/meshes/custom-mesh');
    });
  });

  describe('getMeshInfo', () => {
    it('should return mesh info successfully', async () => {
      // API returns agent.username, we map it to top-level username
      const apiResponse = {
        name: 'test-mesh',
        connected: true,
        agent: { username: 'test-user' },
        errors: [],
      };
      const expectedMeshInfo: ZTMMeshInfo = {
        name: 'test-mesh',
        connected: true,
        username: 'test-user',
        errors: [],
      };
      const mockRequest = createMockRequest({ ok: true, value: apiResponse });
      const meshApi = createMeshApi(testConfig, mockRequest, mockLogger);

      const result = await meshApi.getMeshInfo();

      expect(result.ok).toBe(true);
      expect(result.value).toEqual(expectedMeshInfo);
      expect(mockRequest).toHaveBeenCalledWith('GET', '/api/meshes/test-mesh');
    });

    it('should handle API error', async () => {
      const mockRequest = createMockRequest<ZTMMeshInfo>({
        ok: false,
        error: new Error('Network error'),
      });
      const meshApi = createMeshApi(testConfig, mockRequest, mockLogger);

      const result = await meshApi.getMeshInfo();

      expect(result.ok).toBe(false);
    });
  });

  describe('listUsers', () => {
    it('should return list of users successfully', async () => {
      const users = ['alice', 'bob', 'charlie'];
      const mockRequest = createMockRequest<string[]>({ ok: true, value: users });
      const meshApi = createMeshApi(testConfig, mockRequest, mockLogger);

      const result = await meshApi.listUsers();

      expect(result.ok).toBe(true);
      expect(result.value).toHaveLength(3);
      expect(result.value).toEqual(users.map(username => ({ username })));
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('should handle empty user list', async () => {
      const mockRequest = createMockRequest<string[]>({ ok: true, value: [] });
      const meshApi = createMeshApi(testConfig, mockRequest, mockLogger);

      const result = await meshApi.listUsers();

      expect(result.ok).toBe(true);
      expect(result.value).toHaveLength(0);
    });

    it('should handle API error with ZTMDiscoveryError', async () => {
      const mockRequest = createMockRequest<string[]>({
        ok: false,
        error: new Error('Failed to fetch users'),
      });
      const meshApi = createMeshApi(testConfig, mockRequest, mockLogger);

      const result = await meshApi.listUsers();

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should use CHAT_API_BASE path for user listing', async () => {
      const mockRequest = createMockRequest<string[]>({ ok: true, value: [] });
      const meshApi = createMeshApi(testConfig, mockRequest, mockLogger);

      await meshApi.listUsers();

      expect(mockRequest).toHaveBeenCalledWith(
        'GET',
        '/api/meshes/test-mesh/apps/ztm/chat/api/users'
      );
    });
  });

  describe('discoverUsers', () => {
    it('should delegate to listUsers', async () => {
      const users = ['alice', 'bob'];
      const mockRequest = createMockRequest<string[]>({ ok: true, value: users });
      const meshApi = createMeshApi(testConfig, mockRequest, mockLogger);

      const result = await meshApi.discoverUsers();

      expect(result.ok).toBe(true);
      expect(result.value).toHaveLength(2);
    });

    it('should propagate errors from listUsers', async () => {
      const mockRequest = createMockRequest<string[]>({
        ok: false,
        error: new Error('Discovery failed'),
      });
      const meshApi = createMeshApi(testConfig, mockRequest, mockLogger);

      const result = await meshApi.discoverUsers();

      expect(result.ok).toBe(false);
    });
  });

  describe('discoverPeers', () => {
    it('should return peers from user list successfully', async () => {
      const users = ['alice', 'bob'];
      const mockRequest = createMockRequest<string[]>({ ok: true, value: users });
      const meshApi = createMeshApi(testConfig, mockRequest, mockLogger);

      const result = await meshApi.discoverPeers();

      expect(result.ok).toBe(true);
      expect(result.value).toHaveLength(2);
      expect(result.value).toEqual(users.map(username => ({ username })));
    });

    it('should handle empty peer list', async () => {
      const mockRequest = createMockRequest<string[]>({ ok: true, value: [] });
      const meshApi = createMeshApi(testConfig, mockRequest, mockLogger);

      const result = await meshApi.discoverPeers();

      expect(result.ok).toBe(true);
      expect(result.value).toHaveLength(0);
    });

    it('should handle API error with ZTMDiscoveryError', async () => {
      const mockRequest = createMockRequest<string[]>({
        ok: false,
        error: new Error('Failed to discover peers'),
      });
      const meshApi = createMeshApi(testConfig, mockRequest, mockLogger);

      const result = await meshApi.discoverPeers();

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle null/undefined user list gracefully', async () => {
      const mockRequest = createMockRequest<null>({ ok: true, value: null });
      const meshApi = createMeshApi(testConfig, mockRequest, mockLogger);

      const result = await meshApi.discoverPeers();

      expect(result.ok).toBe(true);
      expect(result.value).toHaveLength(0);
    });
  });

  describe('error handling edge cases', () => {
    it('should handle listUsers returning undefined value', async () => {
      const mockRequest = createMockRequest<string[]>({
        ok: true,
        value: undefined as unknown as string[],
      });
      const meshApi = createMeshApi(testConfig, mockRequest, mockLogger);

      const result = await meshApi.listUsers();

      expect(result.ok).toBe(true);
      expect(result.value).toEqual([]);
    });
  });
});
