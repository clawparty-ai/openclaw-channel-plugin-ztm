/**
 * Message Processing Strategies
 * @module messaging/strategies
 * Strategy Pattern implementation for unified message processing
 *
 * **Interface Segregation**: This module uses segregated strategy interfaces
 * to eliminate non-null assertions and ensure type safety at compile time.
 */

import type { ZTMChat } from '../../types/api.js';
import type { ZTMChatMessage } from '../../types/messaging.js';
import type { AccountRuntimeState } from '../../runtime/state.js';
import { isGroupChat, extractSender, validateChatMessage } from '../utils.js';
import { notifyMessageCallbacks } from '../dispatcher.js';
import { processIncomingMessage } from '../processor.js';
import { checkMessagePolicy } from '../../core/policy-checker.js';
import { checkDmPolicy } from '../../core/dm-policy.js';
import { handlePairingRequest } from '../../connectivity/permit.js';
import { sanitizeForLog } from '../../utils/log-sanitize.js';
import { logger } from '../../utils/logger.js';
import type {
  RawMessage,
  GroupInfo,
  PeerProcessingContext,
  GroupProcessingContext,
  ProcessingContext,
  PeerMessageProcessingStrategy,
  GroupMessageProcessingStrategy,
  MessageProcessingStrategy,
} from './types.js';

/**
 * Process a single peer message through the validation and policy pipeline.
 * Returns null if message should be skipped (self-message, policy rejection, etc.)
 *
 * **ADR-010 Compliance**: This function performs Layer 3 (Policy Enforcement) BEFORE
 * calling `processIncomingMessage` (Layer 2), ensuring policy decisions happen
 * before watermark updates.
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
    `[${state.accountId}] processPeerMessage: msg.sender="${safeSender}", config.username="${state.config.username}", match=${msg.sender === state.config.username}`
  );

  // Skip self-messages
  if (msg.sender === state.config.username) {
    logger.debug(`[${state.accountId}] Skipping outbound message (sender=${safeSender})`);
    return null;
  }

  // **ADR-010 Layer 3**: Check DM policy BEFORE normalization
  const policyResult = checkMessagePolicy({
    sender: msg.sender,
    content: msg.message,
    config: state.config,
    accountId: state.accountId,
    storeAllowFrom,
  });

  if (!policyResult.allowed) {
    logger.debug(
      `[${state.accountId}] DM message from ${safeSender} blocked: ${policyResult.reason}`
    );
    return null;
  }

  // **ADR-010 Layer 2**: Message normalization (skipPolicyCheck=true)
  return processIncomingMessage(msg, {
    config: state.config,
    storeAllowFrom,
    accountId: state.accountId,
    skipPolicyCheck: true, // Already checked DM policy above
  });
}

/**
 * Process a single group message through the validation and policy pipeline.
 * Returns null if message should be skipped (self-message, policy rejection, etc.)
 *
 * **ADR-010 Compliance**: This function performs Layer 3 (Policy Enforcement) BEFORE
 * calling `processIncomingMessage` (Layer 2), ensuring policy decisions happen
 * before watermark updates.
 *
 * @param msg - Raw message object
 * @param state - Account runtime state
 * @param storeAllowFrom - Persisted allowFrom list (currently unused for groups)
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

  // **ADR-010 Layer 3**: Check group policy BEFORE normalization
  // This ensures DM policy is NOT applied to group messages
  const policyResult = checkMessagePolicy({
    sender: msg.sender,
    content: msg.message,
    config: state.config,
    accountId: state.accountId,
    storeAllowFrom,
    groupInfo,
  });

  if (!policyResult.allowed) {
    const safeGroupKey = sanitizeForLog(`${groupInfo.creator}/${groupInfo.group}`);
    const safeSender = sanitizeForLog(msg.sender);
    logger.debug(
      `[${state.accountId}] Group message from ${safeSender} blocked: ${policyResult.reason} (group: ${safeGroupKey})`
    );
    return null;
  }

  // **ADR-010 Layer 2**: Message normalization (skipPolicyCheck=true)
  const normalized = processIncomingMessage(msg, {
    config: state.config,
    storeAllowFrom,
    accountId: state.accountId,
    groupInfo,
    skipPolicyCheck: true, // Already checked group policy above
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
 * Peer message processing strategy
 *
 * Implements PeerMessageProcessingStrategy with type-safe context.
 * The normalize method accepts PeerProcessingContext which guarantees
 * that only peer-specific fields are available.
 */
