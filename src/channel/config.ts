/**
 * ZTM Chat Channel Configuration
 * @module channel/config
 * Configuration parsing, account resolution, and schema utilities
 */

import type { OpenClawConfig } from 'openclaw/plugin-sdk';
import type { ZTMChatConfig } from '../types/config.js';
import { resolveZTMChatConfig, getDefaultConfig, mergeAccountConfig } from '../config/index.js';
import { buildChannelConfigSchema } from 'openclaw/plugin-sdk';
import { ztmChatConfigBaseSchema } from '../config/schema.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Resolved ZTM chat account with configuration
 */
export interface ResolvedZTMChatAccount {
  accountId: string;
  username: string;
  enabled: boolean;
  config: ZTMChatConfig;
}

// ============================================================================
// Channel Config Resolution
// ============================================================================

/**
 * Get effective channel config from openclaw.yaml: cfg.channels["ztm-chat"]
 *
 * @param cfg - OpenClaw configuration object
 * @returns The channel configuration object, or null if not configured
 */
export function getEffectiveChannelConfig(cfg?: OpenClawConfig): Record<string, unknown> | null {
  const inlineConfig = cfg?.channels?.['ztm-chat'] as Record<string, unknown>;
  if (inlineConfig && typeof inlineConfig === 'object' && Object.keys(inlineConfig).length > 0) {
    return inlineConfig;
  }
  return null;
}

// ============================================================================
// Account Resolution
// ============================================================================

/**
 * List available ZTM chat account IDs
 *
 * @param cfg - OpenClaw configuration object
 * @returns Array of account IDs
 */
export function listZTMChatAccountIds(cfg?: OpenClawConfig): string[] {
  const channelConfig = getEffectiveChannelConfig(cfg);
  const accounts = channelConfig?.accounts as Record<string, unknown> | undefined;
  if (accounts && typeof accounts === 'object') {
    const ids = Object.keys(accounts);
    if (ids.length > 0) return ids;
  }
  // Fallback: return ["default"] so the channel appears in channels status
  return ['default'];
}

/**
 * Get the default ZTM chat account ID
 *
 * Returns the first account ID from the list, or 'default' as fallback.
 * This is used by OpenClaw core for health checks, UI prompts, and config validation.
 *
 * @param cfg - OpenClaw configuration object
 * @returns Default account ID
 *
 * @example
 * ```typescript
 * const defaultId = resolveDefaultZTMChatAccountId(cfg);
 * ```
 */
export function resolveDefaultZTMChatAccountId(cfg: OpenClawConfig): string {
  return listZTMChatAccountIds(cfg)[0] ?? 'default';
}

// Dangerous property names that could lead to prototype pollution
const DANGEROUS_PROPERTY_NAMES = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Validate account ID to prevent path traversal and prototype pollution
 */
function isValidAccountId(accountId: string | undefined): boolean {
  if (!accountId) return true; // undefined/null is valid (will use default)
  // Check for empty or whitespace-only
  if (accountId.trim().length === 0) return false;
  // Check for dangerous property names
  if (DANGEROUS_PROPERTY_NAMES.has(accountId)) return false;
  // Check for path traversal patterns
  if (accountId.includes('..') || accountId.includes('/') || accountId.includes('\\')) return false;
  return true;
}

/**
 * Resolve a ZTM chat account with its configuration
 *
 * @param params - Parameters containing configuration and account ID
 * @param params.cfg - OpenClaw configuration object
 * @param params.accountId - Account identifier
 * @returns Resolved ZTM chat account with configuration
 */
export function resolveZTMChatAccount({
  cfg,
  accountId,
}: {
  cfg?: OpenClawConfig;
  accountId?: string;
}): ResolvedZTMChatAccount {
  // Validate accountId to prevent path traversal / prototype pollution
  if (!isValidAccountId(accountId)) {
    // Return default account for invalid IDs
    return {
      accountId: 'default',
      username: 'default',
      enabled: true,
      config: getDefaultConfig(),
    };
  }

  const channelConfig = getEffectiveChannelConfig(cfg);
  const accountKey = accountId ?? 'default';

  if (!channelConfig) {
    return {
      accountId: accountKey,
      username: accountKey, // Use accountKey as default username
      enabled: true, // Default to enabled
      config: getDefaultConfig(),
    };
  }

  const accounts = channelConfig.accounts as Record<string, unknown> | undefined;
  const account = (accounts?.[accountKey] ?? accounts?.default ?? {}) as Record<string, unknown>;

  // Merge base config with account-level overrides (account takes precedence)
  const merged = mergeAccountConfig(channelConfig, account);

  const config = resolveZTMChatConfig(merged);

  return {
    accountId: accountKey,
    username: (merged.username as string) ?? accountKey,
    enabled: (merged.enabled as boolean) ?? (channelConfig.enabled as boolean) ?? true,
    config,
  };
}

// ============================================================================
// UI Schema Hints
// ============================================================================

/**
 * Build channel config schema for OpenClaw plugin
 *
 * @returns ChannelConfigSchema with JSON schema and UI hints
 */
export function buildChannelConfigSchemaWithHints() {
  // Build schema using OpenClaw's helper
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return buildChannelConfigSchema(ztmChatConfigBaseSchema as any);
}
