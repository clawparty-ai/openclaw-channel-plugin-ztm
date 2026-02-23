/**
 * ZTM Chat Gateway Implementation
 * @module channel/gateway
 * Gateway methods for starting, stopping, and managing accounts
 */

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
import { ZTMTimeoutError, ZTMApiError } from '../types/errors.js';
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
import { createMessagingContext } from '../messaging/context.js';
import { container, DEPENDENCIES } from '../di/index.js';
import { resolveZTMChatAccount } from './config.js';
import {
  validateAgentConnectivity,
  loadOrRequestPermit,
  joinMeshIfNeeded,
  configureAgent,
  probeAccount as probeAccountConnectivity,
  resolveAccountPermitPath,
} from './connectivity-manager.js';
import { createInboundContext, createMessageCallback } from './message-dispatcher.js';

// ============================================================================
// Local Types
// ============================================================================

interface ChannelAccountSnapshot extends BaseChannelAccountSnapshot {
  // No additional fields - using base type
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
  meshConnected: boolean;
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
function resolveAndValidateConfig(
  accountConfig: ZTMChatConfig,
  accountId: string
): {
  config: ZTMChatConfig;
  endpointName: string;
  permitPath: string;
} {
  const config = resolveZTMChatConfig(accountConfig);
  const validation = validateZTMChatConfig(config);

  if (!validation.valid) {
    throw new Error(validation.errors.join('; '));
  }

  const permitPath = resolveAccountPermitPath(accountId);
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
 * Throw an error with account state error details when runtime initialization fails
 */
export function throwInitializationError(accountId: string): never {
  const accountStates = getAllAccountStates();
  const state = accountStates.get(accountId);
  throw new Error(state?.lastError ?? 'Failed to initialize ZTM connection');
}

/**
 * Get account runtime state by account ID
 */
function getAccountState(accountId: string): AccountRuntimeState {
  const accountStates = getAllAccountStates();
  const state = accountStates.get(accountId);
  if (!state) {
    throw new Error(`Account state not found for: ${accountId}`);
  }
  return state;
}

/**
 * Pre-load message state asynchronously to prevent blocking in hot path
 * This ensures state is loaded before any getWatermark/setWatermark calls
 */
async function preloadMessageState(
  accountId: string,
  log?: { error?: (...args: unknown[]) => void }
): Promise<void> {
  const { getAccountMessageStateStore } = await import('../runtime/store.js');
  const messageStateStore = getAccountMessageStateStore(accountId);
  messageStateStore.ensureLoaded().catch(err => {
    log?.error?.(`[${accountId}] Failed to pre-load message state: ${err}`);
  });
}

/**
 * Setup account message callbacks and periodic cleanup
 */
export async function setupAccountCallbacks(
  accountId: string,
  config: ZTMChatConfig,
  state: AccountRuntimeState,
  ctx: {
    log?: {
      info: (...args: unknown[]) => void;
      warn?: (...args: unknown[]) => void;
      error?: (...args: unknown[]) => void;
    };
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

  // Abort any existing watcher before starting a new one
  if (state.watchAbortController) {
    state.watchAbortController.abort();
    state.watchAbortController = undefined;
  }

  // Create abort controller for the new watcher
  const watchAbortController = new AbortController();
  state.watchAbortController = watchAbortController;

  // Create messaging context and start watching for messages
  const messagingContext = createMessagingContext(rt);
  await startMessageWatcher(state, messagingContext, watchAbortController.signal);

  // Setup periodic cleanup to prevent unbounded growth of pending pairings
  const cleanupInterval = setInterval(() => {
    cleanupExpiredPairings();
  }, PAIRING_CLEANUP_INTERVAL_MS);

  return { messageCallback, cleanupInterval };
}

export async function startAccountGateway(ctx: {
  account: { config: ZTMChatConfig; accountId: string };
  log?: {
    info: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
  };
  cfg?: Record<string, unknown>;
  setStatus?: (status: {
    accountId: string;
    running: boolean;
    lastStartAt?: number;
    lastStopAt?: number;
  }) => void;
}): Promise<() => Promise<void>> {
  const { account } = ctx;

  // Step 1: Resolve and validate configuration
  const { config, endpointName, permitPath } = resolveAndValidateConfig(
    account.config,
    account.accountId
  );

  // Step 2: Validate connectivity for agent URL
  await validateAgentConnectivity(config.agentUrl, ctx);

  // Step 3-5: Load or request permit
  const permitData = await loadOrRequestPermit(config, permitPath, ctx);

  // Step 6: Configure agent (similar to ztm config --agent)
  await configureAgent(config, ctx);

  // Step 7: Join mesh if needed
  await joinMeshIfNeeded(config, endpointName, permitData, ctx);

  // Step 7: Initialize runtime
  const initialized = await initializeRuntime(config, account.accountId);
  if (!initialized) {
    throwInitializationError(account.accountId);
  }

  // Step 7.5: Pre-load message state asynchronously to prevent blocking in hot path
  await preloadMessageState(account.accountId, ctx.log);

  // Get account state and update start time
  const state = getAccountState(account.accountId);
  state.lastStartAt = new Date();

  // Report running status to OpenClaw core
  ctx.setStatus?.({ accountId: account.accountId, running: true, lastStartAt: Date.now() });

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
    state.watchAbortController?.abort();
    await stopRuntime(account.accountId);

    // Report stopped status to OpenClaw core
    ctx.setStatus?.({ accountId: account.accountId, running: false, lastStopAt: Date.now() });
  };
}

// ============================================================================
// Logout Account Gateway
// ============================================================================

/**
 * Logout account gateway implementation
 *
 * @param accountId - The account ID to logout
 * @returns Promise resolving to cleared status
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

// Retry configuration
const MESSAGE_RETRY_MAX_ATTEMPTS = 3;
const MESSAGE_RETRY_DELAY_MS = 2000;

/**
 * Check if an error is retryable
 *
 * Errors that can be retried include:
 * - Network timeouts
 * - API errors with 5xx status codes
 * - Temporary service unavailability
 *
 * @param error - The error to check
 * @returns true if the error is retryable
 */
function isRetryableError(error: unknown): boolean {
  // ZTMError types with retryable codes
  if (error instanceof ZTMTimeoutError) {
    return true;
  }

  if (error instanceof ZTMApiError) {
    // Retry on server errors (5xx) or rate limiting (429)
    const statusCode = error.context.statusCode as number | undefined;
    if (statusCode === 429 || (statusCode !== undefined && statusCode >= 500 && statusCode < 600)) {
      return true;
    }
  }

  // Check for network-related errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('ECONNREFUSED') ||
      message.includes('ETIMEDOUT') ||
      message.includes('ENOTFOUND')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Retry a message later with exponential backoff
 *
 * @param state - Account runtime state
 * @param msg - The message to retry
 * @param attempt - Current attempt number (1-based)
 * @returns Promise that resolves when retry is scheduled
 */
async function retryMessageLater(
  state: AccountRuntimeState,
  msg: ZTMChatMessage,
  attempt: number
): Promise<void> {
  if (attempt >= MESSAGE_RETRY_MAX_ATTEMPTS) {
    logger.error(
      `[${state.accountId}] Message from ${msg.sender} failed after ${MESSAGE_RETRY_MAX_ATTEMPTS} attempts, giving up`
    );
    return;
  }

  // Exponential backoff: 2s, 4s, 8s...
  const delay = MESSAGE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
  logger.warn(
    `[${state.accountId}] Scheduling retry ${attempt + 1}/${MESSAGE_RETRY_MAX_ATTEMPTS} for message from ${msg.sender} in ${delay}ms`
  );

  setTimeout(async () => {
    try {
      const rt = container.get(DEPENDENCIES.RUNTIME).get();
      await dispatchInboundMessage(state, state.accountId, state.config!, msg, rt);
      logger.info(`[${state.accountId}] Retry succeeded for message from ${msg.sender}`);
    } catch (error) {
      const errorMsg = extractErrorMessage(error);
      logger.error(
        `[${state.accountId}] Retry ${attempt + 1} failed for message from ${msg.sender}: ${errorMsg}`
      );
      if (isRetryableError(error)) {
        await retryMessageLater(state, msg, attempt + 1);
      }
    }
  }, delay);
}

/**
 * Create dispatcher options for reply delivery
 * Extracted to reduce nesting in buildMessageCallback
 *
 * @param state - Account runtime state
 * @param msg - The incoming message to reply to
 * @param accountId - The account identifier
 * @param agentId - The AI agent identifier
 * @param rt - ZTM runtime instance
 * @returns Dispatcher options object with deliver and onError callbacks
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
 *
 * @param state - Account runtime state
 * @param accountId - The account identifier
 * @param config - ZTM Chat configuration
 * @param msg - The incoming message to dispatch
 * @param rt - ZTM runtime instance
 * @returns Promise that resolves when dispatch completes
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

  logger.info?.(
    `[${accountId}] Dispatching message from ${msg.sender} to AI agent (route: ${matchedBy})`
  );

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
      logger.error(`[${accountId}] Failed to dispatch message from ${msg.sender}: ${errorMsg}`);

      // Attempt retry for retryable errors
      if (isRetryableError(error)) {
        logger.warn(
          `[${accountId}] Error is retryable, scheduling retry for message from ${msg.sender}`
        );
        retryMessageLater(state, msg, 1).catch(retryError => {
          const retryErrorMsg = extractErrorMessage(retryError);
          logger.error(
            `[${accountId}] Retry scheduling failed for message from ${msg.sender}: ${retryErrorMsg}`
          );
        });
      }
    });
  };
}
