// Message watching and polling for ZTM Chat
// Monitors for new messages via Watch mechanism with fallback to polling

import { logger } from '../utils/logger.js';
import { sanitizeForLog } from '../utils/log-sanitize.js';
import { getOrDefault } from '../utils/guards.js';
import { container, DEPENDENCIES } from '../di/index.js';
import type { PluginRuntime } from 'openclaw/plugin-sdk';
import { startPollingWatcher } from './polling.js';
import { processAndNotifyChat } from './chat-processor.js';
import {
  processAndNotifyPeerMessages,
  processAndNotifyGroupMessages,
  handlePeerPolicyCheck,
} from './message-processor-helpers.js';
import { Semaphore } from '../utils/concurrency.js';
import type { AccountRuntimeState } from '../types/runtime.js';
import { isSuccess } from '../types/common.js';
import type { ZTMChat, WatchChangeItem } from '../types/api.js';
import {
  FULL_SYNC_DELAY_MS,
  WATCH_INTERVAL_MS,
  MESSAGE_SEMAPHORE_PERMITS,
  MESSAGE_PROCESS_TIMEOUT_MS,
} from '../constants.js';

/**
 * Start message watcher using ZTM's Watch mechanism
 *
 * The watcher:
 * 1. Seeds API client with persisted file timestamps
 * 2. Performs initial sync of all existing messages
 * 3. Starts a watch loop that polls for changes every 1 second
 * 4. Falls back to polling if watch errors accumulate
 *
 * @param state - Account runtime state with config and API client
 */
export async function startMessageWatcher(state: AccountRuntimeState): Promise<void> {
  const { apiClient } = state;
  if (!apiClient) return;

  const messagePath = '/apps/ztm/chat/shared/';

  // Step 1: Seed the API client's lastSeenTimes from persisted state
  await seedFileMetadata(state);

  // Step 2: Get initial allowFrom store (uses cache)
  const rt = container.get(DEPENDENCIES.RUNTIME).get();
  const storeAllowFrom = await container
    .get(DEPENDENCIES.ALLOW_FROM_REPO)
    .getAllowFrom(state.accountId, rt);
  // If store read fails during init, use empty array to allow basic functionality
  const initAllowFrom = getOrDefault(storeAllowFrom, []);

  // Step 4: Initial sync - read all existing messages
  // Get chats once and reuse for pairing requests (avoid duplicate API call)
  const chats = await performInitialSync(state, initAllowFrom);

  // Step 5: Handle pairing requests from initial sync (reuses chats from initialSync)
  await handleInitialPairingRequests(state, initAllowFrom, chats);

  // Step 6: Start watch loop
  startWatchLoop(state, rt, messagePath);
}

/**
 * Seed API client with persisted file metadata
 */
async function seedFileMetadata(state: AccountRuntimeState): Promise<void> {
  if (!state.apiClient) return;

  const persistedMetadata = container
    .get(DEPENDENCIES.MESSAGE_STATE_REPO)
    .getFileMetadata(state.accountId);
  if (Object.keys(persistedMetadata).length > 0) {
    state.apiClient.seedFileMetadata(persistedMetadata);
    logger.info(
      `[${state.accountId}] Seeded ${Object.keys(persistedMetadata).length} file metadata from persisted state`
    );
  }
}

// processAndNotifyChat is now imported from chat-processor.ts

/**
 * Perform initial sync of all existing messages
 * Returns the chats for reuse by handleInitialPairingRequests
 */
