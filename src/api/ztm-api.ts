/**
 * ZTM Agent API Client
 * @module api/ztm-api
 * Handles HTTP communication with remote ZTM Agent for Chat operations
 * Supports both direct storage API access and Chat App HTTP endpoints
 */

import type { ZTMChatConfig } from '../types/config.js';
import type {
  ZTMMessage,
  ZTMPeer,
  ZTMUserInfo,
  ZTMMeshInfo,
  ZTMChat,
  ZTMApiClient,
  ZTMDiscoveryError,
} from '../types/api.js';

// Re-export types for convenience
export type {
  ZTMMessage,
  ZTMPeer,
  ZTMUserInfo,
  ZTMMeshInfo,
  ZTMChat,
  ZTMApiClient,
  ZTMDiscoveryError,
};

import { createRequestHandler, defaultDeps, type ZTMApiClientDeps } from './request.js';

import { API_TIMEOUT_MS } from '../constants.js';
import { createMeshApi } from './mesh-api.js';
import { createChatApi } from './chat-api.js';
import { createMessageApi } from './message-api.js';

// Re-export types
export type { ZTMApiClientDeps };

/**
 * Create ZTM API Client with dependency injection
 *
 * @param config - ZTM Chat configuration containing agent URL, mesh name, and other settings
 * @param deps - Optional dependencies to override defaults (logger, fetch, fetchWithRetry)
 * @returns ZTM API Client instance with all chat, message, and mesh operations
 */
export function createZTMApiClient(
  config: ZTMChatConfig,
  deps: Partial<ZTMApiClientDeps> = {}
): ZTMApiClient {
  const {
    logger,
    fetch,
    fetchWithRetry: doFetchWithRetry,
  }: ZTMApiClientDeps = {
    ...defaultDeps,
    ...deps,
  };

  const baseUrl = config.agentUrl.replace(/\/$/, '');
  const apiTimeout = config.apiTimeout || API_TIMEOUT_MS;

  // Create the request handler
  const request = createRequestHandler(baseUrl, apiTimeout, {
    logger,
    fetch,
    fetchWithRetry: doFetchWithRetry,
  });

  // Create the various API modules
  const meshApi = createMeshApi(config, request, logger);
  const chatApi = createChatApi(config, request, logger);

  // Create message API with getChats dependency
  const messageApi = createMessageApi(config, request, logger, () => chatApi.getChats());

  const client: ZTMApiClient = {
    getMeshInfo: meshApi.getMeshInfo,
    getEndpoints: meshApi.getEndpoints,
    getEndpointCount: meshApi.getEndpointCount,

    discoverUsers: meshApi.discoverUsers,

    discoverPeers: meshApi.discoverPeers,

    listUsers: meshApi.listUsers,

    getChats: chatApi.getChats,

    getPeerMessages: messageApi.getPeerMessages,

    sendPeerMessage: messageApi.sendPeerMessage,

    watchChanges: messageApi.watchChanges,

    getGroupMessages: messageApi.getGroupMessages,

    sendGroupMessage: messageApi.sendGroupMessage,
  };

  return client;
}

// Re-export test utilities
// export * from './test-utils.js';
