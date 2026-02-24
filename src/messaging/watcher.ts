/**
 * Message Watching and Polling
 * @module messaging/watcher
 * Monitors for new messages via Watch mechanism with fallback to polling
 */

import { logger } from '../utils/logger.js';
import { sanitizeForLog } from '../utils/log-sanitize.js';
import { getOrDefault } from '../utils/guards.js';
import { container, DEPENDENCIES } from '../di/index.js';
import type { PluginRuntime } from 'openclaw/plugin-sdk';
import { startPollingWatcher } from './polling.js';
import { processAndNotify } from './strategies/message-strategies.js';
import type { MessagingContext } from './context.js';
import { handlePeerPolicyCheck } from './message-processor-helpers.js';
import { Semaphore } from '../utils/concurrency.js';
import { getMessageSyncStart } from '../utils/sync-time.js';
import type { AccountRuntimeState } from '../types/runtime.js';
import { isSuccess } from '../types/common.js';
import type { ZTMChat, WatchChangeItem } from '../types/api.js';
import { getAccountMessageStateStore } from '../runtime/store.js';
import {
  FULL_SYNC_DELAY_MS,
  WATCH_INTERVAL_MS,
  WATCH_ERROR_THRESHOLD,
  MESSAGE_SEMAPHORE_PERMITS,
  MESSAGE_PROCESS_TIMEOUT_MS,
} from '../constants.js';

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

  // Step 4: Initial sync - read all existing messages
  // Get chats once and reuse for pairing requests (avoid duplicate API call)
  const chats = await performInitialSync(state, initAllowFrom);

  // Step 5: Handle pairing requests from initial sync (reuses chats from initialSync)
  await handleInitialPairingRequests(state, initAllowFrom, chats);

  // Step 6: Start watch loop
  startWatchLoop(state, rt, messagePath, context, abortSignal);
}

// processAndNotify is now imported from chat-processor.ts

/**
 * Perform initial sync of all existing messages
 * Returns the chats for reuse by handleInitialPairingRequests
 */
async function performInitialSync(
  state: AccountRuntimeState,
  storeAllowFrom: string[]
): Promise<ZTMChat[]> {
  if (!state.chatReader) return [];

  const chatsResult = await state.chatReader.getChats();
  if (!isSuccess(chatsResult)) {
    logger.warn(`[${state.accountId}] Initial read failed: ${chatsResult.error?.message}`);
    return [];
  }

  const chats = chatsResult.value;
  let processedCount = 0;

  for (const chat of chats) {
    if (await processAndNotify(chat, state, storeAllowFrom)) {
      processedCount++;
    }
  }

  logger.info(
    `[${state.accountId}] Initial sync: ${chats.length} chats, ${processedCount} messages processed`
  );

  return chats;
}

/**
 * Handle pairing requests from initial sync
 * Reuses chats from performInitialSync to avoid duplicate API call
 */
async function handleInitialPairingRequests(
  state: AccountRuntimeState,
  storeAllowFrom: string[],
  chats: ZTMChat[]
): Promise<void> {
  for (const chat of chats) {
    if (chat.peer && chat.peer !== state.config.username) {
      await handlePeerPolicyCheck(chat.peer, state, storeAllowFrom, 'Initial chat request');
    }
  }
}

/**
 * Controller for managing the watch loop lifecycle
 * Breaks down complex watch logic into smaller, testable methods
 */

// Result type for watch iteration
type WatchResult =
  | { success: false; errorMessage: string }
  | { success: true; items: WatchChangeItem[] };

class WatchLoopController {
  private pendingIteration = false;
  private lastMessageTime = Date.now();
  private fullSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private messagesReceivedInCycle = false;
  private messageSemaphore: Semaphore;

  constructor(
    private readonly state: AccountRuntimeState,
    private readonly rt: PluginRuntime,
    private readonly messagePath: string,
    private readonly context: MessagingContext,
    private readonly abortSignal?: AbortSignal
  ) {
    this.messageSemaphore = new Semaphore(MESSAGE_SEMAPHORE_PERMITS);
  }

