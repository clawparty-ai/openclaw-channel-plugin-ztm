/**
 * Watcher Sync Operations
 * @module messaging/watcher-sync
 * Handles initial and full sync operations for message synchronization
 */

import { logger } from '../utils/logger.js';
import { processAndNotify } from './strategies/message-strategies.js';
import type { AccountRuntimeState } from '../types/runtime.js';
import { isSuccess } from '../types/common.js';
import type { ZTMChat, ZTMMessage } from '../types/api.js';
import { isGroupChat } from './utils.js';
import { getMessageSyncStart } from '../utils/sync-time.js';
import { getAccountMessageStateStore } from '../runtime/store.js';
import { sanitizeForLog } from '../utils/log-sanitize.js';
import { getOrDefault } from '../utils/guards.js';

/**
 * Fetch all messages for a chat since watermark and process each one.
 * This replaces the old pattern of only processing chat.latest,
 * which caused messages to be skipped when multiple arrived between syncs.
 */
async function fetchAndProcessAllMessages(
  chat: ZTMChat,
  state: AccountRuntimeState,
  storeAllowFrom: string[]
): Promise<number> {
  if (!state.chatReader) return 0;

  const store = getAccountMessageStateStore(state.accountId);
  let processedCount = 0;

  if (isGroupChat(chat)) {
    const creator = chat.creator!;
    const group = chat.group!;
    const groupKey = `group:${creator}/${group}`;
    const watermark = store.getWatermark(state.accountId, groupKey);
    const since = getMessageSyncStart(watermark);

    const messagesResult = await state.chatReader.getGroupMessages(creator, group, since);
    if (!messagesResult.ok) {
      const safeGroupKey = sanitizeForLog(`${creator}/${group}`);
      logger.warn(
        `[${state.accountId}] Sync: Failed to get messages from group "${safeGroupKey}": ${messagesResult.error?.message ?? 'Unknown error'}`
      );
      return 0;
    }

    const messages = getOrDefault(messagesResult.value as ZTMMessage[], []);
    for (const msg of messages) {
      const chatForMsg = { creator, group, latest: msg, time: msg.time, updated: msg.time };
      if (await processAndNotify(chatForMsg, state, storeAllowFrom)) {
        processedCount++;
      }
    }
  } else if (chat.peer && chat.peer !== state.config.username) {
    const peer = chat.peer;
    const watermark = store.getWatermark(state.accountId, peer);
    const since = getMessageSyncStart(watermark);

    const messagesResult = await state.chatReader.getPeerMessages(peer, since);
    if (!messagesResult.ok) {
      const safePeer = sanitizeForLog(peer);
      logger.warn(
        `[${state.accountId}] Sync: Failed to get messages from peer "${safePeer}": ${messagesResult.error?.message ?? 'Unknown error'}`
      );
      return 0;
    }

    const messages = getOrDefault(messagesResult.value as ZTMMessage[], []);
    for (const msg of messages) {
      const chatForMsg = { peer, time: msg.time, updated: msg.time, latest: msg };
      if (await processAndNotify(chatForMsg, state, storeAllowFrom)) {
        processedCount++;
      }
    }
  }

  return processedCount;
}

/**
 * Perform initial sync of all existing messages.
 * Fetches ALL messages since watermark for each chat, not just the latest.
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
    processedCount += await fetchAndProcessAllMessages(chat, state, storeAllowFrom);
  }

  logger.info(
    `[${state.accountId}] Initial sync: ${chats.length} chats, ${processedCount} messages processed`
  );

  return chats;
}

/**
 * Perform full sync of all peers to catch missed messages in append-only files.
 * Fetches ALL messages since watermark for each chat, not just the latest.
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
    processedCount += await fetchAndProcessAllMessages(chat, state, storeAllowFrom);
  }

  if (processedCount > 0) {
    logger.debug(
      `[${state.accountId}] Full sync completed: ${processedCount} new messages from ${chats.length} peers`
    );
  }
}
