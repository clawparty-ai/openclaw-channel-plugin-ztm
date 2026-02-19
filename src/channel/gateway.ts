// ZTM Chat Gateway Implementation
// Gateway methods for starting, stopping, and managing accounts

import type {
  ChannelAccountSnapshot as BaseChannelAccountSnapshot,
  OpenClawConfig,
} from 'openclaw/plugin-sdk';
import type { ZTMChatConfig } from '../types/config.js';
import type { AccountRuntimeState } from '../runtime/state.js';
import type { ZTMChatMessage } from '../types/messaging.js';
import { resolveZTMChatConfig, validateZTMChatConfig } from '../config/index.js';
import { isConfigMinimallyValid } from '../config/validation.js';
import { logger } from '../utils/logger.js';
import { getOrDefault } from '../utils/guards.js';
import { extractErrorMessage } from '../utils/error.js';
import {
  getAllAccountStates,
  initializeRuntime,
  stopRuntime,
  removeAccountState,
  cleanupExpiredPairings,
} from '../runtime/state.js';
import { PAIRING_CLEANUP_INTERVAL_MS } from '../constants.js';
import { startMessageWatcher } from '../messaging/watcher.js';
import { sendZTMMessage, generateMessageId } from '../messaging/outbound.js';
import { container, DEPENDENCIES } from '../di/index.js';
import { resolveZTMChatAccount } from './config.js';
import {
  validateAgentConnectivity,
  loadOrRequestPermit,
  joinMeshIfNeeded,
  probeAccount as probeAccountConnectivity,
  resolveAccountPermitPath,
} from './connectivity-manager.js';
import { createInboundContext, createMessageCallback } from './message-dispatcher.js';

// ============================================================================
// Local Types
// ============================================================================

interface ChannelAccountSnapshot extends BaseChannelAccountSnapshot {
  meshConnected?: boolean;
  peerCount?: number;
}

interface ChannelStatusIssue {
  channel: string;
  accountId: string;
  kind: 'config' | 'intent' | 'permissions' | 'auth' | 'runtime';
  level?: 'error' | 'warn' | 'info';
  message: string;
}

// ============================================================================
// Status Issues
// ============================================================================

/**
 * Collect status issues for configured accounts
 */
export function collectStatusIssues(accounts: ChannelAccountSnapshot[]): ChannelStatusIssue[] {
  if (!accounts || accounts.length === 0) {
    return [];
  }

  const snapshot = accounts[0];
  const cfg = (snapshot as ChannelAccountSnapshot & { cfg?: OpenClawConfig }).cfg;
  const accountId = snapshot?.accountId;

  const issues: ChannelStatusIssue[] = [];
  const account = resolveZTMChatAccount({ cfg, accountId });
  const config = account.config as ZTMChatConfig;

  // Check config validity
  if (!isConfigMinimallyValid(config)) {
    issues.push({
      channel: 'ztm-chat',
      accountId: accountId || 'default',
      kind: 'config',
      level: 'error',
      message: 'Missing required configuration (agentUrl or username)',
    });
    return issues;
  }

  return issues;
}

// ============================================================================
// Probe Account (delegated to connectivity manager)
// ============================================================================

/**
 * Probe an account to check connectivity
 */
export async function probeAccountGateway({
  account,
  timeoutMs,
}: {
  account: { config: ZTMChatConfig };
  timeoutMs?: number;
}): Promise<{
  ok: boolean;
  error: string | null;
  meshInfo?: import('../api/ztm-api.js').ZTMMeshInfo;
}> {
  return probeAccountConnectivity({ config: account.config, _timeoutMs: timeoutMs });
}

// ============================================================================
// Send Text Gateway
// ============================================================================

/**
 * Send text message gateway
 */
