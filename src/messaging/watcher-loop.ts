/**
 * Watch Loop Management
 * @module messaging/watcher-loop
 * Handles watch loop lifecycle, error recovery, and message coordination
 */

import { logger } from '../utils/logger.js';
import { sanitizeForLog } from '../utils/log-sanitize.js';
import { getOrDefault } from '../utils/guards.js';
import type { PluginRuntime } from 'openclaw/plugin-sdk';
import { processAndNotify } from './strategies/message-strategies.js';
import type { MessagingContext } from './context.js';
import { Semaphore } from '../utils/concurrency.js';
import { getMessageSyncStart } from '../utils/sync-time.js';
import type { AccountRuntimeState } from '../types/runtime.js';
import type { ZTMMessage, WatchChangeItem } from '../types/api.js';
import { getAccountMessageStateStore } from '../runtime/store.js';
import type { MessageStateStore } from '../runtime/store.js';
import {
  FULL_SYNC_DELAY_MS,
  WATCH_INTERVAL_MS,
  MESSAGE_SEMAPHORE_PERMITS,
  MESSAGE_PROCESS_TIMEOUT_MS,
} from '../constants.js';

// NEW: Concurrency control constants
export const FULL_SYNC_MAX_WAIT_MS = 10000; // Max time fullSync waits for semaphore (10s)

// Result type for watch iteration
export type WatchResult =
  | { success: false; errorMessage: string }
  | { success: true; items: WatchChangeItem[] };

// Watch context for iteration execution
export interface WatchContext {
  state: AccountRuntimeState;
  rt: PluginRuntime;
  messageSemaphore: Semaphore;
  abortSignal?: AbortSignal;
}

/**
 * Controller for managing the watch loop lifecycle
 * Breaks down complex watch logic into smaller, testable methods
 */
export class WatchLoopController {
  private pendingIteration = false;
  private fullSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private messagesReceivedInCycle = false;
  private messageSemaphore: Semaphore;
  private retryCount = 0;

  // NEW: Operation tracking
  private operationStartTime = 0;

  // NEW: Operation semaphore for watchChanges vs fullSync mutual exclusion
  private operationSemaphore: Semaphore;

  constructor(
    private readonly state: AccountRuntimeState,
    private readonly rt: PluginRuntime,
    private readonly context: MessagingContext,
    private readonly abortSignal?: AbortSignal
  ) {
    this.messageSemaphore = new Semaphore(MESSAGE_SEMAPHORE_PERMITS);
    // NEW: Initialize operation semaphore with 1 permit for mutual exclusion
    this.operationSemaphore = new Semaphore(1);
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

    // NEW: Use tryAcquire for non-blocking check
    // tryAcquire() returns immediately - true if acquired, false if not
    const acquired = this.operationSemaphore.tryAcquire();
    if (!acquired) {
      logger.debug(`[${this.state.accountId}] Skipping iteration - fullSync in progress`);
      return;
    }

    this.operationStartTime = Date.now();
    this.pendingIteration = true;

    try {
      const loopStart = Date.now();

      // Execute the watch iteration
      const result = await this.executeWatch();

      // Handle watch errors
      if (this.isWatchError(result)) {
        this.handleWatchError(result.errorMessage);
        return;
      }

      // Handle successful iteration
      const elapsed = Date.now() - loopStart;
      await this.handleWatchSuccess(result, elapsed);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[${this.state.accountId}] Watch iteration error: ${errorMsg}`);
      this.handleWatchError(errorMsg);
    } finally {
      // NEW: Release operation semaphore - ONLY in finally block (prevents double release)
      this.pendingIteration = false;
      this.operationSemaphore.release();

      // Log operation duration
      const duration = Date.now() - this.operationStartTime;
      logger.debug(`[${this.state.accountId}] Iteration completed in ${duration}ms`);

      // Schedule next iteration
      this.scheduleNextIteration();
    }
  }

  /**
   * Handle successful watch iteration
   */
  private async handleWatchSuccess(
    result: { success: true; items: WatchChangeItem[] },
    _elapsed: number
  ): Promise<void> {
    // Process changed paths - use async version that actually fetches and processes messages
    this.messagesReceivedInCycle = await this.processWatchChanges(
      result.items,
      this.messagesReceivedInCycle
    );

    // Success - reset retry count
    this.retryCount = 0;
    // Note: Next iteration is scheduled in finally block
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

    const changedResult = await this.state.chatReader.watchChanges();

    if (!changedResult.ok) {
      return { success: false, errorMessage: changedResult.error?.message ?? 'Watch failed' };
    }

    return { success: true, items: getOrDefault(changedResult.value as WatchChangeItem[], []) };
  }

  /**
   * Type guard for watch error results
   */
  private isWatchError(result: WatchResult): result is { success: false; errorMessage: string } {
    return !result.success;
  }

  /**
   * Handle watch iteration errors with Fibonacci backoff
   */
  private handleWatchError(errorMessage: string): void {
    this.retryCount++;
    // Fibonacci backoff: 1s, 1s, 2s, 3s, 5s, 8s... max 30s
    const delayMs = this.getFibonacciDelay(this.retryCount);
    logger.warn(
      `[${this.state.accountId}] Watch error (${this.retryCount}): ${errorMessage}. ` +
        `Retrying in ${delayMs}ms`
    );
    this.scheduleNextIteration(delayMs);
  }

  /**
   * Calculate Fibonacci-based delay
   * Sequence: 1s, 1s, 2s, 3s, 5s, 8s... capped at 30s
   */
  private getFibonacciDelay(count: number): number {
    if (count <= 0) return WATCH_INTERVAL_MS;
    if (count === 1) return WATCH_INTERVAL_MS;
    // Fibonacci: 1, 1, 2, 3, 5, 8...
    let prev = 1,
      curr = 1;
    for (let i = 2; i < count; i++) {
      [prev, curr] = [curr, prev + curr];
    }
    // Cap at 30 seconds for watch error recovery
    return Math.min(curr * WATCH_INTERVAL_MS, 30000);
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
  private async processWatchChanges(
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

    return processWatchChanges(
      {
        state: this.state,
        rt: this.rt,
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
   * Execute full sync with shared semaphore and timeout
   */
  private async executeFullSyncWithMetadata(storeAllowFrom: string[]): Promise<void> {
    logger.debug(`[${this.state.accountId}] Starting full sync with semaphore`);

    // NEW: Use acquire with timeout
    const acquired = await this.operationSemaphore.acquire(FULL_SYNC_MAX_WAIT_MS);

    if (!acquired) {
      logger.warn(
        `[${this.state.accountId}] Full sync timeout waiting for semaphore (${FULL_SYNC_MAX_WAIT_MS}ms), skipping`
      );
      return;
    }

    this.operationStartTime = Date.now();

    try {
      logger.debug(`[${this.state.accountId}] Full sync acquired semaphore, executing`);
      // Import dynamically to avoid circular dependency
      const { performFullSync } = await import('./watcher-sync.js');
      await performFullSync(this.state, storeAllowFrom);
    } catch (error) {
      // NEW: Proper error handling - log but don't crash
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[${this.state.accountId}] Full sync failed: ${errorMsg}`);
    } finally {
      this.operationSemaphore.release();
      logger.debug(`[${this.state.accountId}] Full sync released semaphore`);

      // Log operation duration
      const duration = Date.now() - this.operationStartTime;
      logger.debug(`[${this.state.accountId}] Full sync completed in ${duration}ms`);
    }
  }
}

