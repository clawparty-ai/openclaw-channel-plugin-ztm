/**
 * Message Processing Strategy Types
 * @module messaging/strategies/types
 * Interface segregation for type-safe message processing
 *
 * This module provides segregated interfaces for message processing strategies,
 * eliminating the need for non-null assertions while maintaining type safety.
 */

import type { AccountRuntimeState } from '../../runtime/state.js';
import type { ZTMChat } from '../../types/api.js';
import type { ZTMChatMessage } from '../../types/messaging.js';

/**
 * Raw message structure before normalization
 *
 * @property time - Message timestamp in milliseconds
 * @property message - Message content
 * @property sender - Message sender identifier
 */
export interface RawMessage {
  /** Message timestamp in milliseconds */
  time: number;
  /** Message content */
  message: string;
  /** Message sender identifier */
  sender: string;
}

/**
 * Group metadata
 *
 * Identifies a group chat in ZTM's distributed P2P network.
 * The combination of creator and group uniquely identifies a group.
 *
 * @property creator - Group creator's username (namespace)
 * @property group - Group identifier (unique within creator's namespace)
 *
 * @example
 * ```typescript
 * const groupInfo: GroupInfo = {
 *   creator: 'alice',
 *   group: 'engineering-team'
 * };
 * ```
 */
export interface GroupInfo {
  /** Group creator's username */
  creator: string;
  /** Group identifier */
  group: string;
}

/**
 * Base context shared by all message processing strategies
 *
 * Contains the minimal required fields for any message processing.
 *
 * @property state - Account runtime state
 * @property storeAllowFrom - Persisted allowFrom list for pairing mode
 */
export interface BaseProcessingContext {
  /** Account runtime state */
  state: AccountRuntimeState;
  /** Persisted allowFrom list for pairing mode */
  storeAllowFrom: string[];
}

/**
 * Context for peer (direct message) processing
 *
 * Extends base context with no additional fields since peer messages
 * are simpler and don't require group metadata.
 *
 * @example
 * ```typescript
 * const ctx: PeerProcessingContext = {
 *   state: runtimeState,
 *   storeAllowFrom: ['alice']
 * };
 * ```
 */
export interface PeerProcessingContext extends BaseProcessingContext {
  // No additional fields required - base context is sufficient
}

/**
 * Context for group message processing
 *
 * Extends base context with REQUIRED group metadata.
 * The groupInfo field is required (not optional) for type safety.
 *
 * @property state - Account runtime state
 * @property storeAllowFrom - Persisted allowFrom list for pairing mode
 * @property groupInfo - REQUIRED: Group metadata (creator, group)
 * @property groupName - OPTIONAL: Group display name
 *
 * @example
 * ```typescript
 * const ctx: GroupProcessingContext = {
 *   state: runtimeState,
 *   storeAllowFrom: [],
 *   groupInfo: { creator: 'alice', group: 'team' },
 *   groupName: 'Engineering Team'
 * };
 * ```
 */
export interface GroupProcessingContext extends BaseProcessingContext {
  /** REQUIRED: Group metadata (creator, group) */
  groupInfo: GroupInfo;
  /** OPTIONAL: Group display name */
  groupName?: string;
}

/**
 * Discriminated union for all processing contexts
 *
 * Uses a 'type' discriminator to enable type narrowing. This allows
 * TypeScript to know exactly which context variant you're working with.
 *
 * @example
 * ```typescript
 * function processMessage(ctx: ProcessingContext) {
 *   if (ctx.type === 'peer') {
 *     // ctx is PeerProcessingContext here
 *     processPeer(ctx);
 *   } else {
 *     // ctx is GroupProcessingContext here
 *     // ctx.groupInfo is guaranteed to exist
 *     processGroup(ctx);
 *   }
 * }
 * ```
 */
export type ProcessingContext =
  | { type: 'peer' } & PeerProcessingContext
  | { type: 'group' } & GroupProcessingContext;

/**
 * Base strategy interface
 *
 * All message processing strategies must implement this interface.
 *
 * @property getGroupInfo - Extract group info from chat
 */
export interface MessageProcessingStrategyBase {
  /**
   * Extract group info from chat
   *
   * @param chat - The ZTM chat to analyze
   * @returns GroupInfo if chat is a group chat, null otherwise
   */
  getGroupInfo(chat: ZTMChat): GroupInfo | null;
}

/**
 * Peer message processing strategy interface
 *
 * Specialized interface for processing direct (peer-to-peer) messages.
 *
 * @property normalize - Normalize a peer message
 * @property getGroupInfo - Extract group info (always returns null for peer)
 */
export interface PeerMessageProcessingStrategy extends MessageProcessingStrategyBase {
  /**
   * Normalize a peer message
   *
   * @param msg - Raw message to normalize
   * @param ctx - Peer-specific context (no group metadata)
   * @returns Normalized message or null if should be skipped
   */
  normalize(msg: RawMessage, ctx: PeerProcessingContext): ZTMChatMessage | null;
}

/**
 * Group message processing strategy interface
 *
 * Specialized interface for processing group messages.
 * The context parameter guarantees groupInfo is available.
 *
 * @property normalize - Normalize a group message
 * @property getGroupInfo - Extract group info (returns GroupInfo for group chats)
 */
export interface GroupMessageProcessingStrategy extends MessageProcessingStrategyBase {
  /**
   * Normalize a group message
   *
   * @param msg - Raw message to normalize
   * @param ctx - Group-specific context (groupInfo is required)
   * @returns Normalized message with group metadata or null if should be skipped
   */
  normalize(msg: RawMessage, ctx: GroupProcessingContext): ZTMChatMessage | null;
}

/**
 * Union of all strategy types
 *
 * Used when the specific strategy type isn't known at compile time.
 * Use type narrowing or instanceof checks to determine the actual type.
 */
export type MessageProcessingStrategy =
  | PeerMessageProcessingStrategy
  | GroupMessageProcessingStrategy;

/**
 * Build a type-safe processing context
 *
 * Factory function that creates the correct context type based on the
 * strategy's getGroupInfo result. This ensures the 'type' discriminator
 * always matches the strategy type.
 *
 * @param chat - The ZTM chat to process
 * @param state - Account runtime state
 * @param storeAllowFrom - Persisted allowFrom list for pairing mode
 * @param strategy - The strategy instance (must have getGroupInfo method)
 * @returns A type-safe processing context with correct discriminator
 *
 * @internal This is marked internal because consumers should use
 *            processAndNotify directly, not build contexts manually.
 *
 * @example
 * ```typescript
 * const strategy = getMessageStrategy(chat);
 * const ctx = buildProcessingContext(chat, state, [], strategy);
 * // ctx.type is now guaranteed to match the strategy type
 * ```
 */
export function buildProcessingContext(
  chat: ZTMChat,
  state: AccountRuntimeState,
  storeAllowFrom: string[],
  strategy: MessageProcessingStrategyBase
): ProcessingContext {
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
}
