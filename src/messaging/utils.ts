/**
 * Messaging utility functions
 *
 * Extracted from message-processor-helpers.ts to break circular dependencies.
 * This module has NO dependencies on messaging/processor.ts or messaging/dispatcher.ts.
 */

import type { ZTMChat } from '../types/api.js';
import type { ZTMChatConfig } from '../types/config.js';

/**
 * Determine if a chat is a group chat.
 *
 * @param chat - The ZTM chat to check
 * @returns True if the chat is a group chat, false otherwise
 */
export function isGroupChat(chat: ZTMChat): boolean {
  return !!(chat.creator && chat.group);
}

/**
 * Determine if a chat is a peer (direct) chat.
 *
 * @param chat - The ZTM chat to check
 * @returns True if the chat is a peer chat, false otherwise
 */
export function isPeerChat(chat: ZTMChat): boolean {
  return !isGroupChat(chat);
}

/**
 * Extract sender from a chat or message.
 *
 * @param chat - The ZTM chat
 * @returns The sender identifier
 */
export function extractSender(chat: ZTMChat): string {
  const explicitSender = chat.latest?.sender;

  if (explicitSender) {
    return explicitSender;
  }

  // For peer chats, fall back to peer ID
  // For group chats, return empty string (no fallback)
  if (isPeerChat(chat)) {
    return chat.peer || '';
  }
  return '';
}

/**
 * Check if a message is from the bot itself.
 *
 * @param sender - Message sender
 * @param botUsername - Bot's username
 * @returns True if the message is from the bot
 */
export function isSelfMessage(sender: string, botUsername: string): boolean {
  return sender.toLowerCase() === botUsername.toLowerCase();
}

/**
 * Validate chat message.
 *
 * @param chat - Chat to validate
 * @param config - Configuration
 * @returns Validation result with valid flag and optional reason
 */
export function validateChatMessage(
  chat: ZTMChat,
  config: ZTMChatConfig
): { valid: false; reason: string } | { valid: true } {
  const isGroup = isGroupChat(chat);

  if (isGroup) {
    // Group message validation
    if (!chat.latest) {
      return { valid: false, reason: 'no_latest_message' };
    }
    const sender = extractSender(chat);
    // Skip empty sender in group messages
    if (!sender) {
      return { valid: false, reason: 'empty_sender' };
    }
    if (isSelfMessage(sender, config.username)) {
      return { valid: false, reason: 'self_message' };
    }
  } else {
    // Peer message validation
    if (!chat.peer || chat.peer === config.username) {
      return { valid: false, reason: 'invalid_peer' };
    }
    if (!chat.latest) {
      return { valid: false, reason: 'no_latest_message' };
    }
    const sender = extractSender(chat);
    if (isSelfMessage(sender, config.username)) {
      return { valid: false, reason: 'self_message' };
    }
  }

  return { valid: true };
}
