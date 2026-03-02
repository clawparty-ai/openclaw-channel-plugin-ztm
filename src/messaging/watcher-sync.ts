/**
 * Watcher Sync Operations
 * @module messaging/watcher-sync
 * Handles initial and full sync operations for message synchronization
 */

import { logger } from '../utils/logger.js';
import { processAndNotify } from './strategies/message-strategies.js';
import type { AccountRuntimeState } from '../types/runtime.js';
import { isSuccess } from '../types/common.js';
import type { ZTMChat } from '../types/api.js';

/**
 * Perform initial sync of all existing messages
 * @returns Array of chats for message processing
 */
export async function performInitialSync(
  state: AccountRuntimeState,
  storeAllowFrom: string[]
): Promise<ZTMChat[]> {
  if (!state.chatReader) return [];

  const chatsResult = await state.chatReader.getChats();
  if (!isSuccess(chatsResult)) {
    logger.warn(`[${state.accountId}] Initial read failed: ${chatsResult.error?.message}`);
    return [];
  }

  const chats = chatsResult.value as ZTMChat[];
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
 * Perform full sync of all peers to catch missed messages in append-only files
 */
export async function performFullSync(
  state: AccountRuntimeState,
  storeAllowFrom: string[]
): Promise<void> {
  if (!state.chatReader) return;

  const chatsResult = await state.chatReader.getChats();
  if (!isSuccess(chatsResult)) {
    logger.warn(`[${state.accountId}] Full sync failed: ${chatsResult.error?.message}`);
    return;
  }

  const chats = chatsResult.value as ZTMChat[];
  let processedCount = 0;

  for (const chat of chats) {
    if (await processAndNotify(chat, state, storeAllowFrom)) {
      processedCount++;
    }
  }

  if (processedCount > 0) {
    logger.debug(
      `[${state.accountId}] Full sync completed: ${processedCount} new messages from ${(chats as ZTMChat[]).length} peers`
    );
  }
}
