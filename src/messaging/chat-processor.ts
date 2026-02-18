// Shared chat message processing utilities
// Used by both watcher.ts and polling.ts to process incoming messages

import { processIncomingMessage, type ProcessMessageContext } from './processor.js';
import { notifyMessageCallbacks } from './dispatcher.js';
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
  const isGroup = !!(chat.creator && chat.group);

  if (isGroup) {
    if (!chat.latest) return false;

    const sender = chat.latest.sender || '';
    if (sender === config.username) return false;

    const groupInfo = { creator: chat.creator!, group: chat.group! };
    const normalized = processIncomingMessage(
      {
        time: chat.latest.time,
        message: chat.latest.message,
        sender: sender,
      },
      { config, storeAllowFrom, accountId, groupInfo }
    );
    if (normalized) {
      return true;
    }
    return false;
  }

  // Peer chat
  if (!chat.peer || chat.peer === config.username) return false;
  if (!chat.latest) return false;

  const sender = chat.latest.sender || chat.peer;
  if (sender === config.username) {
    return false;
  }

  const normalized = processIncomingMessage(
    {
      time: chat.latest.time,
      message: chat.latest.message,
      sender: sender,
    },
    { config, storeAllowFrom, accountId }
  );
  if (normalized) {
    return true;
  }
  return false;
}

/**
 * Process a chat and notify callbacks with full message details
 * Used when you need to pass the full state to notify callbacks
 */
export async function processAndNotifyChat(
  chat: ZTMChat,
  state: AccountRuntimeState,
  storeAllowFrom: string[]
): Promise<boolean> {
  const isGroup = !!(chat.creator && chat.group);

  if (isGroup) {
    if (!chat.latest) return false;

    const sender = chat.latest.sender || '';
    if (sender === state.config.username) return false;

    const normalized = processIncomingMessage(
      {
        time: chat.latest.time,
        message: chat.latest.message,
        sender: sender,
      },
      {
        config: state.config,
        storeAllowFrom,
        accountId: state.accountId,
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
  if (!chat.peer || chat.peer === state.config.username) return false;
  if (!chat.latest) return false;

  const sender = chat.latest.sender || chat.peer;
  if (sender === state.config.username) {
    return false;
  }

  const normalized = processIncomingMessage(
    {
      time: chat.latest.time,
      message: chat.latest.message,
      sender: sender,
    },
    { config: state.config, storeAllowFrom, accountId: state.accountId }
  );
  if (normalized) {
    await notifyMessageCallbacks(state, normalized);
  }

  const check = checkDmPolicy(chat.peer, state.config, storeAllowFrom);
  if (check.action === 'request_pairing') {
    await handlePairingRequest(state, chat.peer, 'New message', storeAllowFrom);
  }

  return normalized !== null;
}
