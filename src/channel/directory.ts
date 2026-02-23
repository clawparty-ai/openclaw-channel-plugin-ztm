/**
 * Directory Operations for ZTM Chat Channel Plugin
 * @module channel/directory
 * Handles user and peer discovery functionality
 */

import type { OpenClawConfig } from 'openclaw/plugin-sdk';
import { container, DEPENDENCIES, type ILogger, type IApiClientFactory } from '../di/index.js';
import { getOrDefault } from '../utils/guards.js';
import { resolveZTMChatAccount } from './config.js';

/**
 * Directory entry for a user (self or peer)
 */
export interface DirectoryUser {
  kind: 'user';
  id: string;
  name: string;
  raw:
    | {
        username: string;
        meshName?: string;
      }
    | { username: string; endpoint?: string };
}

/**
 * Type guard to safely extract ZTMChatConfig from unknown
 */
function isZTMChatConfig(config: unknown): config is import('../types/config.js').ZTMChatConfig {
  return (
    typeof config === 'object' && config !== null && 'username' in config && 'agentUrl' in config
  );
}

/**
 * Safely get config with type guard
 */
function getZTMChatConfig(account: {
  config: unknown;
}): import('../types/config.js').ZTMChatConfig | null {
  return isZTMChatConfig(account.config) ? account.config : null;
}

/**
 * Interface for directory function parameters
 */
export interface DirectoryContext {
  cfg?: OpenClawConfig | null;
  accountId?: string | null;
}

/**
 * Gets self (current bot) information from directory
 *
 * @param cfg - OpenClaw configuration
 * @param accountId - Account identifier
 * @returns DirectoryUser entry for the current bot
 */
export async function directorySelf({
  cfg,
  accountId,
}: DirectoryContext): Promise<DirectoryUser | null> {
  const account = resolveZTMChatAccount({
    cfg: cfg ?? undefined,
    accountId: accountId ?? undefined,
  });
  const config = getZTMChatConfig(account);
  if (!config) return null;

  return {
    kind: 'user' as const,
    id: account.username ?? '',
    name: account.username ?? '',
    raw: {
      username: account.username ?? '',
      meshName: config?.meshName,
    },
  };
}

/**
 * Lists peers from directory via ZTM Agent API
 *
 * @param cfg - OpenClaw configuration
 * @param accountId - Account identifier
 * @returns Array of directory user entries
 */
export async function directoryListPeers({
  cfg,
  accountId,
}: DirectoryContext): Promise<DirectoryUser[]> {
  const account = resolveZTMChatAccount({
    cfg: cfg ?? undefined,
    accountId: accountId ?? undefined,
  });
  const config = getZTMChatConfig(account);
  const logger = container.get<ILogger>(DEPENDENCIES.LOGGER);

  if (!config) {
    logger.warn(
      `Failed to list peers: ZTM Chat config not found for account ${accountId ?? 'default'}`
    );
    return [];
  }

  const apiClientFactory = container.get<IApiClientFactory>(DEPENDENCIES.API_CLIENT_FACTORY);
  const apiClient = apiClientFactory(config, { logger });

  const usersResult = await apiClient.discoverUsers();
  if (!usersResult.ok) {
    logger.warn(`Failed to list peers: ${usersResult.error?.message ?? 'Unknown error'}`);
    return [];
  }

  return getOrDefault(usersResult.value, []).map(user => ({
    kind: 'user' as const,
    id: user.username,
    name: user.username,
    raw: user,
  }));
}
