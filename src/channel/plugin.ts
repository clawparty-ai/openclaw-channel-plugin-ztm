// ZTM Chat Channel Plugin
// Main plugin definition implementing ChannelPlugin interface

import type { ChannelPlugin, OpenClawConfig } from 'openclaw/plugin-sdk';
import { ZTMChatConfigSchema } from '../config/index.js';
import type { ZTMChatConfig } from '../types/config.js';
import type { ZTMMessage } from '../api/ztm-api.js';
import {
  container,
  DEPENDENCIES,
  createLogger,
  createConfigService,
  createApiClientService,
  createApiClientFactory,
  createRuntimeService,
  createAllowFromRepositoryService,
  createMessageStateRepositoryService,
  createAccountStateManagerService,
  type ILogger,
  type IApiClient,
  type IApiClientFactory,
  type IRuntime,
} from '../di/index.js';
import type { ResolvedZTMChatAccount } from './config.js';
import { PROBE_TIMEOUT_MS } from '../constants.js';
import { getOrDefault, isNonEmptyArray } from '../utils/guards.js';

// Type guard to safely extract ZTMChatConfig from unknown
function isZTMChatConfig(config: unknown): config is ZTMChatConfig {
  return (
    typeof config === 'object' && config !== null && 'username' in config && 'agentUrl' in config
  );
}

// Safely get config with type guard
function getZTMChatConfig(account: { config: unknown }): ZTMChatConfig | null {
  return isZTMChatConfig(account.config) ? account.config : null;
}

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
container.register(DEPENDENCIES.API_CLIENT, createApiClientService());
container.register(DEPENDENCIES.API_CLIENT_FACTORY, createApiClientFactory());
container.register(DEPENDENCIES.RUNTIME, createRuntimeService());
container.register(DEPENDENCIES.ALLOW_FROM_REPO, createAllowFromRepositoryService());
container.register(DEPENDENCIES.MESSAGE_STATE_REPO, createMessageStateRepositoryService());
container.register(DEPENDENCIES.ACCOUNT_STATE_MANAGER, createAccountStateManagerService());

// ============================================================================
// Helper Functions (imported from other modules)
// ============================================================================

import {
  resolveZTMChatAccount,
  listZTMChatAccountIds,
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
import {
  buildChannelSummary,
  getDefaultStatus,
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
  // Pairing Section - Device pairing configuration
  // ---------------------------------------------------------------------------
  pairing: {
    idLabel: 'username',
    normalizeAllowEntry: entry => entry.trim().toLowerCase(),
    notifyApproval: async ({ cfg, id }) => {
      const account = resolveZTMChatAccount({ cfg });
      const config = getZTMChatConfig(account);
      if (!config) return;
      const logger = container.get<ILogger>(DEPENDENCIES.LOGGER);
      const apiClient = container.get<IApiClient>(DEPENDENCIES.API_CLIENT);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const runtime = container.get<IRuntime>(DEPENDENCIES.RUNTIME);
      const message: ZTMMessage = {
        time: Date.now(),
        message: `Pairing approved! You can now send messages to this bot.`,
        sender: config.username,
      };
      const result = await apiClient.sendPeerMessage(id, message);
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
    blockStreaming: true,
  },

  // ---------------------------------------------------------------------------
  // Reload Section - Configuration reload handling
  // ---------------------------------------------------------------------------
  reload: { configPrefixes: ['channels.ztm-chat'] },

  // ---------------------------------------------------------------------------
  // Config Schema Section - Configuration validation
  // ---------------------------------------------------------------------------
  configSchema: buildChannelConfigSchemaWithHints(ZTMChatConfigSchema),

  // ---------------------------------------------------------------------------
  // Config Section - Account configuration resolution
  // ---------------------------------------------------------------------------
  config: {
    listAccountIds: cfg => listZTMChatAccountIds(cfg ?? undefined),
    resolveAccount: (cfg, accountId) =>
      resolveZTMChatAccount({ cfg: cfg ?? undefined, accountId: accountId ?? undefined }),
    defaultAccountId: cfg => listZTMChatAccountIds(cfg ?? undefined)[0] ?? 'default',
    isConfigured: account => isConfigMinimallyValid(getZTMChatConfig(account) ?? {}),
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
    sendText: async ({ to, text, accountId }) => {
      const target = to == null ? '' : String(to);
      const accountKey = accountId == null ? undefined : accountId;
      return sendTextGateway({ to: target, text, accountId: accountKey });
    },
  },

  // ---------------------------------------------------------------------------
  // Status Section - Runtime status and health checks
  // ---------------------------------------------------------------------------
  status: {
    defaultRuntime: getDefaultStatus(),
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
      return startAccountGateway(adaptedCtx);
    },
    logoutAccount: async ({ accountId, cfg }) => {
      return logoutAccountGateway({ accountId: accountId ?? 'default', cfg: cfg ?? undefined });
    },
  },
};