async function performInitialSync(
  state: AccountRuntimeState,
  storeAllowFrom: string[]
): Promise<ZTMChat[]> {
  if (!state.apiClient) return [];

  const chatsResult = await state.apiClient.getChats();
  if (!isSuccess(chatsResult)) {
    logger.warn(`[${state.accountId}] Initial read failed: ${chatsResult.error?.message}`);
    return [];
  }

  const chats = chatsResult.value;
  let processedCount = 0;

  for (const chat of chats) {
    if (await processAndNotifyChat(chat, state, storeAllowFrom)) {
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
    private readonly messagePath: string
  ) {
    this.messageSemaphore = new Semaphore(MESSAGE_SEMAPHORE_PERMITS);
  }

  /**
   * Start the watch loop
   */
  start(): void {
    logger.debug(`[${this.state.accountId}] Starting watch loop`);
    this.scheduleNextIteration();
  }

  /**
   * Schedule the next watch iteration with proper timing
   */
  private scheduleNextIteration(delayMs?: number): void {
    setTimeout(() => this.runIteration(), delayMs ?? WATCH_INTERVAL_MS);
  }

  /**
   * Run a single watch iteration with proper error handling and scheduling
   */
  private async runIteration(): Promise<void> {
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
    if (!this.state.apiClient || !this.state.config) {
      return { success: false, errorMessage: 'API client or config not available' };
    }

    const changedResult = await this.state.apiClient.watchChanges(this.messagePath);

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
    if (this.state.watchErrorCount > 5) {
      logger.warn(`[${this.state.accountId}] Too many watch errors, falling back to polling`);
      this.state.watchErrorCount = 0;
      startPollingWatcher(this.state);
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
    return processChangedPaths(
      {
        state: this.state,
        rt: this.rt,
        messagePath: this.messagePath,
        messageSemaphore: this.messageSemaphore,
      },
      items,
      previousMessagesReceived,
      storeAllowFrom => this.scheduleFullSync(storeAllowFrom)
    );
  }

  /**
   * Schedule a delayed full sync after inactivity
   */
  private scheduleFullSync(storeAllowFrom: string[]): void {
    if (this.fullSyncTimer) {
      clearTimeout(this.fullSyncTimer);
    }
    this.fullSyncTimer = setTimeout(async () => {
      logger.debug(`[${this.state.accountId}] Performing delayed full sync after inactivity`);
      await performFullSync(this.state, storeAllowFrom);
      if (this.state.apiClient) {
        container
          .get(DEPENDENCIES.MESSAGE_STATE_REPO)
          .setFileMetadataBulk(this.state.accountId, this.state.apiClient.exportFileMetadata());
      }
    }, FULL_SYNC_DELAY_MS);
  }
}

// Watch context for iteration execution
interface WatchContext {
  state: AccountRuntimeState;
  rt: PluginRuntime;
  messagePath: string;
  messageSemaphore: Semaphore;
}

/**
 * Start the watch loop that monitors for changes
 */
function startWatchLoop(state: AccountRuntimeState, rt: PluginRuntime, messagePath: string): void {
  const controller = new WatchLoopController(state, rt, messagePath);
  controller.start();
}

/**
 * Process all changed items and handle state updates
 */
async function processChangedPaths(
  ctx: WatchContext,
  changedItems: WatchChangeItem[],
  messagesReceivedInCycle: boolean,
  scheduleFullSync: (storeAllowFrom: string[]) => void
): Promise<boolean> {
  const { state, rt, messageSemaphore } = ctx;

  if (changedItems.length === 0) {
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
  const loopStoreAllowFrom = await container
    .get(DEPENDENCIES.ALLOW_FROM_REPO)
    .getAllowFrom(state.accountId, rt);
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
          })
      );
    }
  }

  await Promise.all(tasks);

  scheduleFullSync(effectiveAllowFrom);
  if (state.apiClient) {
    container
      .get(DEPENDENCIES.MESSAGE_STATE_REPO)
      .setFileMetadataBulk(state.accountId, state.apiClient.exportFileMetadata());
  }

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
  if (!state.apiClient) return;

  const messagesResult = await state.apiClient.getPeerMessages(peer);

  if (!messagesResult.ok) {
    const safePeer = sanitizeForLog(peer);
    logger.warn(
      `[${state.accountId}] Failed to get messages from peer "${safePeer}": ${messagesResult.error?.message ?? 'Unknown error'}`
    );
    return;
  }

  const messages = getOrDefault(messagesResult.value, []);
  const safePeer = sanitizeForLog(peer);
  logger.debug(
    `[${state.accountId}] Processing ${messages.length} messages from peer "${safePeer}"`
  );

  // Use shared message processing logic
  await processAndNotifyPeerMessages(messages, state, storeAllowFrom);

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
  if (!state.apiClient) return;

  const groupKey = `${creator}/${group}`;
  const safeGroupKey = sanitizeForLog(groupKey);
  logger.debug(`[${state.accountId}] Processing group messages from "${safeGroupKey}"`);

  const messagesResult = await state.apiClient.getGroupMessages(creator, group);

  if (!messagesResult.ok) {
    logger.warn(
      `[${state.accountId}] Failed to get messages from group "${safeGroupKey}": ${messagesResult.error?.message ?? 'Unknown error'}`
    );
    return;
  }

  const messages = getOrDefault(messagesResult.value, []);

  // Use shared message processing logic
  processAndNotifyGroupMessages(messages, state, storeAllowFrom, { creator, group }, name);
}

/**
 * Perform full sync of all peers to catch missed messages in append-only files
 */
async function performFullSync(
  state: AccountRuntimeState,
  storeAllowFrom: string[]
): Promise<void> {
  if (!state.apiClient) return;

  const chatsResult = await state.apiClient.getChats();
  if (!isSuccess(chatsResult)) {
    logger.warn(`[${state.accountId}] Full sync failed: ${chatsResult.error?.message}`);
    return;
  }

  const chats = chatsResult.value;
  let processedCount = 0;

  for (const chat of chats) {
    if (await processAndNotifyChat(chat, state, storeAllowFrom)) {
      processedCount++;
    }
  }

  if (processedCount > 0) {
    logger.debug(
      `[${state.accountId}] Full sync completed: ${processedCount} new messages from ${chats.length} peers`
    );
  }
}