export async function sendTextGateway({
  to,
  text,
  accountId,
}: {
  to: string;
  text: string;
  accountId?: string;
}): Promise<{
  channel: string;
  ok: boolean;
  messageId: string;
  error?: string;
}> {
  const accountKey = accountId ?? 'default';
  const accountStates = getAllAccountStates();
  const state = accountStates.get(accountKey);

  if (!state) {
    return {
      channel: 'ztm-chat',
      ok: false,
      messageId: '',
      error: 'Account not initialized',
    };
  }

  const peer = to.replace(/^ztm-chat:/, '');
  const result = await sendZTMMessage(state, peer, text);

  return {
    channel: 'ztm-chat',
    ok: result.ok,
    messageId: result.ok ? generateMessageId() : '',
    error: result.ok ? undefined : (result.error?.message ?? state.lastError ?? undefined),
  };
}

// ============================================================================
// Start Account Gateway
// ============================================================================

/**
 * Resolve and validate ZTM chat configuration
 */
function resolveAndValidateConfig(accountConfig: ZTMChatConfig): {
  config: ZTMChatConfig;
  endpointName: string;
  permitPath: string;
} {
  const config = resolveZTMChatConfig(accountConfig);
  const validation = validateZTMChatConfig(config);

  if (!validation.valid) {
    throw new Error(validation.errors.join('; '));
  }

  const permitPath = resolveAccountPermitPath();
  const endpointName = `${config.username}-ep`;

  return { config, endpointName, permitPath };
}

/**
 * Log pairing mode status
 */
function logPairingStatus(
  accountId: string,
  config: ZTMChatConfig,
  log?: { info: (...args: unknown[]) => void }
): void {
  if (config.dmPolicy === 'pairing') {
    const allowFrom = getOrDefault(config.allowFrom, []);
    if (allowFrom.length === 0) {
      log?.info(
        `[${accountId}] Pairing mode active - no approved users. ` +
          `Users must send a message to initiate pairing. ` +
          `Approve users with: openclaw pairing approve ztm-chat <username>`
      );
    } else {
      log?.info(`[${accountId}] Pairing mode active - ${allowFrom.length} approved user(s)`);
    }
  }
}

/**
 * Setup account message callbacks and periodic cleanup
 */
async function setupAccountCallbacks(
  accountId: string,
  config: ZTMChatConfig,
  state: AccountRuntimeState,
  ctx: {
    log?: { info: (...args: unknown[]) => void; error?: (...args: unknown[]) => void };
    cfg?: Record<string, unknown>;
  }
): Promise<{
  messageCallback: (msg: ZTMChatMessage) => Promise<void>;
  cleanupInterval: NodeJS.Timeout;
}> {
  const rt = container.get(DEPENDENCIES.RUNTIME).get();
  const cfg = ctx.cfg;

  // Setup message callback
  const messageCallback = createMessageCallback(accountId, config, rt, cfg, state, ctx);
  state.messageCallbacks.add(messageCallback);
  await startMessageWatcher(state);

  // Setup periodic cleanup to prevent unbounded growth of pending pairings
  const cleanupInterval = setInterval(() => {
    cleanupExpiredPairings();
  }, PAIRING_CLEANUP_INTERVAL_MS);

  return { messageCallback, cleanupInterval };
}

export async function startAccountGateway(ctx: {
  account: { config: ZTMChatConfig; accountId: string };
  log?: { info: (...args: unknown[]) => void; error?: (...args: unknown[]) => void };
  cfg?: Record<string, unknown>;
}): Promise<() => Promise<void>> {
  const { account } = ctx;

  // Step 1: Resolve and validate configuration
  const { config, endpointName, permitPath } = resolveAndValidateConfig(account.config);

  // Step 2: Validate connectivity for agent URL
  await validateAgentConnectivity(config.agentUrl, ctx);

  // Step 3-5: Load or request permit
  const permitData = await loadOrRequestPermit(config, permitPath, ctx);

  // Step 6: Join mesh if needed
  await joinMeshIfNeeded(config, endpointName, permitData, ctx);

  // Step 7: Initialize runtime
  const initialized = await initializeRuntime(config, account.accountId);

  if (!initialized) {
    const accountStates = getAllAccountStates();
    const state = accountStates.get(account.accountId);
    throw new Error(state?.lastError ?? 'Failed to initialize ZTM connection');
  }

  const accountStates = getAllAccountStates();
  const state = accountStates.get(account.accountId)!;
  state.lastStartAt = new Date();

  // Log connection success
  ctx.log?.info(
    `[${account.accountId}] Connected to ZTM mesh "${config.meshName}" as ${config.username}`
  );

  // Log pairing mode status
  logPairingStatus(account.accountId, config, ctx.log);

  // Step 8: Setup message callbacks and cleanup
  const { messageCallback, cleanupInterval } = await setupAccountCallbacks(
    account.accountId,
    config,
    state,
    ctx
  );

  // Return cleanup function
  return async () => {
    clearInterval(cleanupInterval);
    state.messageCallbacks.delete(messageCallback);
    await stopRuntime(account.accountId);
  };
}