/**
 * Start the watch loop that monitors for changes
 */
export function startWatchLoop(
  state: AccountRuntimeState,
  rt: PluginRuntime,
  context: MessagingContext,
  abortSignal?: AbortSignal
): void {
  const controller = new WatchLoopController(state, rt, context, abortSignal);
  controller.start();
}

/**
 * Process all changed items and handle state updates
 *
 * @returns true if any messages were actually processed
 */
export async function processWatchChanges(
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
          .catch((err: unknown) => {
            const errorMsg = err instanceof Error ? err.message : String(err);
            logger.error(`[${state.accountId}] Timeout processing peer message: ${errorMsg}`);
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
          .catch((err: unknown) => {
            const errorMsg = err instanceof Error ? err.message : String(err);
            logger.error(`[${state.accountId}] Timeout processing group message: ${errorMsg}`);
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
export async function processChangedPeer(
  state: AccountRuntimeState,
  rt: PluginRuntime,
  peer: string,
  storeAllowFrom: string[],
  watermarkStore?: MessageStateStore
): Promise<void> {
  if (!state.chatReader) return;

  // Get watermark and calculate sync start (limit to recent messages on first sync)
  const store = watermarkStore ?? getAccountMessageStateStore(state.accountId);
  const watermark = store.getWatermark(state.accountId, peer);
  const since = getMessageSyncStart(watermark);
  const messagesResult = await state.chatReader.getPeerMessages(peer, since);

  if (!messagesResult.ok) {
    const safePeer = sanitizeForLog(peer);
    logger.warn(
      `[${state.accountId}] Failed to get messages from peer "${safePeer}": ${messagesResult.error?.message ?? 'Unknown error'}`
    );
    return;
  }

  const messages = getOrDefault(messagesResult.value as ZTMMessage[], []);
  const safePeer = sanitizeForLog(peer);
  const hasNoHistory = watermark === 0;
  logger.debug(
    `[${state.accountId}] Processing ${messages.length} messages from peer "${safePeer}" since=${since}${hasNoHistory ? ' (no history)' : ''}`
  );

  // Use unified message processing logic
  // Note: handlePeerPolicyCheck is already called inside processAndNotify for peer messages
  for (const msg of messages as ZTMMessage[]) {
    const chat = { peer, time: msg.time, updated: msg.time, latest: msg };
    await processAndNotify(chat, state, storeAllowFrom);
  }
}

/**
 * Process all messages for a specific group
 */
export async function processChangedGroup(
  state: AccountRuntimeState,
  rt: PluginRuntime,
  creator: string,
  group: string,
  name: string | undefined,
  storeAllowFrom: string[],
  watermarkStore?: MessageStateStore
): Promise<void> {
  if (!state.chatReader) return;

  const groupKey = `group:${creator}/${group}`;
  const store = watermarkStore ?? getAccountMessageStateStore(state.accountId);
  const watermark = store.getWatermark(state.accountId, groupKey);
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

  const messages = getOrDefault(messagesResult.value as ZTMMessage[], []);

  // Use unified message processing logic
  for (const msg of messages as ZTMMessage[]) {
    const chat = { creator, group, latest: msg, time: msg.time, updated: msg.time };
    await processAndNotify(chat, state, storeAllowFrom);
  }
}
