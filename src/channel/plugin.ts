/**
 * ZTM Chat Channel Plugin
 * @module channel/plugin
 * Main plugin definition implementing ChannelPlugin interface
 */

import type { ChannelPlugin, OpenClawConfig } from 'openclaw/plugin-sdk';
import type { ZTMMessage } from '../api/ztm-api.js';
import {
  container,
  DEPENDENCIES,
  createLogger,
  createConfigService,
  createApiReaderService,
  createApiSenderService,
  createApiDiscoveryService,
  createApiClientFactory,
  createRuntimeService,
  createAllowFromRepositoryService,
  createMessageStateRepositoryService,
  createAccountStateManagerService,
  type ILogger,
  type IChatSender,
  type IApiClientFactory,
} from '../di/index.js';
import { createMessagingContext } from '../messaging/context.js';
import type { ResolvedZTMChatAccount } from './config.js';
import { PROBE_TIMEOUT_MS } from '../constants.js';
import { getOrDefault, isNonEmptyArray } from '../utils/guards.js';
import { getZTMChatConfig } from '../utils/ztm-config.js';

// Interface for resolveDmPolicy function parameters
interface DmPolicyContext {
  cfg?: OpenClawConfig | null;
  accountId?: string | null;
  account: ResolvedZTMChatAccount;
}

// Interface for collectWarnings function parameters
interface CollectWarningsContext {
  cfg?: OpenClawConfig | null;
  accountId?: string | null;
}

// ============================================================================
// Meta Information
// ============================================================================

const meta = {
  id: 'ztm-chat',
  label: 'ZTM Chat',
  selectionLabel: 'ZTM Chat (P2P)',
  docsPath: '/channels/ztm-chat',
  blurb: 'Decentralized P2P messaging via ZTM (Zero Trust Mesh) network',
  aliases: ['ztm', 'ztmp2p'],
  preferOver: undefined,
  detailLabel: undefined,
  systemImage: undefined,
};

// ============================================================================
// DEPENDENCY INJECTION
// ============================================================================
// Initialize services on module load
container.register(DEPENDENCIES.LOGGER, createLogger('ztm-chat'));
container.register(DEPENDENCIES.CONFIG, createConfigService());
container.register(DEPENDENCIES.API_CLIENT_READER, createApiReaderService());
container.register(DEPENDENCIES.API_CLIENT_SENDER, createApiSenderService());
container.register(DEPENDENCIES.API_CLIENT_DISCOVERY, createApiDiscoveryService());
container.register(DEPENDENCIES.API_CLIENT_FACTORY, createApiClientFactory());
container.register(DEPENDENCIES.RUNTIME, createRuntimeService());
container.register(DEPENDENCIES.ALLOW_FROM_REPO, createAllowFromRepositoryService());
container.register(DEPENDENCIES.MESSAGE_STATE_REPO, createMessageStateRepositoryService());
container.register(DEPENDENCIES.ACCOUNT_STATE_MANAGER, createAccountStateManagerService());
container.register(DEPENDENCIES.MESSAGING_CONTEXT, () => {
  const allowFromRepo = container.get(DEPENDENCIES.ALLOW_FROM_REPO);
  const messageStateRepo = container.get(DEPENDENCIES.MESSAGE_STATE_REPO);
  return createMessagingContext(allowFromRepo, messageStateRepo);
});

// ============================================================================
// Helper Functions (imported from other modules)
// ============================================================================

import {
  resolveZTMChatAccount,
  listZTMChatAccountIds,
  resolveDefaultZTMChatAccountId,
  buildChannelConfigSchemaWithHints,
} from './config.js';
import { isConfigMinimallyValid } from '../config/index.js';
import {
  collectStatusIssues,
  probeAccountGateway,
  startAccountGateway,
  logoutAccountGateway,
  sendTextGateway,
} from './gateway.js';
import { buildAccountSnapshot } from './state.js';
import { directorySelf, directoryListPeers } from './directory.js';
import { ztmChatOnboardingAdapter } from './onboarding.js';
import { ztmChatHeartbeatAdapter } from './heartbeat.js';
import { createZTMChatAgentTools } from './tools.js';
import {
  buildChannelSummary,
  defaultRuntime,
  type ChannelAccountSnapshot,
  type ChannelStatusIssue,
} from './status.js';

