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
import { isConfigMinimallyValid } from '../config/validation.js';
import { logger } from '../utils/logger.js';
import { extractErrorMessage } from '../utils/error.js';
import { isRetryableError } from '../utils/retry.js';
import { getAllAccountStates, stopRuntime, removeAccountState } from '../runtime/state.js';
import { sendZTMMessage, generateMessageId } from '../messaging/outbound.js';
import { container, DEPENDENCIES } from '../di/index.js';
import { resolveZTMChatAccount } from './config.js';
import { resolvePermitPath } from '../utils/paths.js';
import { loadPermitFromFile } from '../connectivity/permit.js';
import { getCertificateExpiryStatus } from '../utils/certificate.js';
import { probeAccount as probeAccountConnectivity } from './connectivity-manager.js';
import type { StepContext } from './gateway-pipeline.types.js';
import { dispatchInboundMessage } from './gateway-message-handler.js';
import { retryMessageLater } from './gateway-message-retry.js';
import { CERT_EXPIRY_WARNING_DAYS } from '../constants.js';

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
 * Collect status issues for configured accounts.
 *
 * Checks both configuration validity and runtime state to provide
 * comprehensive status reporting.
 *
 * @param accounts - Array of channel account snapshots
 * @returns Array of status issues with kind (config|runtime) and level (error|warn|info)
 *
 * @example
 * ```typescript
 * const issues = collectStatusIssues(accounts);
 * // Returns issues like:
 * // [
 * //   { kind: 'config', level: 'error', message: 'Missing required configuration' },
 * //   { kind: 'runtime', level: 'warn', message: 'Account stopped' }
 * // ]
 * ```
 */
