// Shared message processing logic for watcher and polling
// Eliminates code duplication between long-polling and watch modes

import { logger } from '../utils/logger.js';
import { sanitizeForLog } from '../utils/log-sanitize.js';
import { processIncomingMessage } from './processor.js';
import { notifyMessageCallbacks } from './dispatcher.js';
import { checkDmPolicy } from '../core/dm-policy.js';
import { handlePairingRequest } from '../connectivity/permit.js';
import type { ZTMChatConfig } from '../types/config.js';
import type { ZTMChat } from '../types/api.js';
import type { AccountRuntimeState } from '../runtime/state.js';
import type { ZTMChatMessage } from '../types/messaging.js';

/**
 * Result of processing a single message
 */
export interface ProcessMessageResult {
  normalized: ZTMChatMessage | null;
  shouldSkip: boolean;
}

/**
 * Generate a watermark key for message deduplication.
 * For group messages: "group:{creator}/{groupId}"
 * For peer messages: the peer identifier
 *
 * @param messageOrGroupInfo - Either a ZTMChatMessage (from dispatcher) or group info object (from processor)
 * @param peer - Fallback peer identifier for peer messages (used when messageOrGroupInfo is not a ZTMChatMessage)
 */
export function getWatermarkKey(
  messageOrGroupInfo: ZTMChatMessage | { group?: string; creator?: string } | null | undefined,
  peer?: string
): string {
  // Handle ZTMChatMessage type (from dispatcher) - has 'peer' property
  if (messageOrGroupInfo && 'peer' in messageOrGroupInfo) {
    const msg = messageOrGroupInfo as ZTMChatMessage;
    // Check for group message
    if (msg.isGroup && msg.groupCreator && msg.groupId) {
      return `group:${msg.groupCreator}/${msg.groupId}`;
    }
    // Peer message - use peer field
    return msg.peer;
  }

  // Handle groupInfo object (from processor) - has 'group' and 'creator' properties
  if (messageOrGroupInfo && 'group' in messageOrGroupInfo && 'creator' in messageOrGroupInfo) {
    const groupInfo = messageOrGroupInfo as { group?: string; creator?: string };
    if (groupInfo.group && groupInfo.creator) {
      return `group:${groupInfo.creator}/${groupInfo.group}`;
    }
  }

  // Handle peer messages - use provided peer or fall back to empty string
  return peer || '';
}

/**
 * Determine if a chat is a group chat
 */
export function isGroupChat(chat: ZTMChat): boolean {
  return !!(chat.creator && chat.group);
}

/**
 * Determine if a chat is a peer (direct message) chat
 * This is the inverse of isGroupChat
 */
export function isPeerChat(chat: ZTMChat): boolean {
  return !isGroupChat(chat);
}

/**
 * Extract sender from a chat's latest message
 * Returns the sender from the message, or falls back to peer ID for peer chats only
 * For group chats, returns empty string if no explicit sender
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
 * Check if a message is from the bot itself (self-message)
 * Returns true if the sender matches the bot's username
 */
export function isSelfMessage(sender: string, botUsername: string): boolean {
  return sender === botUsername;
}

/**
 * Validate if a chat message should be processed.
 * Returns the reason for rejection, or null if the message is valid.
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

/**
 * Process a single peer message through the validation and policy pipeline.
 * Returns null if message should be skipped (self-message, policy rejection, etc.)
 *
 * @param msg - Raw message object
 * @param state - Account runtime state
 * @param storeAllowFrom - Persisted allowFrom list for pairing mode
 * @returns Processed message or null if skipped
 */
export function processPeerMessage(
  msg: { time: number; message: string; sender: string },
  state: AccountRuntimeState,
  storeAllowFrom: string[]
): ZTMChatMessage | null {
  const safeSender = sanitizeForLog(msg.sender);
  logger.debug(
    `[${state.accountId}] Message check: sender="${safeSender}", botUsername="${state.config.username}"`
  );

  // Skip self-messages
  if (msg.sender === state.config.username) {
    logger.debug(`[${state.accountId}] Skipping outbound message (sender=${safeSender})`);
    return null;
  }

  // Process through policy pipeline
  return processIncomingMessage(msg, {
    config: state.config,
    storeAllowFrom,
    accountId: state.accountId,
  });
}