// ============================================================================
// Logout Account Gateway
// ============================================================================

/**
 * Logout account gateway implementation
 */
export async function logoutAccountGateway({
  accountId,
  cfg: _cfg,
}: {
  accountId: string;
  cfg?: unknown;
}): Promise<{ cleared: boolean }> {
  await stopRuntime(accountId);
  removeAccountState(accountId);
  return { cleared: true };
}

// ============================================================================
// Message Callback Builder (legacy - delegates to message-dispatcher)
// ============================================================================

/**
 * Create dispatcher options for reply delivery
 * Extracted to reduce nesting in buildMessageCallback
 */
function createReplyDispatcherOptions(
  state: AccountRuntimeState,
  msg: ZTMChatMessage,
  accountId: string,
  agentId: string,
  rt: ReturnType<typeof import('../runtime/index.js').getZTMRuntime>
) {
  return {
    humanDelay: rt.channel.reply.resolveHumanDelayConfig({}, agentId),
    deliver: async (payload: { text?: string; mediaUrl?: string }) => {
      const replyText = payload.text ?? '';
      if (!replyText) return;
      const groupInfo =
        msg.isGroup && msg.groupId && msg.groupCreator
          ? { creator: msg.groupCreator, group: msg.groupId }
          : undefined;
      await sendZTMMessage(state, msg.sender, replyText, groupInfo);
    },
    onError: (err: unknown) => {
      logger.error?.(`[${accountId}] Reply delivery failed for ${msg.sender}: ${String(err)}`);
    },
  };
}

/**
 * Dispatch inbound message to AI agent
 * Extracted to reduce nesting in buildMessageCallback
 */
async function dispatchInboundMessage(
  state: AccountRuntimeState,
  accountId: string,
  config: ZTMChatConfig,
  msg: ZTMChatMessage,
  rt: ReturnType<typeof import('../runtime/index.js').getZTMRuntime>
): Promise<void> {
  const { ctxPayload, matchedBy, agentId } = createInboundContext({
    rt,
    msg,
    config,
    accountId,
  });

  logger.info?.(`[${accountId}] Dispatching message from ${msg.sender} to AI agent (route: ${matchedBy})`);

  const dispatcherOptions = createReplyDispatcherOptions(state, msg, accountId, agentId, rt);

  const { queuedFinal } = await rt.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: {},
    dispatcherOptions,
  });

  if (!queuedFinal) {
    logger.info?.(`[${accountId}] No response generated for message from ${msg.sender}`);
  }
}

/**
 * Build message callback for account startup
 */
export function buildMessageCallback(
  state: AccountRuntimeState,
  accountId: string,
  config: ZTMChatConfig
): (msg: ZTMChatMessage) => void {
  const rt = container.get(DEPENDENCIES.RUNTIME).get();

  return (msg: ZTMChatMessage) => {
    dispatchInboundMessage(state, accountId, config, msg, rt).catch(error => {
      const errorMsg = extractErrorMessage(error);
      logger.error?.(`[${accountId}] Failed to dispatch message from ${msg.sender}: ${errorMsg}`);
    });
  };
}
