/**
 * Message Watching and Polling
 * @module messaging/watcher
 * Monitors for new messages via Watch mechanism with fallback to polling
 *
 * This file serves as the entry point and re-exports from specialized modules:
 * - watcher-loop.ts: Watch loop lifecycle, error recovery
 * - watcher-sync.ts: Initial and full sync operations
 */

import { getOrDefault } from '../utils/guards.js';
import { container, DEPENDENCIES } from '../di/index.js';
import type { MessagingContext } from './context.js';
import type { AccountRuntimeState } from '../types/runtime.js';
import { startWatchLoop } from './watcher-loop.js';
import { performInitialSync } from './watcher-sync.js';

/**
 * Start message watcher using ZTM's Watch mechanism.
 *
 * The watcher:
 * 1. Seeds API client with persisted file timestamps
 * 2. Performs initial sync of all existing messages
 * 3. Starts a watch loop that polls for changes every 1 second
 * 4. Falls back to polling if watch errors accumulate
 *
 * @param state - Account runtime state with config and API client
 * @param context - Messaging context with repository dependencies
 * @param abortSignal - Optional abort signal for graceful shutdown
 * @returns Promise that resolves when the watcher starts
 */
export async function startMessageWatcher(
  state: AccountRuntimeState,
  context: MessagingContext,
  abortSignal?: AbortSignal
): Promise<void> {
  const { chatReader } = state;
  if (!chatReader) return;

  const messagePath = '/apps/ztm/chat/shared/';

  // Step 1: Get initial allowFrom store (uses cache)
  const rt = container.get(DEPENDENCIES.RUNTIME).get();
  const storeAllowFrom = await context.allowFromRepo.getAllowFrom(state.accountId, rt);
  // If store read fails during init, use empty array to allow basic functionality
  const initAllowFrom = getOrDefault(storeAllowFrom, []);

  // Step 2: Initial sync - read all existing messages
  await performInitialSync(state, initAllowFrom);

  // Step 3: Start watch loop
  // Note: pairing requests are only triggered when users send new messages in watch loop
  startWatchLoop(state, rt, messagePath, context, abortSignal);
}

// Re-export from watcher-loop.ts for backward compatibility
export {
  WatchLoopController,
  startWatchLoop,
  processChangedPaths,
  processChangedPeer,
  processChangedGroup,
} from './watcher-loop.js';
export type { WatchContext, WatchResult } from './watcher-loop.js';

// Re-export from watcher-sync.ts for backward compatibility
export { performInitialSync, performFullSync } from './watcher-sync.js';
