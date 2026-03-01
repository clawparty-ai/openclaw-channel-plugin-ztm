/**
 * ZTM Chat Onboarding Adapter
 * @module channel/onboarding
 * Implements ChannelOnboardingAdapter for standardized onboarding flow
 */

import type { ChannelOnboardingAdapter, DmPolicy } from 'openclaw/plugin-sdk';
import type { OpenClawConfig } from 'openclaw/plugin-sdk';

/**
 * Get ZTM Chat account from config
 */
function getZTMChatAccount(
  cfg: OpenClawConfig
): { accountId: string; config: Record<string, unknown> } | null {
  const channels = cfg.channels as
    | Record<string, { accounts?: Record<string, unknown> }>
    | undefined;
  const ztmChat = channels?.ztmChat;

  if (!ztmChat) return null;

  const accounts = ztmChat.accounts;
  if (!accounts || Object.keys(accounts).length === 0) return null;

  const accountId = Object.keys(accounts)[0];
  const config = accounts[accountId] as Record<string, unknown> | undefined;

  if (!config || !config.agentUrl || !config.username) return null;

  return { accountId, config };
}

/**
 * Onboarding adapter for ZTM Chat channel
 */
export const ztmChatOnboardingAdapter: ChannelOnboardingAdapter = {
  channel: 'ztm-chat',

  /**
   * Get onboarding status for ZTM Chat channel
   */
  getStatus: async ({ cfg }) => {
    const account = getZTMChatAccount(cfg);

    const configured = account !== null;

    const statusLines: string[] = [];
    if (configured) {
      const config = account?.config;
      statusLines.push(`Agent: ${config?.agentUrl as string}`);
      statusLines.push(`Username: ${config?.username as string}`);
      statusLines.push(`Mesh: ${config?.meshName as string}`);
    } else {
      statusLines.push('Not configured');
    }

    return {
      channel: 'ztm-chat',
      configured,
      statusLines,
      selectionHint: 'ZTM Chat (P2P)',
    };
  },

  /**
   * Configure ZTM Chat channel (non-interactive)
   * For now, just return the current config - full configuration happens via wizard
   */
  configure: async ({ cfg }) => {
    // Non-interactive configuration is not fully supported yet
    // Full configuration should happen via the existing wizard flow
    return { cfg };
  },

  /**
   * DM policy configuration
   */
  dmPolicy: {
    label: 'ZTM Chat',
    channel: 'ztm-chat',
    policyKey: 'channels.ztmChat.dmPolicy',
    allowFromKey: 'channels.ztmChat.allowFrom',
    getCurrent: (cfg: OpenClawConfig): DmPolicy => {
      const channels = cfg.channels as Record<string, { dmPolicy?: DmPolicy }> | undefined;
      return channels?.ztmChat?.dmPolicy ?? 'pairing';
    },
    setPolicy: (cfg: OpenClawConfig, policy: DmPolicy): OpenClawConfig => {
      const newCfg = { ...cfg };
      if (!newCfg.channels) {
        (newCfg as Record<string, unknown>).channels = {};
      }
      const channels = newCfg.channels as Record<string, unknown>;

      if (!channels.ztmChat) {
        channels.ztmChat = {};
      }
      const ztmChat = channels.ztmChat as Record<string, unknown>;

      ztmChat.dmPolicy = policy;

      return newCfg;
    },
  },

  /**
   * Disable ZTM Chat channel
   */
  disable: (cfg: OpenClawConfig): OpenClawConfig => {
    const newCfg = { ...cfg };
    if (!newCfg.channels) {
      return newCfg;
    }
    const channels = newCfg.channels as Record<string, unknown>;
    delete channels.ztmChat;
    return newCfg;
  },
};
