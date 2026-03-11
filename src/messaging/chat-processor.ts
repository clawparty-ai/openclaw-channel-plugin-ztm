/**
 * Chat Message Processing
 * @module messaging/chat-processor
 * High-level chat message processing utilities
 * Used by watcher.ts to process incoming messages
 */

import { processIncomingMessage } from './processor.js';
import { isGroupChat, extractSender, validateChatMessage } from './message-processor-helpers.js';
import type { ZTMChatConfig } from '../types/config.js';
import type { ZTMChat } from '../types/api.js';

/**
 * Process a single chat message and notify callbacks if valid.
 * Returns true if a message was processed.
 *
 * @param chat - The ZTM chat to process
 * @param config - ZTM Chat configuration
 * @param storeAllowFrom - Allowed senders list for pairing mode
 * @param accountId - Account identifier
 * @returns True if message was processed, false otherwise
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

  // Defensive check: ensure latest exists (already validated, for safety)
  const latest = chat.latest;
  if (!latest) {
    return false;
  }

  if (isGroup) {
    // Group info already validated by isGroupChat
    const groupInfo = { creator: chat.creator!, group: chat.group! };
    const normalized = processIncomingMessage(
      {
        time: latest.time,
        message: latest.message,
        sender: sender,
      },
      { config, storeAllowFrom, accountId, groupInfo }
    );
    return normalized !== null;
  }

  // Peer chat
  const normalized = processIncomingMessage(
    {
      time: latest.time,
      message: latest.message,
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
// Re-export unified function from strategies
export { processAndNotify, getMessageStrategy } from './strategies/message-strategies.js';
