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
 *
 * @example
 * ```typescript
 * if (isZTMChatConfig(someConfig)) {
 *   console.log(someConfig.username);
 * }
 * ```
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
 *
 * @example
 * ```typescript
 * const config = getZTMChatConfig({ config: myConfig });
 * if (config) {
 *   console.log(config.username);
 * }
 * ```
 */
export function getZTMChatConfig(account: { config: unknown }): ZTMChatConfig | null {
  return isZTMChatConfig(account.config) ? account.config : null;
}