// ============================================================================
// Extracted Complex Functions - Reduce Cyclomatic Complexity
// ============================================================================

// Resolves DM policy configuration

const resolveDmPolicyImpl = ({ cfg, accountId, account }: DmPolicyContext) => {
  const resolvedAccountId = accountId ?? account.accountId ?? 'default';
  const config = getZTMChatConfig(account);
  if (!config) return null;
  const channelsConfig = (cfg || {}) as {
    channels?: { 'ztm-chat'?: { accounts?: Record<string, unknown> } };
  };
  const useAccountPath = Boolean(
    channelsConfig.channels?.['ztm-chat']?.accounts?.[resolvedAccountId]
  );
  const basePath = useAccountPath
    ? `channels.ztm-chat.accounts.${resolvedAccountId}.`
    : 'channels.ztm-chat.';

  return {
    policy: config?.dmPolicy ?? 'pairing',
    allowFrom: getOrDefault(config?.allowFrom, []),
    policyPath: `${basePath}dmPolicy`,
    allowFromPath: `${basePath}allowFrom`,
    approveHint: '',
    normalizeEntry: (raw: string) => raw.trim().toLowerCase(),
  };
};

// Collects warnings for the account configuration

const collectWarningsImpl = async ({
  cfg,
  accountId,
}: CollectWarningsContext): Promise<string[]> => {
  const warnings: string[] = [];
  const account = resolveZTMChatAccount({
    cfg: cfg ?? undefined,
    accountId: accountId ?? undefined,
  });
  const config = getZTMChatConfig(account);
  if (!config) return warnings;

  const allowFrom = getOrDefault(config?.allowFrom, []);
  if (!isNonEmptyArray(allowFrom)) {
    warnings.push('No allowFrom configured - accepting messages from any ZTM user');
  }

  // Try to probe the connection
  const logger = container.get<ILogger>(DEPENDENCIES.LOGGER);
  try {
    const apiClientFactory = container.get<IApiClientFactory>(DEPENDENCIES.API_CLIENT_FACTORY);
    const probeConfig = resolveZTMChatAccount({
      cfg: cfg ?? undefined,
      accountId: accountId ?? undefined,
    }).config;
    const apiClient = apiClientFactory(probeConfig, { logger });
    const meshResult = await apiClient.getMeshInfo();

    if (!meshResult.ok) {
      return warnings;
    }

    const meshInfo = meshResult.value;
    if (!meshInfo?.connected) {
      warnings.push('ZTM Agent is not connected to the mesh network');
    }
    if (meshInfo?.errors && meshInfo.errors.length > 0) {
      warnings.push(
        `ZTM Agent has ${meshInfo.errors.length} error(s): ${meshInfo.errors[0]?.message ?? 'Unknown error'}`
      );
    }
  } catch (err) {
    logger.warn?.(
      `Probe failed for ${accountId}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return warnings;
};

// ============================================================================
// Channel Plugin Definition - Modular Structure
// ============================================================================
// The plugin is organized into logical sections for better maintainability.
// Each section is self-contained and focuses on a specific responsibility.

export const ztmChatPlugin: ChannelPlugin<ResolvedZTMChatAccount> = {
  // ---------------------------------------------------------------------------
  // Meta Section - Plugin metadata and branding
  // ---------------------------------------------------------------------------
  id: 'ztm-chat',
  meta: {
    id: meta.id,
    label: meta.label,
    selectionLabel: meta.selectionLabel,
    docsPath: meta.docsPath,
    blurb: meta.blurb,
    aliases: [...meta.aliases],
    quickstartAllowFrom: true,
  },

  // ---------------------------------------------------------------------------
  // Gateway Methods Section - Account login methods (not applicable for ZTM)
  // ---------------------------------------------------------------------------
  gatewayMethods: [],

  // ---------------------------------------------------------------------------
  // Pairing Section - Device pairing configuration
  // ---------------------------------------------------------------------------
  pairing: {
    idLabel: 'username',
    normalizeAllowEntry: entry => entry?.trim()?.toLowerCase() ?? '',
    notifyApproval: async ({ cfg, id }) => {
      const account = resolveZTMChatAccount({ cfg });
      const config = getZTMChatConfig(account);
      if (!config) return;
      const logger = container.get<ILogger>(DEPENDENCIES.LOGGER);
      const sender = container.get<IChatSender>(DEPENDENCIES.API_CLIENT_SENDER);
      const message: ZTMMessage = {
        time: Date.now(),
        message: `Pairing approved! You can now send messages to this bot.`,
        sender: config.username,
      };
      const result = await sender.sendPeerMessage(id, message);
      if (!result.ok) {
        logger.warn?.(
          `[ZTM] Failed to send pairing approval message to ${id}: ${result.error?.message}`
        );
      }
    },
  },

  // ---------------------------------------------------------------------------
  // Capabilities Section - Feature flags for this channel
  // ---------------------------------------------------------------------------
  capabilities: {
    chatTypes: ['direct', 'group'],
    reactions: false,
    threads: false,
    media: false,
    nativeCommands: false,
    blockStreaming: false,
  },

  // ---------------------------------------------------------------------------
  // Setup Section - CLI account management
  // ---------------------------------------------------------------------------
  setup: {
    resolveAccountId: ({ accountId }) => accountId?.trim()?.toLowerCase() || 'default',
    applyAccountName: ({ cfg, accountId, name }) => {
      const accountKey = accountId || 'default';
      const accounts = { ...cfg.channels?.['ztm-chat']?.accounts };
      const existing = accounts[accountKey] ?? {};
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          ['ztm-chat']: {
            ...cfg.channels?.['ztm-chat'],
            accounts: {
              ...accounts,
              [accountKey]: {
                ...existing,
                ...(name ? { name } : {}),
              },
            },
          },
        },
      };
    },
    validateInput: ({ accountId: _accountId, input }) => {
      // Validate ZTM required fields
      const channelInput = input as Record<string, unknown>;
      if (!channelInput.agentUrl) {
        return 'ZTM Chat requires --agent-url.';
      }
      if (!channelInput.username) {
        return 'ZTM Chat requires --username.';
      }
      if (!channelInput.meshName) {
        return 'ZTM Chat requires --mesh-name.';
      }
      if (!channelInput.permitSource) {
        return 'ZTM Chat requires --permit-source (server or file).';
      }
      if (channelInput.permitSource === 'server' && !channelInput.permitUrl) {
        return "ZTM Chat requires --permit-url when permit-source is 'server'.";
      }
      if (channelInput.permitSource === 'file' && !channelInput.permitFilePath) {
        return "ZTM Chat requires --permit-file-path when permit-source is 'file'.";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const accountKey = accountId || 'default';
      const channelInput = input as Record<string, unknown>;
      const accounts = { ...cfg.channels?.['ztm-chat']?.accounts };
      const existing = accounts[accountKey] ?? {};

      // Build config object from input
      const ztmConfig: Record<string, unknown> = {};
      if (channelInput.agentUrl) ztmConfig.agentUrl = channelInput.agentUrl;
      if (channelInput.username) ztmConfig.username = channelInput.username;
      if (channelInput.meshName) ztmConfig.meshName = channelInput.meshName;
      if (channelInput.permitSource) ztmConfig.permitSource = channelInput.permitSource;
      if (channelInput.permitUrl) ztmConfig.permitUrl = channelInput.permitUrl;
      if (channelInput.permitFilePath) ztmConfig.permitFilePath = channelInput.permitFilePath;
      if (channelInput.enableGroups !== undefined)
        ztmConfig.enableGroups = channelInput.enableGroups;
      if (channelInput.dmPolicy) ztmConfig.dmPolicy = channelInput.dmPolicy;
      if (channelInput.allowFrom) ztmConfig.allowFrom = channelInput.allowFrom;

      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          ['ztm-chat']: {
            ...cfg.channels?.['ztm-chat'],
            accounts: {
              ...accounts,
              [accountKey]: {
                ...existing,
                ...ztmConfig,
              },
            },
          },
        },
      };
    },
  },

  // ---------------------------------------------------------------------------
  // Reload Section - Configuration reload handling
  // ---------------------------------------------------------------------------
  reload: { configPrefixes: ['channels.ztm-chat'] },

  // ---------------------------------------------------------------------------
  // Onboarding Section - Channel onboarding adapter
  // ---------------------------------------------------------------------------
  onboarding: ztmChatOnboardingAdapter,

  // ---------------------------------------------------------------------------
  // Heartbeat Section - Connection health checking
  // ---------------------------------------------------------------------------
  heartbeat: ztmChatHeartbeatAdapter,

  // ---------------------------------------------------------------------------
  // Agent Tools Section - Custom AI agent tools
  // ---------------------------------------------------------------------------
  agentTools: createZTMChatAgentTools,

  // ---------------------------------------------------------------------------
  // Config Schema Section - Configuration validation
  // ---------------------------------------------------------------------------
  configSchema: buildChannelConfigSchemaWithHints(),

  // ---------------------------------------------------------------------------
  // Config Section - Account configuration resolution
  // ---------------------------------------------------------------------------
  config: {
    listAccountIds: cfg => listZTMChatAccountIds(cfg ?? undefined),
    resolveAccount: (cfg, accountId) =>
      resolveZTMChatAccount({ cfg: cfg ?? undefined, accountId: accountId ?? undefined }),
    defaultAccountId: cfg => resolveDefaultZTMChatAccountId(cfg ?? undefined),
    isConfigured: account => isConfigMinimallyValid(getZTMChatConfig(account) ?? {}),
    unconfiguredReason: (account, _cfg) => {
      const config = getZTMChatConfig(account);
      if (!config?.agentUrl) return 'not configured';
      if (!config?.username) return 'not configured';
      if (!config?.meshName) return 'not configured';
      if (!config?.permitSource) return 'not configured';
      if (config.permitSource === 'server' && !config.permitUrl) return 'not configured';
      if (config.permitSource === 'file' && !config.permitFilePath) return 'not configured';
      // Return empty string when properly configured (falsy, will be handled by caller)
      return '';
    },
    setAccountEnabled: ({ cfg, accountId, enabled }) => {
      const accountKey = accountId || 'default';
      const accounts = { ...cfg.channels?.['ztm-chat']?.accounts };
      const existing = accounts[accountKey] ?? {};
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          ['ztm-chat']: {
            ...cfg.channels?.['ztm-chat'],
            accounts: {
              ...accounts,
              [accountKey]: {
                ...existing,
                enabled,
              },
            },
          },
        },
      };
    },
    deleteAccount: ({ cfg, accountId }) => {
      const accountKey = accountId || 'default';
      const accounts = { ...cfg.channels?.['ztm-chat']?.accounts };
      delete accounts[accountKey];
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          ['ztm-chat']: {
            ...cfg.channels?.['ztm-chat'],
            accounts: Object.keys(accounts).length ? accounts : undefined,
          },
        },
      };
    },
    describeAccount: account => {
      const config = getZTMChatConfig(account);
      return {
        accountId: account.accountId,
        name: account.username,
        enabled: account.enabled,
        configured: isConfigMinimallyValid(config ?? {}),
        agentUrl: config?.agentUrl,
        meshName: config?.meshName,
      };
    },
    resolveAllowFrom: ({ cfg, accountId }) => {
      const account = resolveZTMChatAccount({
        cfg: cfg ?? undefined,
        accountId: accountId ?? undefined,
      });
      const config = getZTMChatConfig(account);
      return getOrDefault(config?.allowFrom, []).map(entry => String(entry ?? ''));
    },
    formatAllowFrom: ({ allowFrom }) =>
      getOrDefault(allowFrom, [])
        .map(entry => String(entry).trim())
        .filter(Boolean)
        .map(entry => entry.toLowerCase()),
  },

  // ---------------------------------------------------------------------------
  // Security Section - DM policy and warnings
  // ---------------------------------------------------------------------------
  security: {
    resolveDmPolicy: resolveDmPolicyImpl,
    collectWarnings: collectWarningsImpl,
  },

  // ---------------------------------------------------------------------------
  // Groups Section - Group chat configuration
  // ---------------------------------------------------------------------------
  groups: {
    resolveRequireMention: () => false,
    resolveToolPolicy: () => ({ allow: ['ztm-chat'] }),
  },

  // ---------------------------------------------------------------------------
  // Messaging Section - Message target handling
  // ---------------------------------------------------------------------------
  messaging: {
    normalizeTarget: target => target.trim().toLowerCase(),
    targetResolver: {
      looksLikeId: target => Boolean(target && target.length > 0),
      hint: '<username>',
    },
  },

  // ---------------------------------------------------------------------------
  // Outbound Section - Message sending
  // ---------------------------------------------------------------------------
  outbound: {
    deliveryMode: 'direct',
    chunker: (text: string, limit: number): string[] => {
      if (text.length <= limit) return [text];
      const chunks: string[] = [];
      for (let i = 0; i < text.length; i += limit) {
        chunks.push(text.slice(i, i + limit));
      }
      return chunks;
    },
    chunkerMode: 'text' as const,
    textChunkLimit: 4000,
    sendText: async ({ to, text, accountId }) => {
      const target = to == null ? '' : String(to);
      const accountKey = accountId == null ? undefined : accountId;
      return sendTextGateway({ to: target, text, accountId: accountKey });
    },
    sendMedia: async ({ to: _to, text: _text, mediaUrl: _mediaUrl, accountId: _accountId }) => {
      // ZTM doesn't support media sending yet
      return {
        channel: 'ztm-chat',
        ok: false,
        messageId: '',
        error: 'Media sending not supported',
      };
    },
  },

  // ---------------------------------------------------------------------------
  // Actions Section - Message operations (not supported in ZTM)
  // ---------------------------------------------------------------------------
  actions: {
    listActions: () => [],
    supportsAction: ({ action: _action }) => false,
    handleAction: async ({ action: _action }) => {
      throw new Error(`Action ${_action} not supported for ztm-chat`);
    },
  },

  // ---------------------------------------------------------------------------
  // Threading Section - Thread/reply configuration (not supported in ZTM)
  // ---------------------------------------------------------------------------
  threading: {
    resolveReplyToMode: () => 'off' as const,
  },

  // ---------------------------------------------------------------------------
  // Commands Section - Command configuration
  // ---------------------------------------------------------------------------
  commands: {
    enforceOwnerForCommands: false,
    skipWhenConfigEmpty: false,
  },

  // ---------------------------------------------------------------------------
  // Status Section - Runtime status and health checks
  // ---------------------------------------------------------------------------
  status: {
    defaultRuntime,
    collectStatusIssues: (accounts: ChannelAccountSnapshot[]): ChannelStatusIssue[] => {
      return collectStatusIssues(accounts);
    },
    buildChannelSummary,
    probeAccount: async ({ account, timeoutMs = PROBE_TIMEOUT_MS }) => {
      return probeAccountGateway({ account, timeoutMs });
    },
    buildAccountSnapshot: ({ account }) => {
      return buildAccountSnapshot({ account });
    },
  },

  // ---------------------------------------------------------------------------
  // Directory Section - User and peer discovery
  // ---------------------------------------------------------------------------
  directory: {
    self: directorySelf,
    listPeers: directoryListPeers,
    listGroups: async () => {
      // Group chat support is future feature
      return [];
    },
  },

  // ---------------------------------------------------------------------------
  // Gateway Section - Account lifecycle management
  // ---------------------------------------------------------------------------
  gateway: {
    startAccount: async ctx => {
      const log = ctx.log;
      const adaptedCtx = {
        ...ctx,
        log: log
          ? {
              info: (...args: unknown[]) => log.info(args[0] as string),
              error: log.error ? (...args: unknown[]) => log.error(args[0] as string) : undefined,
            }
          : undefined,
      };
      const cleanup = await startAccountGateway(adaptedCtx);

      // OpenClaw expects startAccount to return a long-lived Promise that stays
      // pending for the entire channel lifetime. When the Promise resolves, OpenClaw
      // treats it as "channel exited" and triggers auto-restart. We keep it pending
      // until abortSignal fires, then call cleanup and resolve.
      return new Promise<void>((resolve, reject) => {
        const abortSignal = ctx.abortSignal;

        if (abortSignal?.aborted) {
          cleanup().then(resolve, reject);
          return;
        }

        if (abortSignal) {
          abortSignal.addEventListener(
            'abort',
            () => {
              cleanup().then(resolve, reject);
            },
            { once: true }
          );
        }
        // If no abortSignal provided, the Promise stays pending indefinitely
        // (channel runs until process exit)
      });
    },
    logoutAccount: async ({ accountId, cfg }) => {
      return logoutAccountGateway({ accountId: accountId ?? 'default', cfg: cfg ?? undefined });
    },
  },
};
