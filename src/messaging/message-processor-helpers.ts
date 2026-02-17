// Shared message processing logic for watcher and polling
// Eliminates code duplication between long-polling and watch modes

import { logger } from '../utils/logger.js';
import { sanitizeForLog } from '../utils/log-sanitize.js';
import { processIncomingMessage } from './processor.js';
import { notifyMessageCallbacks } from './dispatcher.js';
import { checkDmPolicy } from '../core/dm-policy.js';
import { handlePairingRequest } from '../connectivity/permit.js';
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
