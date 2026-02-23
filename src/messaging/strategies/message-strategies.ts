/**
 * Message Processing Strategies
 * @module messaging/strategies
 * Strategy Pattern implementation for unified message processing
 */

import type { ZTMChat } from '../../types/api.js';
import type { ZTMChatMessage } from '../../types/messaging.js';
import type { AccountRuntimeState } from '../../runtime/state.js';
import {
  isGroupChat,
  extractSender,
  validateChatMessage,
  processPeerMessage,
  processGroupMessage,
  handlePeerPolicyCheck,
} from '../message-processor-helpers.js';
import { notifyMessageCallbacks } from '../dispatcher.js';

/**
 * Raw message structure before normalization
 */
interface RawMessage {
  time: number;
  message: string;
  sender: string;
}

/**
 * Group metadata
 */
interface GroupInfo {
  creator: string;
  group: string;
}

/**
 * Context for message processing
 */
interface ProcessingContext {
  state: AccountRuntimeState;
  storeAllowFrom: string[];
  groupInfo?: GroupInfo;
  groupName?: string;
}

/**
 * Strategy interface for message processing
 */
export interface MessageProcessingStrategy {
  normalize(msg: RawMessage, ctx: ProcessingContext): ZTMChatMessage | null;
  getGroupInfo(chat: ZTMChat): GroupInfo | null;
}

/**
 * Peer message processing strategy
 */
class PeerMessageStrategy implements MessageProcessingStrategy {
  normalize(msg: RawMessage, ctx: ProcessingContext): ZTMChatMessage | null {
    return processPeerMessage(msg, ctx.state, ctx.storeAllowFrom);
  }

  getGroupInfo(_chat: ZTMChat): GroupInfo | null {
    return null;
  }
}

/**
 * Group message processing strategy
 */
class GroupMessageStrategy implements MessageProcessingStrategy {
  normalize(msg: RawMessage, ctx: ProcessingContext): ZTMChatMessage | null {
    return processGroupMessage(msg, ctx.state, ctx.storeAllowFrom, ctx.groupInfo!, ctx.groupName);
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
 */
export function getMessageStrategy(chat: ZTMChat): MessageProcessingStrategy {
  return isGroupChat(chat) ? new GroupMessageStrategy() : new PeerMessageStrategy();
}

/**
 * Unified message processing and notification.
 * Replaces: processAndNotifyChat, processAndNotifyPeerMessages, processAndNotifyGroupMessages
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

  // 4. Build context
  const ctx: ProcessingContext = {
    state,
    storeAllowFrom,
    groupInfo: strategy.getGroupInfo(chat) ?? undefined,
    groupName: chat.name,
  };

  // 5. Normalize
  const normalized = strategy.normalize(rawMsg, ctx);
  if (!normalized) return false;

  // 6. Notify callbacks
  await notifyMessageCallbacks(state, normalized);

  // 7. Handle peer policy (only for peer messages)
  if (!strategy.getGroupInfo(chat)) {
    await handlePeerPolicyCheck(chat.peer!, state, storeAllowFrom, 'New message');
  }

  return true;
}
