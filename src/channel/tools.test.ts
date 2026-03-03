/**
 * Agent Tools Tests
 * @module channel/tools.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { success, failure } from '../types/common.js';
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

describe('tool constants', () => {
  it('should have consistent error messages across tools', async () => {
    const { ztmStatusTool, ztmMeshInfoTool, ztmPeersTool } = await import('./tools.js');

    // Each tool should have execute method
    expect(typeof ztmStatusTool.execute).toBe('function');
    expect(typeof ztmMeshInfoTool.execute).toBe('function');
    expect(typeof ztmPeersTool.execute).toBe('function');
  });
});

describe('createZTMChatAgentTools', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  describe('factory returns', () => {
    it('should export createZTMChatAgentTools function', async () => {
      const { createZTMChatAgentTools } = await import('./tools.js');
      expect(typeof createZTMChatAgentTools).toBe('function');
    });

    it('should return empty array when not configured', async () => {
      const { getZTMChatConfig } = await import('../utils/ztm-config.js');
      vi.mocked(getZTMChatConfig).mockReturnValueOnce(null);

      const { createZTMChatAgentTools } = await import('./tools.js');
      const tools = createZTMChatAgentTools({ cfg: {} });
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(0);
    });

    it('should return 3 tools when configured', async () => {
      const { createZTMChatAgentTools } = await import('./tools.js');
      const tools = createZTMChatAgentTools({ cfg: {} });
      expect(tools.length).toBe(3);
    });
  });

  describe('tool definitions', () => {
    it('should export ztmStatusTool with correct properties', async () => {
      const { ztmStatusTool } = await import('./tools.js');
      expect(ztmStatusTool.name).toBe('ztm_status');
      expect(ztmStatusTool.label).toBe('ZTM Status');
      expect(ztmStatusTool.description).toBeDefined();
      expect(ztmStatusTool.parameters).toBeDefined();
    });

    it('should export ztmMeshInfoTool with correct properties', async () => {
      const { ztmMeshInfoTool } = await import('./tools.js');
      expect(ztmMeshInfoTool.name).toBe('ztm_mesh_info');
      expect(ztmMeshInfoTool.label).toBe('ZTM Mesh Info');
      expect(ztmMeshInfoTool.description).toBeDefined();
    });

    it('should export ztmPeersTool with correct properties', async () => {
      const { ztmPeersTool } = await import('./tools.js');
      expect(ztmPeersTool.name).toBe('ztm_peers');
      expect(ztmPeersTool.label).toBe('ZTM Peers');
    });
  });

  describe('ztmStatusTool.execute', () => {
    it('should return not configured when config is null', async () => {
      const { getZTMChatConfig } = await import('../utils/ztm-config.js');
      vi.mocked(getZTMChatConfig).mockReturnValueOnce(null);

      const { ztmStatusTool } = await import('./tools.js');
      const result = await ztmStatusTool.execute('call-id', {});

      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toContain('not configured');
    });

    it('should return connected status when mesh is connected', async () => {
      const { container } = await import('../di/index.js');
      const { createMockApiClient } = await import('../test-utils/mocks.js');

      const mockClient = createMockApiClient({
        getMeshInfo: vi.fn().mockResolvedValue(success({ connected: true, name: 'test-mesh' })),
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

      const { ztmStatusTool } = await import('./tools.js');
      const result = await ztmStatusTool.execute('call-id', {});

      expect(result.content[0].text).toContain('Connected');
    });

    it('should return disconnected status when mesh is not connected', async () => {
      const { container } = await import('../di/index.js');
      const { createMockApiClient } = await import('../test-utils/mocks.js');

      const mockClient = createMockApiClient({
        getMeshInfo: vi.fn().mockResolvedValue(success({ connected: false })),
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

      const { ztmStatusTool } = await import('./tools.js');
      const result = await ztmStatusTool.execute('call-id', {});

      expect(result.content[0].text).toContain('Disconnected');
    });

    it('should return error when mesh API fails', async () => {
      const { container } = await import('../di/index.js');
      const { createMockApiClient } = await import('../test-utils/mocks.js');

      const mockClient = createMockApiClient({
        getMeshInfo: vi.fn().mockResolvedValue(failure(new Error('API Error'))),
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

      const { ztmStatusTool } = await import('./tools.js');
      const result = await ztmStatusTool.execute('call-id', {});

      expect(result.content[0].text).toContain('Error');
    });

    it('should handle exceptions gracefully', async () => {
      const { container } = await import('../di/index.js');

      vi.mocked(container.get).mockImplementation(() => {
        throw new Error('Test error');
      });

      const { ztmStatusTool } = await import('./tools.js');
      const result = await ztmStatusTool.execute('call-id', {});

      expect(result.content[0].text).toContain('Test error');
    });
  });

  describe('ztmMeshInfoTool.execute', () => {
    it('should return mesh info when successful', async () => {
      const { container } = await import('../di/index.js');
      const { createMockApiClient } = await import('../test-utils/mocks.js');

      const meshData = { name: 'test-mesh', connected: true, endpoints: 5 };
      const mockClient = createMockApiClient({
        getMeshInfo: vi.fn().mockResolvedValue(success(meshData)),
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

      const { ztmMeshInfoTool } = await import('./tools.js');
      const result = await ztmMeshInfoTool.execute('call-id', {});

      expect(result.content[0].text).toContain('Mesh Info');
      expect(result.content[0].text).toContain('test-mesh');
    });

    it('should return error when API fails', async () => {
      const { container } = await import('../di/index.js');
      const { createMockApiClient } = await import('../test-utils/mocks.js');

      const mockClient = createMockApiClient({
        getMeshInfo: vi.fn().mockResolvedValue(failure(new Error('Failed'))),
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

      const { ztmMeshInfoTool } = await import('./tools.js');
      const result = await ztmMeshInfoTool.execute('call-id', {});

      expect(result.content[0].text).toContain('Error');
    });
  });

  describe('ztmPeersTool.execute', () => {
    it('should return peer list when successful', async () => {
      const { container } = await import('../di/index.js');
      const { createMockApiClient } = await import('../test-utils/mocks.js');

      const peers = [{ username: 'alice' }, { username: 'bob' }];
      const mockClient = createMockApiClient({
        discoverUsers: vi.fn().mockResolvedValue(success(peers)),
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

      const { ztmPeersTool } = await import('./tools.js');
      const result = await ztmPeersTool.execute('call-id', {});

      expect(result.content[0].text).toContain('alice');
      expect(result.content[0].text).toContain('bob');
    });

    it('should return no peers when list is empty', async () => {
      const { container } = await import('../di/index.js');
      const { createMockApiClient } = await import('../test-utils/mocks.js');

      const mockClient = createMockApiClient({
        discoverUsers: vi.fn().mockResolvedValue(success([])),
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

      const { ztmPeersTool } = await import('./tools.js');
      const result = await ztmPeersTool.execute('call-id', {});

      expect(result.content[0].text).toContain('No peers found');
    });

    it('should return error when discover API fails', async () => {
      const { container } = await import('../di/index.js');
      const { createMockApiClient } = await import('../test-utils/mocks.js');

      const mockClient = createMockApiClient({
        discoverUsers: vi.fn().mockResolvedValue(failure(new Error('Network error'))),
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

      const { ztmPeersTool } = await import('./tools.js');
      const result = await ztmPeersTool.execute('call-id', {});

      expect(result.content[0].text).toContain('Network error');
    });
  });
});
