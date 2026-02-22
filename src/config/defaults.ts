/**
 * @fileoverview ZTM Chat Configuration Defaults and Resolution
 * @module config/defaults
 * Default values and configuration resolution logic
 */

import type { ZTMChatConfig } from '../types/config.js';
import type { DMPolicy } from './schema.js';

/**
 * Get default configuration values for ZTM Chat plugin
 * @returns A ZTMChatConfig object with all default values
 */
export function getDefaultConfig(): ZTMChatConfig {
  return {
    agentUrl: 'http://localhost:7777',
    permitUrl: 'https://ztm-portal.flomesh.io:7779/permit',
    permitSource: 'server',
    meshName: 'openclaw-mesh',
    username: 'openclaw-bot',
    enableGroups: true,
    dmPolicy: 'pairing',
    allowFrom: undefined,
    apiTimeout: 30000,
  };
}

/**
 * Resolve raw config with defaults applied
 * @param raw - Raw configuration object (may be undefined, null, or invalid)
 * @returns A fully resolved ZTMChatConfig with defaults applied to missing fields
 */
export function resolveZTMChatConfig(raw: unknown): ZTMChatConfig {
  if (!raw || typeof raw !== 'object') {
    return getDefaultConfig();
  }

  const config = raw as Record<string, unknown>;

  return {
    agentUrl:
      typeof config.agentUrl === 'string' && config.agentUrl.trim()
        ? config.agentUrl.trim()
        : 'http://localhost:7777',
    permitUrl:
      typeof config.permitUrl === 'string' && config.permitUrl.trim()
        ? config.permitUrl.trim()
        : 'https://ztm-portal.flomesh.io:7779/permit',
    permitSource:
      config.permitSource === 'server' || config.permitSource === 'file'
        ? config.permitSource
        : 'server',
    meshName:
      typeof config.meshName === 'string' && config.meshName.trim()
        ? config.meshName.trim()
        : 'openclaw-mesh',
    username:
      typeof config.username === 'string' && config.username.trim()
        ? config.username.trim()
        : 'openclaw-bot',
    enableGroups: Boolean(config.enableGroups),
    dmPolicy: ['allow', 'deny', 'pairing'].includes(config.dmPolicy as string)
      ? (config.dmPolicy as DMPolicy)
      : 'pairing',
    allowFrom: Array.isArray(config.allowFrom)
      ? config.allowFrom
          .filter((v): v is string => typeof v === 'string')
          .map(v => v.trim())
          .filter(Boolean)
      : undefined,
    apiTimeout:
      typeof config.apiTimeout === 'number' && config.apiTimeout >= 1000
        ? Math.min(config.apiTimeout, 300000)
        : 30000,
  };
}

/**
 * Create a partial config for probing ZTM Agent availability
 * @param config - Partial configuration with optional fields
 * @returns A complete ZTMChatConfig with defaults applied to missing fields
 */
export function createProbeConfig(config: Partial<ZTMChatConfig>): ZTMChatConfig {
  return {
    agentUrl: config.agentUrl ?? 'http://localhost:7777',
    permitUrl: config.permitUrl ?? 'https://ztm-portal.flomesh.io:7779/permit',
    permitSource: config.permitSource ?? 'server',
    meshName: config.meshName ?? 'openclaw-mesh',
    username: config.username ?? 'probe',
    enableGroups: config.enableGroups ?? true,
    dmPolicy: config.dmPolicy ?? 'pairing',
    allowFrom: config.allowFrom,
    apiTimeout: config.apiTimeout ?? 30000,
  };
}

/**
 * Merge base config with account-specific overrides
 * @param baseConfig - Base configuration object
 * @param accountConfig - Account-specific configuration overrides
 * @returns Merged configuration object with account overrides applied
 */
export function mergeAccountConfig(
  baseConfig: Record<string, unknown>,
  accountConfig: Record<string, unknown>
): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { accounts: _ignored, ...cleanBase } = baseConfig;
  return { ...cleanBase, ...accountConfig };
}