  /**
   * Start the watch loop
   */
  start(): void {
    if (this.abortSignal?.aborted) return;
    logger.debug(`[${this.state.accountId}] Starting watch loop`);
    this.scheduleNextIteration();
  }

  /**
   * Schedule the next watch iteration with proper timing
   */
  private scheduleNextIteration(delayMs?: number): void {
    if (this.abortSignal?.aborted) return;
    setTimeout(() => this.runIteration(), delayMs ?? WATCH_INTERVAL_MS);
  }

  /**
   * Run a single watch iteration with proper error handling and scheduling
   */
  private async runIteration(): Promise<void> {
    // Stop gracefully if aborted
    if (this.abortSignal?.aborted) return;

    // Skip if an iteration is already in progress
    if (this.pendingIteration) {
      return;
    }
    this.pendingIteration = true;

    try {
      const loopStart = Date.now();

      // Execute the watch iteration
      const result = await this.executeWatch();

      // Handle watch errors
      if (this.isWatchError(result)) {
        this.handleWatchError(result.errorMessage);
        const elapsed = Date.now() - loopStart;
        this.clearPendingFlag();
        this.scheduleNextIteration(Math.max(0, WATCH_INTERVAL_MS - elapsed));
        return;
      }

      // Process changed paths
      this.messagesReceivedInCycle = await this.processChangedPaths(
        result.items,
        this.messagesReceivedInCycle
      );

      // Success - reset error count
      this.state.watchErrorCount = 0;
      const elapsed = Date.now() - loopStart;
      this.clearPendingFlag();

      // Schedule next iteration with proper delay
      this.scheduleNextIteration(Math.max(0, WATCH_INTERVAL_MS - elapsed));
    } catch (error) {
      this.handleUnexpectedError(error);
    } finally {
      // Ensure flag is cleared even on early returns
      this.clearPendingFlag();
    }
  }

  /**
   * Clear the pending iteration flag
   */
  private clearPendingFlag(): void {
    this.pendingIteration = false;
  }

  /**
   * Execute a single watch iteration and return changed items
   */
  private async executeWatch(): Promise<WatchResult> {
    if (!this.state.chatReader || !this.state.config) {
      return { success: false, errorMessage: 'API client or config not available' };
    }

    const changedResult = await this.state.chatReader.watchChanges(this.messagePath);

    if (!changedResult.ok) {
      return { success: false, errorMessage: changedResult.error?.message ?? 'Watch failed' };
    }

    return { success: true, items: getOrDefault(changedResult.value, []) };
  }

  /**
   * Type guard for watch error results
   */
  private isWatchError(result: WatchResult): result is { success: false; errorMessage: string } {
    return !result.success;
  }

  /**
   * Handle watch iteration errors with polling fallback
   */
  private handleWatchError(errorMessage: string): void {
    this.state.watchErrorCount++;
    logger.warn(
      `[${this.state.accountId}] Watch error (${this.state.watchErrorCount}): ${errorMessage}`
    );

    // Fallback to polling after too many errors
    if (this.state.watchErrorCount > WATCH_ERROR_THRESHOLD) {
      logger.warn(`[${this.state.accountId}] Too many watch errors, falling back to polling`);
      this.state.watchErrorCount = 0;
      startPollingWatcher(this.state, this.context, this.abortSignal);
    }
  }

