// Fallback polling watcher for ZTM Chat

import { logger } from "../utils/logger.js";
import { getZTMRuntime } from "../runtime/index.js";
import { processIncomingMessage, notifyMessageCallbacks, checkDmPolicy } from "./inbound.js";
import { handlePairingRequest } from "../connectivity/permit.js";
import type { AccountRuntimeState } from "../runtime/state.js";
import type { ZTMChatConfig } from "../types/config.js";
import { handleResult } from "../utils/result.js";

// Process a group chat message (synchronous - no async operations needed)
function processGroupChat(
  chat: { creator?: string; group?: string; name?: string; latest?: { time: number; message: string; sender?: string } | null },
  config: ZTMChatConfig,
  pollStoreAllowFrom: string[],
  accountId: string,
  state: AccountRuntimeState
): void {
  if (!chat.latest) return;

  const sender = chat.latest.sender || "";
  if (sender === config.username) return;

  const normalized = processIncomingMessage(
    {
      time: chat.latest.time,
      message: chat.latest.message,
      sender: sender,
    },
    config,
    pollStoreAllowFrom,
    accountId,
    { creator: chat.creator!, group: chat.group! }
  );
  if (normalized) {
    notifyMessageCallbacks(state, {
      ...normalized,
      isGroup: true,
      groupName: chat.name,
      groupId: chat.group,
      groupCreator: chat.creator,
    });
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

  const normalized = processIncomingMessage(
    {
      time: chat.latest.time,
      message: chat.latest.message,
      sender: chat.peer,
    },
    config,
    pollStoreAllowFrom,
    accountId
  );
  if (normalized) {
    notifyMessageCallbacks(state, normalized);
  }

  const check = checkDmPolicy(chat.peer, config, pollStoreAllowFrom);
  if (check.action === "request_pairing") {
    await handlePairingRequest(state, chat.peer, "Polling check", pollStoreAllowFrom);
  }
}

// Process all chats in a polling cycle
async function processChats(
  chats: Array<{ creator?: string; group?: string; name?: string; peer?: string; latest?: { time: number; message: string; sender?: string } | null }>,
  config: ZTMChatConfig,
  pollStoreAllowFrom: string[],
  accountId: string,
  state: AccountRuntimeState
): Promise<void> {
  for (const chat of chats) {
    const isGroup = !!(chat.creator && chat.group);

    if (isGroup) {
      processGroupChat(chat, config, pollStoreAllowFrom, accountId, state);
      continue;
    }

    await processPeerChat(chat, config, pollStoreAllowFrom, accountId, state);
  }
}

// Fallback polling watcher (when watch is unavailable)
export async function startPollingWatcher(state: AccountRuntimeState): Promise<void> {
  const { config, apiClient } = state;
  if (!apiClient) return;

  const rawInterval = (config as Record<string, unknown>).pollingInterval;
  const pollingInterval = typeof rawInterval === "number" ? Math.max(rawInterval, 1000) : 2000;

  logger.info(`[${state.accountId}] Starting polling watcher (${pollingInterval}ms)`);

  state.watchInterval = setInterval(async () => {
    if (!state.apiClient || !state.config) return;

    // If reading allowFrom store fails, skip this polling cycle to avoid bypassing DM policy
    const pollStoreAllowFrom = await getZTMRuntime().channel.pairing.readAllowFromStore("ztm-chat").catch((err: unknown) => {
      logger.error(`[${state.accountId}] readAllowFromStore failed during polling: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    });
    // Skip processing if we couldn't read the store (security: don't bypass allowFrom checks)
    if (pollStoreAllowFrom === null) {
      return;
    }
    const chatsResult = await state.apiClient.getChats();
    const chats = handleResult(chatsResult, {
      operation: "getChats",
      peer: state.accountId,
      logger,
      logLevel: "debug"
    });
    if (!chats) return;

    await processChats(chats, config, pollStoreAllowFrom, state.accountId, state);
  }, pollingInterval);
}
