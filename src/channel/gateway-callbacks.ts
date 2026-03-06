/**
 * Account callback setup for ZTM Chat gateway
 *
 * Extracted from gateway.ts to break circular dependency with gateway-steps.ts
 */

import { container, DEPENDENCIES } from '../di/index.js';
import { createMessageCallback } from './message-dispatcher.js';
import { startMessageWatcher } from '../messaging/watcher.js';
import type { ZTMChatConfig } from '../types/config.js';
import type { AccountRuntimeState } from '../types/runtime.js';
import type { ZTMChatMessage } from '../types/messaging.js';

/**
 * Setup message callbacks for an account
 *
 * This function:
 * 1. Creates message callback functions for incoming messages
 * 2. Starts the message watcher loop
 * 3. Returns the callback for registration
 *
 * @param accountId - Account identifier
 * @param config - Account configuration
 * @param state - Runtime state to populate with callbacks
 * @param ctx - Logging and config context
 * @returns Object containing the message callback
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
  const messagingContext = container.get(DEPENDENCIES.MESSAGING_CONTEXT);
  await startMessageWatcher(state, messagingContext, watchAbortController.signal);

  return { messageCallback };
}