export function collectStatusIssues(accounts: ChannelAccountSnapshot[]): ChannelStatusIssue[] {
  if (!accounts || accounts.length === 0) {
    return [];
  }

  const snapshot = accounts[0];
  const cfg = (snapshot as ChannelAccountSnapshot & { cfg?: OpenClawConfig }).cfg;
  const accountId = snapshot?.accountId;

  // Extract repeated values into local variables
  const channel = 'ztm-chat';
  const effectiveAccountId = accountId || 'default';

  const issues: ChannelStatusIssue[] = [];
  const account = resolveZTMChatAccount({ cfg, accountId });
  const config = account.config as ZTMChatConfig;

  // 1. Configuration check (no early return, continue to collect all issues)
  if (!isConfigMinimallyValid(config)) {
    issues.push({
      channel,
      accountId: effectiveAccountId,
      kind: 'config',
      level: 'error',
      message: 'Missing required configuration (agentUrl or username)',
    });
    // Continue to runtime checks
  }

  // 2. Runtime state checks
  // Note: getAllAccountStates() returns an in-memory Map that is only populated
  // within the gateway process. When called from the CLI process (e.g., `openclaw
  // channels status`), the Map is always empty. We only report "Account not
  // initialized" when the Map has entries for other accounts but not this one,
  // which indicates a real issue within the running gateway.
  const allStates = getAllAccountStates();
  const runtimeState = allStates.get(effectiveAccountId);

  // Only check runtime state when inside the gateway process (Map is non-empty)
  if (allStates.size > 0) {
    // 2a. Check if account is initialized
    if (!runtimeState) {
      issues.push({
        channel,
        accountId: effectiveAccountId,
        kind: 'runtime',
        level: 'info',
        message: 'Account not initialized',
      });
    } else {
      // 2b. Check if account is stopped
      if (!runtimeState.started) {
        issues.push({
          channel,
          accountId: effectiveAccountId,
          kind: 'runtime',
          level: 'warn',
          message: 'Account stopped',
        });
      }

      // 2c. Check for runtime errors
      if (runtimeState.lastError) {
        issues.push({
          channel,
          accountId: effectiveAccountId,
          kind: 'runtime',
          level: 'error',
          message: `Runtime error: ${runtimeState.lastError}`,
        });
      }

      // 2d. Check start/stop times (account was stopped)
      if (runtimeState.lastStartAt && runtimeState.lastStopAt) {
        const startTime = new Date(runtimeState.lastStartAt).getTime();
        const stopTime = new Date(runtimeState.lastStopAt).getTime();
        if (stopTime > startTime) {
          issues.push({
            channel,
            accountId: effectiveAccountId,
            kind: 'runtime',
            level: 'warn',
            message: 'Account was stopped',
          });
        }
      }
    }
  }

  // 3. Check certificate expiration
  const permitPath = resolvePermitPath(effectiveAccountId);
  const permitData = loadPermitFromFile(permitPath);

  if (permitData?.agent?.certificate) {
    const expiryStatus = getCertificateExpiryStatus(permitData.agent.certificate);

    // Check for parse errors first - certificate cannot be read
    if (expiryStatus.parseError) {
      issues.push({
        channel,
        accountId: effectiveAccountId,
        kind: 'auth',
        level: 'error',
        message: 'Failed to parse certificate - certificate may be corrupted',
      });
    } else if (expiryStatus.isExpired) {
      issues.push({
        channel,
        accountId: effectiveAccountId,
        kind: 'auth',
        level: 'error',
        message: 'Certificate has expired',
      });
    } else if (
      expiryStatus.daysUntilExpiry !== null &&
      expiryStatus.daysUntilExpiry < CERT_EXPIRY_WARNING_DAYS
    ) {
      issues.push({
        channel,
        accountId: effectiveAccountId,
        kind: 'auth',
        level: 'warn',
        message: `Certificate expires in ${expiryStatus.daysUntilExpiry} days`,
      });
    }
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
  const channel = 'ztm-chat';
  const accountKey = accountId ?? 'default';
  const accountStates = getAllAccountStates();
  const state = accountStates.get(accountKey);

  if (!state) {
    return {
      channel,
      ok: false,
      messageId: '',
      error: 'Account not initialized',
    };
  }

  const peer = to.replace(/^ztm-chat:/, '');
  const result = await sendZTMMessage(state, peer, text);

  return {
    channel,
    ok: result.ok,
    messageId: result.ok ? generateMessageId() : '',
    error: result.ok ? undefined : (result.error?.message ?? state.lastError ?? undefined),
  };
}

// ============================================================================
// Start Account Gateway
// ============================================================================

/**
 * Start the ZTM Chat account gateway
 * @param ctx - Context object containing account config, logger, and status setter
 * @returns Promise resolving to a cleanup function to be called on shutdown
 * @remarks
 * This function initiates the account gateway using the Pipeline pattern.
 * It executes 7 sequential steps: validate_config, validate_connectivity,
 * load_permit, join_mesh, initialize_runtime, preload_message_state, and setup_callbacks.
 * Each step has configurable retry policies for fault tolerance.
 *
 * The returned cleanup function should be called when stopping the account:
 * ```typescript
 * const cleanup = await startAccountGateway({ account, log, setStatus });
 * // ... account is running
 * await cleanup(); // stop account
 * ```
 */

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
  // Import here to avoid circular dependencies
  const { GatewayPipeline } = await import('./gateway-pipeline.js');
  const { createGatewaySteps } = await import('./gateway-steps.js');
  const { getOrDefault } = await import('../utils/guards.js');

  const stepCtx: StepContext = {
    account: ctx.account,
    log: ctx.log,
    cfg: ctx.cfg,
    setStatus: ctx.setStatus,
  };

  // Create and execute pipeline
  const steps = createGatewaySteps(stepCtx);
  const pipeline = new GatewayPipeline(stepCtx, steps);
  const cleanupFn = await pipeline.execute();

  // Type assertion - pipeline populates config
  const resolvedConfig = stepCtx.config;

  // Log success and pairing status (moved from inline to here)
  ctx.log?.info(
    `[${ctx.account.accountId}] Connected to ZTM mesh "${resolvedConfig?.meshName}" as ${resolvedConfig?.username}`
  );

  if (resolvedConfig?.dmPolicy === 'pairing') {
    const allowFrom = getOrDefault(resolvedConfig.allowFrom, []);
    if (allowFrom.length === 0) {
      ctx.log?.info(
        `[${ctx.account.accountId}] Pairing mode active - no approved users. ` +
          `Users must send a message to initiate pairing. ` +
          `Approve users with: openclaw pairing approve ztm-chat <username>`
      );
    } else {
      ctx.log?.info(
        `[${ctx.account.accountId}] Pairing mode active - ${allowFrom.length} approved user(s)`
      );
    }
  }

  return cleanupFn;
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

/**
 * Build message callback for account startup
 * @remarks
 * This function creates a callback that handles incoming messages.
 * Message dispatch and retry logic has been extracted to separate modules:
 * - gateway-message-handler.ts: Message dispatching
 * - gateway-message-retry.ts: Retry logic with exponential backoff
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
