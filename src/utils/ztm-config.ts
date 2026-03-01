/**
 * ZTM Chat Configuration Utilities
 * @module utils/ztm-config
 * Shared type guards and utilities for ZTM Chat configuration
 */

import type { ZTMChatConfig } from '../types/config.js';

/**
 * Type guard to safely extract ZTMChatConfig from unknown
 * @param config - Unknown config object
 * @returns True if config has required ZTM Chat fields
 */
export function isZTMChatConfig(config: unknown): config is ZTMChatConfig {
  return (
    typeof config === 'object' && config !== null && 'username' in config && 'agentUrl' in config
  );
}

/**
 * Safely get ZTMChatConfig from account config object
 * @param account - Account with config property
 * @returns ZTMChatConfig or null if not valid
 */
export function getZTMChatConfig(account: { config: unknown }): ZTMChatConfig | null {
  return isZTMChatConfig(account.config) ? account.config : null;
}
