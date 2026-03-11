/**
 * Gateway Message Retry
 * @module channel/gateway-message-retry
 * @remarks
 * This module handles message retry logic for failed AI agent message dispatches.
 * It provides exponential backoff retry for transient failures.
 */
import type { ZTMChatMessage } from '../types/messaging.js';
import type { AccountRuntimeState } from '../runtime/state.js';
import { logger } from '../utils/logger.js';
import { extractErrorMessage } from '../utils/error.js';
import { isRetryableError } from '../utils/retry.js';
import { container, DEPENDENCIES } from '../di/index.js';
import { dispatchInboundMessage } from './gateway-message-handler.js';

// ============================================================================
// Retry Configuration
// ============================================================================

/**
 * Maximum number of retry attempts for message dispatch
 */
export const MESSAGE_RETRY_MAX_ATTEMPTS = 3;

/**
 * Initial delay in milliseconds between retry attempts
 */
export const MESSAGE_RETRY_DELAY_MS = 2000;

// ============================================================================
// Retry Logic
// ============================================================================

/**
 * Retry a message later with exponential backoff
 *
 * @param state - Account runtime state
 * @param msg - The message to retry
 * @param attempt - Current attempt number (1-based)
 * @returns Promise that resolves when retry is scheduled
 */
export async function retryMessageLater(
  state: AccountRuntimeState,
  msg: ZTMChatMessage,
  attempt: number
): Promise<void> {
  // CRITICAL: Don't schedule retry if account is shutting down
  if (state.watchAbortController?.signal.aborted || state.started === false) {
    logger.debug(`[${state.accountId}] Skipping retry - account is stopping`);
    return;
  }

  const timerKey = msg.id;

  if (attempt >= MESSAGE_RETRY_MAX_ATTEMPTS) {
    logger.error(
      `[${state.accountId}] Message from ${msg.sender} failed after ${MESSAGE_RETRY_MAX_ATTEMPTS} attempts, giving up`
    );
    // Clean up timer reference
    state.messageRetries?.delete(timerKey);
    return;
  }

  // Initialize map if needed
  if (!state.messageRetries) {
    state.messageRetries = new Map();
  }

  // Exponential backoff: 2s, 4s, 8s...
  const delay = MESSAGE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
  logger.warn(
    `[${state.accountId}] Scheduling retry ${attempt + 1}/${MESSAGE_RETRY_MAX_ATTEMPTS} for message from ${msg.sender} in ${delay}ms`
  );

  // Create timer and track it - map entry set before callback runs
  const timerId = setTimeout(async () => {
    try {
      // Clean up this timer
      state.messageRetries?.delete(timerKey);

      // Defensive check: account may have been removed during delay
      if (!state.config) {
        logger.debug(`[${state.accountId}] Skipping retry - account state no longer exists`);
        return;
      }

      const rt = container.get(DEPENDENCIES.RUNTIME).get();
      await dispatchInboundMessage(state, state.accountId, state.config, msg, rt);
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

  // Track timer for cleanup on account stop/remove
  state.messageRetries.set(timerKey, timerId);
}
