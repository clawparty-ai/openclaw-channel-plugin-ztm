/**
 * @fileoverview ZTM Chat Channel Configuration
 * @module channel/config
 * Configuration parsing, account resolution, and schema utilities
 */

import type { TSchema } from '@sinclair/typebox';
import type { OpenClawConfig } from 'openclaw/plugin-sdk';
import type { ZTMChatConfig } from '../types/config.js';
import { resolveZTMChatConfig, getDefaultConfig, mergeAccountConfig } from '../config/index.js';

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
 * Build channel config schema with UI hints for the configuration UI
 *
 * @param _schema - The Typebox schema (unused, kept for API consistency)
 * @returns Object with schema, parse function, and UI hints
 */
export function buildChannelConfigSchemaWithHints(_schema: TSchema) {
  return {
    schema: {},
    parse(value: unknown) {
      return resolveZTMChatConfig(value);
    },
    uiHints: {
      agentUrl: {
        label: 'ZTM Agent URL',
        placeholder: 'https://ztm-agent.example.com:7777',
        help: 'URL of your ZTM Agent API server',
        required: true,
        validation: {
          pattern: '^https?://',
          message: 'Must start with http:// or https://',
        },
      },
      meshName: {
        label: 'Mesh Name',
        placeholder: 'my-mesh',
        help: 'Name of your ZTM mesh network',
        required: true,
        validation: {
          pattern: '^[a-zA-Z0-9_-]+$',
          message: 'Only letters, numbers, hyphens, and underscores',
        },
      },
      username: {
        label: 'Bot Username',
        placeholder: 'openclaw-bot',
        help: 'Username for the bot account in ZTM',
        required: true,
        validation: {
          pattern: '^[a-zA-Z0-9_-]+$',
          message: 'Only letters, numbers, hyphens, and underscores',
        },
      },
      enableGroups: {
        label: 'Enable Groups',
        help: 'Enable group chat support (future feature)',
        advanced: true,
      },
      autoReply: {
        label: 'Auto Reply',
        help: 'Automatically reply to messages using AI agent',
        default: true,
      },
      messagePath: {
        label: 'Message Path',
        help: 'Custom message path prefix (advanced)',
        placeholder: '/shared',
        advanced: true,
      },
    },
  };
}