class PeerMessageStrategy implements PeerMessageProcessingStrategy {
  normalize(msg: RawMessage, ctx: PeerProcessingContext): ZTMChatMessage | null {
    return processPeerMessage(msg, ctx.state, ctx.storeAllowFrom);
  }

  getGroupInfo(_chat: ZTMChat): GroupInfo | null {
    return null;
  }
}

/**
 * Group message processing strategy
 *
 * Implements GroupMessageProcessingStrategy with type-safe context.
 * The normalize method accepts GroupProcessingContext where groupInfo
 * is REQUIRED, eliminating the need for non-null assertions.
 */
class GroupMessageStrategy implements GroupMessageProcessingStrategy {
  normalize(msg: RawMessage, ctx: GroupProcessingContext): ZTMChatMessage | null {
    // ctx.groupInfo is now REQUIRED - no non-null assertion needed!
    return processGroupMessage(msg, ctx.state, ctx.storeAllowFrom, ctx.groupInfo, ctx.groupName);
  }

  getGroupInfo(chat: ZTMChat): GroupInfo | null {
    if (chat.creator && chat.group) {
      return { creator: chat.creator, group: chat.group };
    }
    return null;
  }
}

/**
 * Factory function to get appropriate strategy based on chat type
 *
 * @param chat - The ZTM chat to analyze
 * @returns Strategy instance (PeerMessageProcessingStrategy or GroupMessageProcessingStrategy)
 */
export function getMessageStrategy(chat: ZTMChat): MessageProcessingStrategy {
  return isGroupChat(chat) ? new GroupMessageStrategy() : new PeerMessageStrategy();
}

/**
 * Unified message processing and notification.
 * Replaces: processAndNotifyChat, processAndNotifyPeerMessages, processAndNotifyGroupMessages
 *
 * **Type Safety**: This function uses discriminated union type narrowing to ensure
 * the correct context type is passed to each strategy's normalize method.
 *
 * @param chat - The ZTM chat to process
 * @param state - Account runtime state
 * @param storeAllowFrom - Allowed senders list
 * @returns True if message was processed, false otherwise
 */
export async function processAndNotify(
  chat: ZTMChat,
  state: AccountRuntimeState,
  storeAllowFrom: string[]
): Promise<boolean> {
  // 1. Validate chat
  const validation = validateChatMessage(chat, state.config);
  if (!validation.valid) return false;

  // 2. Get appropriate strategy
  const strategy = getMessageStrategy(chat);

  // 3. Prepare raw message
  const rawMsg: RawMessage = {
    time: chat.latest!.time,
    message: chat.latest!.message,
    sender: extractSender(chat),
  };

  // 4. Build context using factory function for type safety
  const ctx: ProcessingContext = (() => {
    const groupInfo = strategy.getGroupInfo(chat);
    if (groupInfo) {
      return {
        type: 'group' as const,
        state,
        storeAllowFrom,
        groupInfo,
        groupName: chat.name,
      };
    }
    return {
      type: 'peer' as const,
      state,
      storeAllowFrom,
    };
  })();

  // 5. Normalize using the strategy
  // The context type is guaranteed to match the strategy type
  // because we built the context based on strategy.getGroupInfo()
  const normalized =
    ctx.type === 'peer'
      ? (strategy as PeerMessageProcessingStrategy).normalize(rawMsg, ctx)
      : (strategy as GroupMessageProcessingStrategy).normalize(rawMsg, ctx);
  if (!normalized) return false;

  // 6. Notify callbacks
  await notifyMessageCallbacks(state, normalized);

  // 7. Handle peer policy (only for peer messages)
  if (ctx.type === 'peer') {
    await handlePeerPolicyCheck(chat.peer!, state, storeAllowFrom, 'New message');
  }

  return true;
}