/**
 * Process a single group message through the validation and policy pipeline.
 * Returns null if message should be skipped (self-message, policy rejection, etc.)
 *
 * @param msg - Raw message object
 * @param state - Account runtime state
 * @param storeAllowFrom - Persisted allowFrom list for pairing mode
 * @param groupInfo - Group metadata (creator, group)
 * @param groupName - Optional display name for the group
 * @returns Processed message with group metadata or null if skipped
 */
export function processGroupMessage(
  msg: { time: number; message: string; sender: string },
  state: AccountRuntimeState,
  storeAllowFrom: string[],
  groupInfo: { creator: string; group: string },
  groupName?: string
): ZTMChatMessage | null {
  // Skip self-messages in groups
  if (msg.sender === state.config.username) {
    const safeGroupKey = sanitizeForLog(`${groupInfo.creator}/${groupInfo.group}`);
    logger.debug(`[${state.accountId}] Skipping own message in group ${safeGroupKey}`);
    return null;
  }

  // Process through policy pipeline
  const normalized = processIncomingMessage(msg, {
    config: state.config,
    storeAllowFrom,
    accountId: state.accountId,
    groupInfo,
  });

  if (!normalized) return null;

  // Add group metadata to the normalized message
  return {
    ...normalized,
    isGroup: true,
    groupId: groupInfo.group,
    groupName: groupName,
    groupCreator: groupInfo.creator,
  };
}

/**
 * Handle DM policy check for a peer, triggering pairing request if needed.
 * Should be called after processing messages from a peer.
 *
 * @param peer - Peer identifier to check
 * @param state - Account runtime state
 * @param storeAllowFrom - Persisted allowFrom list for pairing mode
 * @param reason - Reason for the check (for logging)
 */
export async function handlePeerPolicyCheck(
  peer: string,
  state: AccountRuntimeState,
  storeAllowFrom: string[],
  reason: string
): Promise<void> {
  const check = checkDmPolicy(peer, state.config, storeAllowFrom);
  if (check.action === 'request_pairing') {
    await handlePairingRequest(state, peer, reason, storeAllowFrom);
  }
}

/**
 * Process and notify callbacks for multiple peer messages.
 * Filters out self-messages and applies DM policy.
 *
 * @param messages - Array of messages to process
 * @param state - Account runtime state
 * @param storeAllowFrom - Persisted allowFrom list for pairing mode
 */
export async function processAndNotifyPeerMessages(
  messages: Array<{ time: number; message: string; sender: string }>,
  state: AccountRuntimeState,
  storeAllowFrom: string[]
): Promise<void> {
  for (const msg of messages) {
    const normalized = processPeerMessage(msg, state, storeAllowFrom);
    if (normalized) {
      await notifyMessageCallbacks(state, normalized);
    }
  }
}

/**
 * Process and notify callbacks for multiple group messages.
 * Filters out self-messages and applies group policy.
 *
 * @param messages - Array of messages to process
 * @param state - Account runtime state
 * @param storeAllowFrom - Persisted allowFrom list for pairing mode
 * @param groupInfo - Group metadata (creator, group)
 * @param groupName - Optional display name for the group
 */
export async function processAndNotifyGroupMessages(
  messages: Array<{ time: number; message: string; sender: string }>,
  state: AccountRuntimeState,
  storeAllowFrom: string[],
  groupInfo: { creator: string; group: string },
  groupName?: string
): Promise<void> {
  for (const msg of messages) {
    const normalized = processGroupMessage(msg, state, storeAllowFrom, groupInfo, groupName);
    if (normalized) {
      await notifyMessageCallbacks(state, normalized);
    }
  }
}
