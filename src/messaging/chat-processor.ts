// Shared chat message processing utilities
// Used by both watcher.ts and polling.ts to process incoming messages

import { processIncomingMessage } from './processor.js';
import { notifyMessageCallbacks } from './dispatcher.js';
import { isGroupChat, extractSender, validateChatMessage } from './message-processor-helpers.js';
import type { AccountRuntimeState } from '../types/runtime.js';
import type { ZTMChatConfig } from '../types/config.js';
import type { ZTMChat } from '../types/api.js';
import { checkDmPolicy } from '../core/dm-policy.js';
import { handlePairingRequest } from '../connectivity/permit.js';

/**
 * Process a single chat message and notify callbacks if valid
 * Returns true if a message was processed
 */
export async function processChatMessage(
  chat: ZTMChat,
  config: ZTMChatConfig,
  storeAllowFrom: string[],
  accountId: string
): Promise<boolean> {
  const validation = validateChatMessage(chat, config);
  if (!validation.valid) {
    return false;
  }

  const isGroup = isGroupChat(chat);
  const sender = extractSender(chat);

  if (isGroup) {
    const groupInfo = { creator: chat.creator!, group: chat.group! };
    const normalized = processIncomingMessage(
      {
        time: chat.latest!.time,
        message: chat.latest!.message,
        sender: sender,
      },
      { config, storeAllowFrom, accountId, groupInfo }
    );
    return normalized !== null;
  }

  // Peer chat
  const normalized = processIncomingMessage(
    {
      time: chat.latest!.time,
      message: chat.latest!.message,
      sender: sender,
    },
    { config, storeAllowFrom, accountId }
  );
  return normalized !== null;
}

/**
 * Process a chat and notify callbacks with full message details
 * Used when you need to pass the full state to notify callbacks
 *
 * @param chat - The ZTM chat to process
 * @param state - Account runtime state containing config and accountId
 * @param storeAllowFrom - Allowed senders list for pairing mode
 * @returns True if message was processed, false otherwise
 */
export async function processAndNotifyChat(
  chat: ZTMChat,
  state: AccountRuntimeState,
  storeAllowFrom: string[]
): Promise<boolean> {
  // Extract state properties upfront to reduce feature envy
  const { config, accountId } = state;

  const validation = validateChatMessage(chat, config);
  if (!validation.valid) {
    return false;
  }

  const isGroup = isGroupChat(chat);
  const sender = extractSender(chat);

  if (isGroup) {
    const normalized = processIncomingMessage(
      {
        time: chat.latest!.time,
        message: chat.latest!.message,
        sender: sender,
      },
      {
        config,
        storeAllowFrom,
        accountId,
        groupInfo: { creator: chat.creator!, group: chat.group! },
      }
    );
    if (normalized) {
      await notifyMessageCallbacks(state, {
        ...normalized,
        isGroup: true,
        groupName: chat.name,
        groupId: chat.group,
        groupCreator: chat.creator,
      });
      return true;
    }
    return false;
  }

  // Peer chat
  const normalized = processIncomingMessage(
    {
      time: chat.latest!.time,
      message: chat.latest!.message,
      sender: sender,
    },
    { config, storeAllowFrom, accountId }
  );
  if (normalized) {
    await notifyMessageCallbacks(state, normalized);
  }

  // peer is guaranteed to be valid here due to validateChatMessage check
  const peer = chat.peer!;
  const check = checkDmPolicy(peer, config, storeAllowFrom);
  if (check.action === 'request_pairing') {
    await handlePairingRequest(state, peer, 'New message', storeAllowFrom);
  }

  return normalized !== null;
}