  /**
   * Handle unexpected errors in watch loop
   */
  private handleUnexpectedError(error: unknown): void {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[${this.state.accountId}] Unexpected error in watch loop: ${errorMsg}`);
    this.clearPendingFlag();
    // Restart the loop after a brief delay to prevent tight error loop
    this.scheduleNextIteration(WATCH_INTERVAL_MS);
  }

  /**
   * Process changed paths from watch result
   */
  private async processChangedPaths(
    items: WatchChangeItem[],
    previousMessagesReceived: boolean
  ): Promise<boolean> {
    // Monitor semaphore queue health
    const queuedWaiters = this.messageSemaphore.queuedWaiters();
    if (queuedWaiters > 3) {
      logger.warn(
        `[${this.state.accountId}] High semaphore queue: ${queuedWaiters} waiters pending`
      );
    }

    return processChangedPaths(
      {
        state: this.state,
        rt: this.rt,
        messagePath: this.messagePath,
        messageSemaphore: this.messageSemaphore,
        abortSignal: this.abortSignal,
      },
      items,
      previousMessagesReceived,
      storeAllowFrom => this.scheduleFullSync(storeAllowFrom),
      this.context
    );
  }

  /**
   * Schedule a delayed full sync after inactivity
   */
  private scheduleFullSync(storeAllowFrom: string[]): void {
    if (this.fullSyncTimer) {
      clearTimeout(this.fullSyncTimer);
    }
    this.fullSyncTimer = setTimeout(
      () => this.executeFullSyncWithMetadata(storeAllowFrom),
      FULL_SYNC_DELAY_MS
    );
  }

  /**
   * Execute full sync
   */
  private async executeFullSyncWithMetadata(storeAllowFrom: string[]): Promise<void> {
    logger.debug(`[${this.state.accountId}] Performing delayed full sync after inactivity`);
    await performFullSync(this.state, storeAllowFrom);
  }
}

// Watch context for iteration execution
interface WatchContext {
  state: AccountRuntimeState;
  rt: PluginRuntime;
  messagePath: string;
  messageSemaphore: Semaphore;
  abortSignal?: AbortSignal;
}

/**
 * Start the watch loop that monitors for changes
 */
function startWatchLoop(
  state: AccountRuntimeState,
  rt: PluginRuntime,
  messagePath: string,
  context: MessagingContext,
  abortSignal?: AbortSignal
): void {
  const controller = new WatchLoopController(state, rt, messagePath, context, abortSignal);
  controller.start();
}

/**
 * Process all changed items and handle state updates
 *
 * @returns true if any messages were actually processed
 */
async function processChangedPaths(
  ctx: WatchContext,
  changedItems: WatchChangeItem[],
  messagesReceivedInCycle: boolean,
  scheduleFullSync: (storeAllowFrom: string[]) => void,
  messagingContext: MessagingContext
): Promise<boolean> {
  const { state, rt, messageSemaphore } = ctx;

  if (changedItems.length === 0) {
    // No items to process - this could be the transition to idle state
    // If we were receiving messages before, schedule a final full sync
    if (messagesReceivedInCycle) {
      // Use cached allowFrom for the final sync
      const loopStoreAllowFrom = await messagingContext.allowFromRepo.getAllowFrom(
        state.accountId,
        rt
      );
      const effectiveAllowFrom = getOrDefault(loopStoreAllowFrom, []);
      scheduleFullSync(effectiveAllowFrom);
    }
    return false;
  }

  // Single-pass classification instead of multiple filter() calls
  const peerItems: typeof changedItems = [];
  const groupItems: typeof changedItems = [];
  for (const item of changedItems) {
    if (item.type === 'peer') {
      peerItems.push(item);
    } else if (item.type === 'group') {
      groupItems.push(item);
    }
  }

  logger.debug(
    `[${state.accountId}] Processing ${peerItems.length} peers, ${groupItems.length} groups with new messages`
  );

  // Use cached allowFrom to avoid redundant async calls every watch cycle
  const loopStoreAllowFrom = await messagingContext.allowFromRepo.getAllowFrom(state.accountId, rt);
  // If store read fails, use cached value or empty array
  const effectiveAllowFrom = getOrDefault(loopStoreAllowFrom, []);

  const tasks: Promise<void>[] = [];

  for (const item of peerItems) {
    if (item.peer) {
      tasks.push(
        messageSemaphore
          .execute(
            () => processChangedPeer(state, rt, item.peer!, effectiveAllowFrom),
            MESSAGE_PROCESS_TIMEOUT_MS
          )
          .catch(err => {
            logger.error(`[${state.accountId}] Timeout processing peer message: ${err}`);
            throw err; // Re-throw to propagate error to caller
          })
      );
    }
  }

  for (const item of groupItems) {
    if (item.creator && item.group) {
      tasks.push(
        messageSemaphore
          .execute(
            () =>
              processChangedGroup(
                state,
                rt,
                item.creator!,
                item.group!,
                item.name,
                effectiveAllowFrom
              ),
            MESSAGE_PROCESS_TIMEOUT_MS
          )
          .catch(err => {
            logger.error(`[${state.accountId}] Timeout processing group message: ${err}`);
            throw err; // Re-throw to propagate error to caller
          })
      );
    }
  }

  await Promise.all(tasks);

  return true;
}

/**
 * Process all messages for a specific peer
 */
async function processChangedPeer(
  state: AccountRuntimeState,
  rt: PluginRuntime,
  peer: string,
  storeAllowFrom: string[]
): Promise<void> {
  if (!state.chatReader) return;

  // Get watermark and calculate sync start (limit to recent messages on first sync)
  const watermark = getAccountMessageStateStore(state.accountId).getWatermark(
    state.accountId,
    peer
  );
  const since = getMessageSyncStart(watermark);
  const messagesResult = await state.chatReader.getPeerMessages(peer, since);

  if (!messagesResult.ok) {
    const safePeer = sanitizeForLog(peer);
    logger.warn(
      `[${state.accountId}] Failed to get messages from peer "${safePeer}": ${messagesResult.error?.message ?? 'Unknown error'}`
    );
    return;
  }

  const messages = getOrDefault(messagesResult.value, []);
  const safePeer = sanitizeForLog(peer);
  const hasNoHistory = watermark === 0;
  logger.debug(
    `[${state.accountId}] Processing ${messages.length} messages from peer "${safePeer}" since=${since}${hasNoHistory ? ' (no history)' : ''}`
  );

  // Use unified message processing logic
  for (const msg of messages) {
    const chat = { peer, time: msg.time, updated: msg.time, latest: msg };
    await processAndNotify(chat, state, storeAllowFrom);
  }

  // Handle DM policy check for pairing
  await handlePeerPolicyCheck(peer, state, storeAllowFrom, 'New message');
}

/**
 * Process all messages for a specific group
 */
async function processChangedGroup(
  state: AccountRuntimeState,
  rt: PluginRuntime,
  creator: string,
  group: string,
  name: string | undefined,
  storeAllowFrom: string[]
): Promise<void> {
  if (!state.chatReader) return;

  const groupKey = `group:${creator}/${group}`;
  const watermark = getAccountMessageStateStore(state.accountId).getWatermark(
    state.accountId,
    groupKey
  );
  const since = getMessageSyncStart(watermark);
  const safeGroupKey = sanitizeForLog(`${creator}/${group}`);
  const hasNoHistory = watermark === 0;
  logger.debug(
    `[${state.accountId}] Processing group messages from "${safeGroupKey}" since=${since}${hasNoHistory ? ' (no history)' : ''}`
  );

  const messagesResult = await state.chatReader.getGroupMessages(creator, group, since);

  if (!messagesResult.ok) {
    logger.warn(
      `[${state.accountId}] Failed to get messages from group "${safeGroupKey}": ${messagesResult.error?.message ?? 'Unknown error'}`
    );
    return;
  }

  const messages = getOrDefault(messagesResult.value, []);

  // Use unified message processing logic
  for (const msg of messages) {
    const chat = { creator, group, latest: msg, time: msg.time, updated: msg.time };
    await processAndNotify(chat, state, storeAllowFrom);
  }
}

/**
 * Perform full sync of all peers to catch missed messages in append-only files
 */
async function performFullSync(
  state: AccountRuntimeState,
  storeAllowFrom: string[]
): Promise<void> {
  if (!state.chatReader) return;

  const chatsResult = await state.chatReader.getChats();
  if (!isSuccess(chatsResult)) {
    logger.warn(`[${state.accountId}] Full sync failed: ${chatsResult.error?.message}`);
    return;
  }

  const chats = chatsResult.value;
  let processedCount = 0;

  for (const chat of chats) {
    if (await processAndNotify(chat, state, storeAllowFrom)) {
      processedCount++;
    }
  }

  if (processedCount > 0) {
    logger.debug(
      `[${state.accountId}] Full sync completed: ${processedCount} new messages from ${chats.length} peers`
    );
  }
}
