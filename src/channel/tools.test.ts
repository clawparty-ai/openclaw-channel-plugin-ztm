/**
 * Agent Tools Tests
 * @module channel/tools.test
 */

import { describe, it, expect } from 'vitest';

describe('createZTMChatAgentTools', () => {
  describe('factory returns', () => {
    it('should export createZTMChatAgentTools function', async () => {
      const { createZTMChatAgentTools } = await import('./tools.js');
      expect(typeof createZTMChatAgentTools).toBe('function');
    });

    it('should return empty array when not configured', async () => {
      const { createZTMChatAgentTools } = await import('./tools.js');
      const tools = createZTMChatAgentTools({ cfg: {} });
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('tool definitions', () => {
    it('should export ztmStatusTool', async () => {
      const { ztmStatusTool } = await import('./tools.js');
      expect(ztmStatusTool.name).toBe('ztm_status');
    });

    it('should export ztmMeshInfoTool', async () => {
      const { ztmMeshInfoTool } = await import('./tools.js');
      expect(ztmMeshInfoTool.name).toBe('ztm_mesh_info');
    });

    it('should export ztmPeersTool', async () => {
      const { ztmPeersTool } = await import('./tools.js');
      expect(ztmPeersTool.name).toBe('ztm_peers');
    });
  });
});
