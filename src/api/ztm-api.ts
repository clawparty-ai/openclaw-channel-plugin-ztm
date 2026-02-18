// ZTM Agent API Client
// Handles HTTP communication with remote ZTM Agent for Chat operations
// Supports both direct storage API access and Chat App HTTP endpoints

import type { ZTMChatConfig } from '../types/config.js';
import type {
  ZTMPeer,
  ZTMUserInfo,
  ZTMMeshInfo,
  ZTMChat,
  ZTMApiClient,
} from '../types/api.js';

import {
  createRequestHandler,
  defaultDeps,
  type ZTMApiClientDeps,
} from './request.js';

import { createMeshApi } from './mesh-api.js';
import { createChatApi } from './chat-api.js';
import { createMessageApi } from './message-api.js';
import { createFileApi } from './file-api.js';

// Re-export types for backward compatibility
export type {
  ZTMPeer,
  ZTMUserInfo,
  ZTMMeshInfo,
  ZTMChat,
  ZTMApiClient,
  ZTMApiClientDeps,
};

/**
 * Create ZTM API Client with dependency injection
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
  const apiTimeout = config.apiTimeout || 30000;

  // Create the request handler
  const request = createRequestHandler(baseUrl, apiTimeout, {
    logger,
    fetch,
    fetchWithRetry: doFetchWithRetry,
  });

  // Create the various API modules
  const meshApi = createMeshApi(config, request, logger);
  const chatApi = createChatApi(config, request, logger);
  const fileApi = createFileApi(config, request, logger);

  // Create message API with getChats dependency
  const messageApi = createMessageApi(config, request, logger, () => chatApi.getChats());

  const client: ZTMApiClient = {
    getMeshInfo: meshApi.getMeshInfo,

    discoverUsers: meshApi.discoverUsers,

    discoverPeers: meshApi.discoverPeers,

    listUsers: meshApi.listUsers,

    getChats: chatApi.getChats,

    getPeerMessages: messageApi.getPeerMessages,

    sendPeerMessage: messageApi.sendPeerMessage,

    watchChanges: messageApi.watchChanges,

    getGroupMessages: messageApi.getGroupMessages,

    sendGroupMessage: messageApi.sendGroupMessage,

    seedFileMetadata: fileApi.seedFileMetadata,

    exportFileMetadata: fileApi.exportFileMetadata,
  };

  return client;
}

// Re-export test utilities for backward compatibility
export * from './test-utils.js';
