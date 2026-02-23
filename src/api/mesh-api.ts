/**
 * Mesh operations API for ZTM Chat
 * @module api/mesh-api
 * Provides functions for mesh network operations and peer discovery
 */

import type { ZTMChatConfig } from '../types/config.js';
import type { ZTMPeer, ZTMUserInfo, ZTMMeshInfo, ZTMEndpoint } from '../types/api.js';
import { success, failure, isSuccess, type Result } from '../types/common.js';
import { ZTMDiscoveryError, ZTMApiError, ZTMTimeoutError } from '../types/errors.js';
import type { ZTMLogger, RequestHandler } from './request.js';
import { getOrDefault } from '../utils/guards.js';

/**
 * Create mesh operations API for mesh network interactions
 *
 * @param config - ZTM Chat configuration containing mesh name and other settings
 * @param request - HTTP request handler for making API calls
 * @param logger - Logger instance for debugging and error reporting
 * @returns Mesh API interface with methods for mesh info, endpoints, and peer discovery
 */
export function createMeshApi(config: ZTMChatConfig, request: RequestHandler, logger: ZTMLogger) {
  const CHAT_API_BASE = `/api/meshes/${config.meshName}/apps/ztm/chat/api`;

  async function getMeshInfo(): Promise<Result<ZTMMeshInfo, ZTMApiError | ZTMTimeoutError>> {
    return request<ZTMMeshInfo>('GET', `/api/meshes/${config.meshName}`);
  }

  async function getEndpoints(): Promise<Result<ZTMEndpoint[], ZTMApiError | ZTMTimeoutError>> {
    return request<ZTMEndpoint[]>('GET', `/api/meshes/${config.meshName}/endpoints`);
  }

  async function getEndpointCount(): Promise<Result<number, ZTMApiError | ZTMTimeoutError>> {
    const result = await getEndpoints();
    if (!result.ok) {
      return success(0);
    }
    return success(result.value?.length ?? 0);
  }

  async function listUsers(): Promise<Result<ZTMUserInfo[], ZTMDiscoveryError>> {
    logger.debug?.(`[ZTM API] Discovering users via Chat App API`);

    const result = await request<string[]>('GET', `${CHAT_API_BASE}/users`);

    if (!result.ok) {
      logger.error?.(`[ZTM API] Failed to list users: ${result.error?.message ?? 'Unknown error'}`);
      return failure(
        new ZTMDiscoveryError({
          operation: 'discoverUsers',
          source: 'ChatAppAPI',
          cause: result.error ?? new Error('Unknown error'),
        })
      );
    }

    const users = getOrDefault(result.value, []).map(username => ({ username }));
    logger.debug?.(`[ZTM API] Discovered ${users.length} users`);
    return success(users);
  }

  async function discoverUsers(): Promise<Result<ZTMUserInfo[], ZTMDiscoveryError>> {
    return listUsers();
  }

  async function discoverPeers(): Promise<Result<ZTMPeer[], ZTMDiscoveryError>> {
    const usersResult = await listUsers();
    const usersError = usersResult.error;
    if (isSuccess(usersResult) && usersResult.value) {
      return success(usersResult.value.map(u => ({ username: u.username })));
    }
    const error =
      usersError ??
      new ZTMDiscoveryError({
        operation: 'discoverPeers',
        source: 'ChatAppAPI',
        cause: new Error('Failed to discover peers'),
      });
    return failure(error);
  }

  return {
    getMeshInfo,
    getEndpoints,
    getEndpointCount,
    listUsers,
    discoverUsers,
    discoverPeers,
  };
}
