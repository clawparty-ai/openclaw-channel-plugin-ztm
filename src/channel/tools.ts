/**
 * ZTM Chat Agent Tools
 * @module channel/tools
 * Implements ChannelAgentToolFactory for custom AI agent tools
 */

import type { ChannelAgentToolFactory } from 'openclaw/plugin-sdk';
import { z } from 'zod';
import { container, DEPENDENCIES } from '../di/index.js';
import type { IApiClientFactory, ILogger } from '../di/index.js';
import type { ZTMMessage } from '../api/ztm-api.js';
import { resolveZTMChatAccount } from './config.js';
import { getZTMChatConfig } from '../utils/ztm-config.js';
import { isEmptyString } from '../utils/validation.js';

const MAX_MESSAGE_LENGTH = 4096;
const MAX_PEER_LENGTH = 64;

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
 * ZTM Send Peer Message Tool - Send a message to a peer
 */
const ztmSendPeerMessageTool = {
  name: 'ztm_send_peer_message',
  label: 'ZTM Send Peer Message',
  description: 'Send a direct message to a peer in the ZTM mesh network',

  parameters: z.object({
    peer: z
      .string()
      .describe('Username of the peer to send message to')
      .min(1, 'Peer username is required')
      .max(MAX_PEER_LENGTH, `Peer username must be ${MAX_PEER_LENGTH} characters or less`),
    message: z
      .string()
      .describe('Message text to send (max 4096 characters)')
      .min(1, 'Message is required')
      .max(MAX_MESSAGE_LENGTH, `Message must be ${MAX_MESSAGE_LENGTH} characters or less`),
  }),

  async execute(_toolCallId: string, params: unknown) {
    try {
      const { peer, message } = params as { peer: string; message: string };

      // Input validation (for better UX, complements API layer validation)
      if (isEmptyString(peer)) {
        return {
          content: [{ type: 'text', text: 'Error: Peer username is required.' }],
          details: undefined,
        };
      }

      if (isEmptyString(message)) {
        return {
          content: [{ type: 'text', text: 'Error: Message content is required.' }],
          details: undefined,
        };
      }

      const peerTrimmed = peer.trim();
      const messageTrimmed = message.trim();

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

      // Construct ZTMMessage object (see: src/messaging/outbound.ts:67-71)
      const ztmMessage: ZTMMessage = {
        time: Date.now(),
        message: messageTrimmed,
        sender: config.username,
      };

      const sendResult = await apiClient.sendPeerMessage(peerTrimmed, ztmMessage);

      if (!sendResult.ok) {
        // Provide user-friendly error message
        const errorMsg = sendResult.error?.message || 'Unknown error';
        return {
          content: [{ type: 'text', text: `Error: ${errorMsg}` }],
          details: undefined,
        };
      }

      return {
        content: [{ type: 'text', text: `Message sent to ${peerTrimmed}` }],
        details: { success: true, peer: peerTrimmed, messageLength: messageTrimmed.length },
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
 *
 * Returns a factory function that creates AI agent tools for ZTM Chat operations.
 * Includes tools for status checks, mesh info, peer discovery, and messaging.
 *
 * @param cfg - OpenClaw configuration object
 * @returns Array of agent tools or empty array if channel not configured
 *
 * @example
 * ```typescript
 * import { createZTMChatAgentTools } from './channel/tools.js';
 *
 * const toolsFactory = createZTMChatAgentTools({ cfg: myConfig });
 * // Returns array of tools: [ztmStatusTool, ztmMeshInfoTool, ztmPeersTool, ztmSendPeerMessageTool]
 * ```
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
    ztmSendPeerMessageTool,
  ] as unknown as ReturnType<ChannelAgentToolFactory>;
};

// Export individual tools for testing
export { ztmStatusTool, ztmMeshInfoTool, ztmPeersTool, ztmSendPeerMessageTool };
