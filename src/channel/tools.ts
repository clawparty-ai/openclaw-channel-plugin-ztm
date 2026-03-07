/**
 * ZTM Chat Agent Tools
 * @module channel/tools
 * Implements ChannelAgentToolFactory for custom AI agent tools
 */

import type { ChannelAgentToolFactory } from 'openclaw/plugin-sdk';
import { z } from 'zod';
import { container, DEPENDENCIES } from '../di/index.js';
import type { IApiClientFactory, ILogger } from '../di/index.js';
import { resolveZTMChatAccount } from './config.js';
import { getZTMChatConfig } from '../utils/ztm-config.js';

/**
 * ZTM Status Tool - Get connection status
 */
const ztmStatusTool = {
  name: 'ztm_status',
  label: 'ZTM Status',
  description: 'Get ZTM connection status for the configured agent',
  parameters: z.object({}),
  async execute(_toolCallId: string, _params: unknown) {
    try {
      const apiClientFactory = container.get<IApiClientFactory>(DEPENDENCIES.API_CLIENT_FACTORY);
      const logger = container.get<ILogger>(DEPENDENCIES.LOGGER);

      const account = resolveZTMChatAccount({});
      const config = getZTMChatConfig(account);

      if (!config) {
        return {
          content: [{ type: 'text', text: 'ZTM Chat is not configured.' }],
          details: undefined,
        };
      }

      const apiClient = apiClientFactory(config, { logger });
      const meshResult = await apiClient.getMeshInfo();

      if (!meshResult.ok) {
        return {
          content: [{ type: 'text', text: `Error: ${meshResult.error?.message}` }],
          details: undefined,
        };
      }

      const meshInfo = meshResult.value as { connected?: boolean };
      const status = meshInfo?.connected ? 'Connected' : 'Disconnected';

      return {
        content: [
          {
            type: 'text',
            text: `Status: ${status}\nAgent: ${config.agentUrl}\nMesh: ${config.meshName}\nUsername: ${config.username}`,
          },
        ],
        details: undefined,
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        details: undefined,
      };
    }
  },
};

/**
 * ZTM Mesh Info Tool - Get detailed mesh information
 */
const ztmMeshInfoTool = {
  name: 'ztm_mesh_info',
  label: 'ZTM Mesh Info',
  description: 'Get detailed ZTM mesh network information',
  parameters: z.object({}),
  async execute(_toolCallId: string, _params: unknown) {
    try {
      const apiClientFactory = container.get<IApiClientFactory>(DEPENDENCIES.API_CLIENT_FACTORY);
      const logger = container.get<ILogger>(DEPENDENCIES.LOGGER);

      const account = resolveZTMChatAccount({});
      const config = getZTMChatConfig(account);

      if (!config) {
        return {
          content: [{ type: 'text', text: 'ZTM Chat is not configured.' }],
          details: undefined,
        };
      }

      const apiClient = apiClientFactory(config, { logger });
      const meshResult = await apiClient.getMeshInfo();

      if (!meshResult.ok) {
        return {
          content: [{ type: 'text', text: `Error: ${meshResult.error?.message}` }],
          details: undefined,
        };
      }

      const meshInfo = meshResult.value;
      const info = JSON.stringify(meshInfo, null, 2);

      return {
        content: [{ type: 'text', text: `Mesh Info:\n${info}` }],
        details: undefined,
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        details: undefined,
      };
    }
  },
};

/**
 * ZTM Peers Tool - List mesh peers
 */
const ztmPeersTool = {
  name: 'ztm_peers',
  label: 'ZTM Peers',
  description: 'List all peers in the ZTM mesh network',
  parameters: z.object({}),
  async execute(_toolCallId: string, _params: unknown) {
    try {
      const apiClientFactory = container.get<IApiClientFactory>(DEPENDENCIES.API_CLIENT_FACTORY);
      const logger = container.get<ILogger>(DEPENDENCIES.LOGGER);

      const account = resolveZTMChatAccount({});
      const config = getZTMChatConfig(account);

      if (!config) {
        return {
          content: [{ type: 'text', text: 'ZTM Chat is not configured.' }],
          details: undefined,
        };
      }

      const apiClient = apiClientFactory(config, { logger });
      const peersResult = await apiClient.discoverUsers();

      if (!peersResult.ok) {
        return {
          content: [{ type: 'text', text: `Error: ${peersResult.error?.message}` }],
          details: undefined,
        };
      }

      const peers = peersResult.value as { username: string }[];
      const peerList = peers.map(p => `- ${p.username}`).join('\n') || 'No peers found';

      return {
        content: [{ type: 'text', text: `Peers:\n${peerList}` }],
        details: undefined,
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        details: undefined,
      };
    }
  },
};

/**
 * Create ZTM Chat agent tools factory
 */
export const createZTMChatAgentTools: ChannelAgentToolFactory = ({ cfg }) => {
  // Check if channel is configured
  const account = resolveZTMChatAccount({ cfg });
  const config = getZTMChatConfig(account);

  if (!config) {
    return [];
  }

  return [
    ztmStatusTool,
    ztmMeshInfoTool,
    ztmPeersTool,
  ] as unknown as ReturnType<ChannelAgentToolFactory>;
};

// Export individual tools for testing
export { ztmStatusTool, ztmMeshInfoTool, ztmPeersTool };
