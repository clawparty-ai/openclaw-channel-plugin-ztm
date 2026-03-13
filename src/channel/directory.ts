/**
 * Directory Operations for ZTM Chat Channel Plugin
 * @module channel/directory
 * Handles user and peer discovery functionality
 */

import type { OpenClawConfig } from 'openclaw/plugin-sdk';
import {
  container,
  DEPENDENCIES,
  type ILogger,
  type IApiClientFactory,
  type IDiscovery,
} from '../di/index.js';
import { getOrDefault } from '../utils/guards.js';
import { DEFAULT_ACCOUNT_ID } from '../constants.js';
import { getZTMChatConfig } from '../utils/ztm-config.js';
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
 *
 * @example
 * ```typescript
 * const self = await directorySelf({ cfg, accountId: 'default' });
 * // Returns: { kind: 'user', id: 'mybot', name: 'mybot', raw: { username: 'mybot', meshName: 'test' } }
 * ```
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
 *
 * @example
 * ```typescript
 * const peers = await directoryListPeers({ cfg, accountId: 'default' });
 * // Returns: [{ kind: 'user', id: 'alice', name: 'alice', raw: { username: 'alice' } }, ...]
 * ```
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
      `Failed to list peers: ZTM Chat config not found for account ${accountId ?? DEFAULT_ACCOUNT_ID}`
    );
    return [];
  }

  const apiClientFactory = container.get<IApiClientFactory>(DEPENDENCIES.API_CLIENT_FACTORY);
  const discovery = apiClientFactory(config, { logger }) as IDiscovery;

  const usersResult = await discovery.discoverUsers();
  if (!usersResult.ok) {
    logger.warn(`Failed to list peers: ${usersResult.error?.message ?? 'Unknown error'}`);
    return [];
  }

  const users = getOrDefault(usersResult.value as { username: string }[], []);
  return users.map(user => ({
    kind: 'user' as const,
    id: user.username,
    name: user.username,
    raw: user,
  }));
}
