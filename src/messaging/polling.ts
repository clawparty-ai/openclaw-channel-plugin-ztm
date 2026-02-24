/**
 * Fallback Polling Watcher
 * @module messaging/polling
 * Fallback polling watcher for ZTM Chat
 */

import { logger } from '../utils/logger.js';
import { container, DEPENDENCIES } from '../di/index.js';
import {
  processPeerMessage,
  processGroupMessage,
  handlePeerPolicyCheck,
} from './message-processor-helpers.js';
import { notifyMessageCallbacks } from './dispatcher.js';
import type { AccountRuntimeState } from '../runtime/state.js';
import type { ZTMChatConfig } from '../types/config.js';
import type { ZTMChat } from '../api/ztm-api.js';
import { handleResult } from '../utils/result.js';
import { POLLING_INTERVAL_DEFAULT_MS, POLLING_INTERVAL_MIN_MS } from '../constants.js';
import type { MessagingContext } from './context.js';
import type { Result } from '../types/common.js';

// Process a group chat message (async - uses async callback notification)
async function processGroupChat(
  chat: {
    creator?: string;
    group?: string;
    name?: string;
    latest?: { time: number; message: string; sender?: string } | null;
  },
  config: ZTMChatConfig,
  pollStoreAllowFrom: string[],
  accountId: string,
  state: AccountRuntimeState
): Promise<void> {
  if (!chat.latest || !chat.creator || !chat.group) return;

  const normalized = processGroupMessage(
    {
      time: chat.latest.time,
      message: chat.latest.message,
      sender: chat.latest.sender || '',
    },
    state,
    pollStoreAllowFrom,
    { creator: chat.creator, group: chat.group },
    chat.name
  );

  if (normalized) {
    await notifyMessageCallbacks(state, normalized);
  }
}

// Process a peer-to-peer chat message (async - requires handlePairingRequest)
async function processPeerChat(
  chat: { peer?: string; latest?: { time: number; message: string; sender?: string } | null },
  config: ZTMChatConfig,
  pollStoreAllowFrom: string[],
  accountId: string,
  state: AccountRuntimeState
): Promise<void> {
  if (!chat.peer || chat.peer === config.username) return;
  if (!chat.latest) return;

  const normalized = processPeerMessage(
    {
      time: chat.latest.time,
      message: chat.latest.message,
      sender: chat.peer,
    },
    state,
    pollStoreAllowFrom
  );

  if (normalized) {
    await notifyMessageCallbacks(state, normalized);
  }

  await handlePeerPolicyCheck(chat.peer, state, pollStoreAllowFrom, 'Polling check');
}

// Process all chats in a polling cycle
async function processChats(
  chats: Array<{
    creator?: string;
    group?: string;
    name?: string;
    peer?: string;
    latest?: { time: number; message: string; sender?: string } | null;
  }>,
  config: ZTMChatConfig,
  pollStoreAllowFrom: string[],
  accountId: string,
  state: AccountRuntimeState
): Promise<void> {
  for (const chat of chats) {
    const isGroup = !!(chat.creator && chat.group);

    if (isGroup) {
      await processGroupChat(chat, config, pollStoreAllowFrom, accountId, state);
      continue;
    }

    await processPeerChat(chat, config, pollStoreAllowFrom, accountId, state);
  }
}

import { MAX_CHATS_PER_POLL } from '../constants.js';

/**
 * Start the fallback polling watcher for ZTM Chat.
 * Used when the watch mechanism is unavailable.
 *
 * @param state - Account runtime state
 * @param context - Messaging context with repository dependencies
 * @param abortSignal - Optional abort signal for graceful shutdown
 * @returns Promise that resolves when the watcher starts
 */
export async function startPollingWatcher(
  state: AccountRuntimeState,
  context: MessagingContext,
  abortSignal?: AbortSignal
): Promise<void> {
  const { config, chatReader } = state;
  if (!chatReader) return;

  const rawInterval = (config as Record<string, unknown>).pollingInterval;
  const pollingInterval =
    typeof rawInterval === 'number'
      ? Math.max(rawInterval, POLLING_INTERVAL_MIN_MS)
      : POLLING_INTERVAL_DEFAULT_MS;

  logger.info(`[${state.accountId}] Starting polling watcher (${pollingInterval}ms)`);

  state.watchInterval = setInterval(async () => {
    if (abortSignal?.aborted) {
      clearInterval(state.watchInterval!);
      state.watchInterval = null;
      return;
    }

    if (!state.chatReader || !state.config) return;

    // Use cached allowFrom to avoid redundant async calls every poll cycle
    const rt = container.get(DEPENDENCIES.RUNTIME).get();
    const pollStoreAllowFrom = await context.allowFromRepo.getAllowFrom(state.accountId, rt);
    // Skip processing if we couldn't read the store (security: don't bypass allowFrom checks)
    if (pollStoreAllowFrom === null) {
      return;
    }
    const chatsResult = await state.chatReader.getChats();
    const chats = handleResult(chatsResult as Result<ZTMChat[], Error>, {
      operation: 'getChats',
      peer: state.accountId,
      logger,
      logLevel: 'debug',
    });
    if (!chats) return;

    // Limit chats processed per cycle to prevent memory spikes from large histories
    const chatsToProcess = (chats as ZTMChat[]).slice(0, MAX_CHATS_PER_POLL);
    if ((chats as ZTMChat[]).length > MAX_CHATS_PER_POLL) {
      logger.debug(
        `[${state.accountId}] Limiting poll to ${MAX_CHATS_PER_POLL} of ${(chats as ZTMChat[]).length} chats`
      );
    }

    await processChats(chatsToProcess, config, pollStoreAllowFrom, state.accountId, state);
  }, pollingInterval);

  if (abortSignal) {
    abortSignal.addEventListener(
      'abort',
      () => {
        if (state.watchInterval) {
          clearInterval(state.watchInterval);
          state.watchInterval = null;
        }
      },
      { once: true }
    );
  }
}
