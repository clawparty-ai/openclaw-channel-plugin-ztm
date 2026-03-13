/**
 * Message Callback Dispatching
 * @module messaging/dispatcher
 * Handles notification of registered message callbacks
 */

import { logger } from '../utils/logger.js';
import { extractErrorMessage } from '../utils/error.js';
import { getAccountMessageStateStore } from '../runtime/store.js';
import type { MessageStateStore } from '../runtime/store.js';
import { getWatermarkKey } from './watermark.js';
import type { AccountRuntimeState, MessageCallback } from '../types/runtime.js';
import type { ZTMChatMessage } from '../types/messaging.js';

/**
 * Execute a single callback with semaphore control
 */
async function executeCallbackWithSemaphore(
  callback: MessageCallback,
  message: ZTMChatMessage,
  state: AccountRuntimeState
): Promise<boolean> {
  try {
    const executeFn = async () => {
      await callback(message);
    };

    if (state.callbackSemaphore) {
      await state.callbackSemaphore.execute(executeFn);
    } else {
      // Fallback for tests without semaphore
      await executeFn();
    }
    return true;
  } catch (error) {
    const errorMsg = extractErrorMessage(error);
    logger.error(`[${state.accountId}] Callback error: ${errorMsg}`);
    return false;
  }
}

/**
 * Notify all registered message callbacks for a received message
 *
 * This function:
 * 1. Updates the last inbound timestamp
 * 2. Executes all registered callbacks asynchronously with semaphore control
 * 3. Handles callback errors gracefully
 * 4. Updates watermark after successful processing
 *
 * @param state - Account runtime state containing callbacks
 * @param message - Normalized message to dispatch
 * @param watermarkStore - Optional watermark store for testing
 * @throws {Error} When callback execution fails (errors are logged, not thrown)
 *
 * @example
 * ```typescript
 * await notifyMessageCallbacks(state, message);
 * console.log("Message dispatched to callbacks");
 * ```
 *
 * @complexity O(n) - Where n is the number of callbacks (parallel execution)
 * @performance Uses Promise.all for concurrent callback execution with semaphore control
 * @since 2026.3.13
 * @see {@link getCallbackStats} For callback statistics
 * @see {@link ../watermark.ts} Watermark management
 */
export async function notifyMessageCallbacks(
  state: AccountRuntimeState,
  message: ZTMChatMessage,
  watermarkStore?: MessageStateStore
): Promise<void> {
  // Update last inbound timestamp
  state.lastInboundAt = new Date();

  // If no callbacks registered, skip processing
  if (state.messageCallbacks.size === 0) {
    return;
  }

  // Execute all callbacks concurrently with semaphore control
  const tasks: Promise<boolean>[] = [];
  for (const callback of state.messageCallbacks) {
    tasks.push(executeCallbackWithSemaphore(callback, message, state));
  }

  const results = await Promise.all(tasks);
  const successCount = results.filter(r => r).length;
  const errorCount = results.filter(r => !r).length;

  // Log summary if multiple callbacks
  if (state.messageCallbacks.size > 1) {
    logger.debug(`[${state.accountId}] Notified ${successCount} callbacks, ${errorCount} errors`);
  }

  const watermarkKey = getWatermarkKey({ type: 'message', data: message });
  if (successCount > 0) {
    // Use async version to ensure atomic watermark update in concurrent scenarios
    const store = watermarkStore ?? getAccountMessageStateStore(state.accountId);
    await store.setWatermarkAsync(state.accountId, watermarkKey, message.timestamp.getTime());
  } else {
    logger.warn(
      `[${state.accountId}] Message processing failed for ${watermarkKey}, watermark not updated`
    );
  }
}

/**
 * Get statistics about registered callbacks
 *
 * Provides insight into the current state of message callbacks for debugging
 * and monitoring purposes.
 *
 * @param state - Account runtime state containing callbacks
 * @returns Object with total and active callback counts
 *
 * @example
 * ```typescript
 * const stats = getCallbackStats(state);
 * console.log(`Active callbacks: ${stats.active}`);
 * ```
 *
 * @complexity O(1) - Constant time operation
 * @since 2026.3.13
 * @see {@link notifyMessageCallbacks} For callback execution
 */
export function getCallbackStats(state: AccountRuntimeState): {
  total: number;
  active: number;
} {
  return {
    total: state.messageCallbacks.size,
    active: state.messageCallbacks.size, // All callbacks are considered active
  };
}

/**
 * Check if any callbacks are registered
 *
 * Quick check to determine if there are any message handlers registered
 * for receiving incoming messages.
 *
 * @param state - Account runtime state containing callbacks
 * @returns true if at least one callback is registered, false otherwise
 *
 * @example
 * ```typescript
 * if (hasCallbacks(state)) {
 *   console.log("Ready to receive messages");
 * }
 * ```
 *
 * @complexity O(1) - Constant time operation
 * @since 2026.3.13
 * @see {@link clearCallbacks} For removing all callbacks
 */
export function hasCallbacks(state: AccountRuntimeState): boolean {
  return state.messageCallbacks.size > 0;
}

/**
 * Clear all callbacks
 *
 * Removes all registered message callbacks from the account state.
 * Useful during account cleanup or when shutting down the plugin.
 *
 * @param state - Account runtime state containing callbacks to clear
 *
 * @example
 * ```typescript
 * // Clear callbacks during account shutdown
 * clearCallbacks(state);
 * console.log("All callbacks cleared");
 * ```
 *
 * @complexity O(n) - Where n is the number of callbacks (clear operation)
 * @since 2026.3.13
 * @see {@link hasCallbacks} For checking if callbacks exist
 * @see {@link notifyMessageCallbacks} For callback execution
 */
export function clearCallbacks(state: AccountRuntimeState): void {
  const count = state.messageCallbacks.size;
  state.messageCallbacks.clear();
  logger.debug(`[${state.accountId}] Cleared ${count} callback(s)`);
}
