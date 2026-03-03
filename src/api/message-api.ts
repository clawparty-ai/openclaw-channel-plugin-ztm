/**
 * Message operations API for ZTM Chat
 * @module api/message-api
 * Provides functions for sending/receiving messages and watching for changes
 */

import type { ZTMChatConfig } from '../types/config.js';
import type { ZTMMessage, WatchChangeItem } from '../types/api.js';
import { success, failure, type Result } from '../types/common.js';
import { ZTMReadError, ZTMSendError } from '../types/errors.js';
import type { ZTMLogger, RequestHandler } from './request.js';
import { normalizeMessageContent } from './chat-api.js';
import { sanitizeForLog } from '../utils/log-sanitize.js';
import {
  validateUsername,
  validateGroupId,
  validateGroupName,
  validateMessageContent,
} from '../utils/validation.js';
import { getOrDefault } from '../utils/guards.js';

/**
 * Create message operations API for sending/receiving messages
 *
 * @param config - ZTM Chat configuration containing mesh name and other settings
 * @param request - HTTP request handler for making API calls
 * @param logger - Logger instance for debugging and error reporting
 * @param getChats - Function to retrieve chats for change detection
 * @returns Message API interface with methods for peer/group messages and change watching
 */
export function createMessageApi(
  config: ZTMChatConfig,
  request: RequestHandler,
  logger: ZTMLogger,
  getChats: () => Promise<Result<import('../types/api.js').ZTMChat[], ZTMReadError>>
) {
  const CHAT_API_BASE = `/api/meshes/${config.meshName}/apps/ztm/chat/api`;

  let lastPollTime: number | undefined;

  return {
    /**
     * Get peer messages from Chat App API
     *
     * @param peer - The peer's username
     * @param since - Optional timestamp to get messages after
     * @param before - Optional timestamp to get messages before
     * @returns Promise resolving to a Result containing array of ZTMMessage objects, or failure with ZTMReadError
     */
    async getPeerMessages(
      peer: string,
      since?: number,
      before?: number
    ): Promise<Result<ZTMMessage[], ZTMReadError>> {
      // Validate peer username format
      const peerValidation = validateUsername(peer);
      if (!peerValidation.valid) {
        const error = new ZTMReadError({
          peer,
          operation: 'read',
          cause: new Error(peerValidation.error),
        });
        logger.warn?.(
          `[ZTM API] Invalid peer username "${sanitizeForLog(peer)}": ${peerValidation.error}`
        );
        return failure(error);
      }

      const safePeer = sanitizeForLog(peer);
      logger.debug?.(
        `[ZTM API] Fetching messages from peer "${safePeer}" since=${since}, before=${before}`
      );

      const queryParams = new URLSearchParams();
      if (since !== undefined) {
        queryParams.set('since', since.toString());
      }
      if (before !== undefined) {
        queryParams.set('before', before.toString());
      }

      const encodedPeer = encodeURIComponent(peer);
      const result = await request<ZTMMessage[]>(
        'GET',
        `${CHAT_API_BASE}/peers/${encodedPeer}/messages?${queryParams.toString()}`
      );

      if (!result.ok) {
        const error = new ZTMReadError({
          peer,
          operation: 'read',
          cause: result.error ?? new Error('Unknown error'),
        });
        logger.error?.(`[ZTM API] Failed to get peer messages: ${error.message}`);
        return failure(error);
      }

      const messages = getOrDefault(result.value, []).map(msg => ({
        ...msg,
        message: normalizeMessageContent(msg.message),
      }));

      logger.debug?.(`[ZTM API] Fetched ${messages.length} messages from peer "${safePeer}"`);
      return success(messages);
    },

    /**
     * Send a message to a peer
     *
     * @param peer - The peer's username
     * @param message - The message to send
     * @returns Promise resolving to a Result with true on success, or failure with ZTMSendError
     */
    async sendPeerMessage(
      peer: string,
      message: ZTMMessage
    ): Promise<Result<boolean, ZTMSendError>> {
      // Validate peer username format
      const peerValidation = validateUsername(peer);
      if (!peerValidation.valid) {
        const error = new ZTMSendError({
          peer,
          messageTime: message.time,
          contentPreview: message.message,
          cause: new Error(peerValidation.error),
        });
        logger.warn?.(
          `[ZTM API] Invalid peer username "${sanitizeForLog(peer)}": ${peerValidation.error}`
        );
        return failure(error);
      }

      // Validate message content
      const contentValidation = validateMessageContent(message.message);
      if (!contentValidation.valid) {
        const error = new ZTMSendError({
          peer,
          messageTime: message.time,
          contentPreview: message.message,
          cause: new Error(contentValidation.error),
        });
        logger.warn?.(
          `[ZTM API] Invalid message content for peer "${sanitizeForLog(peer)}": ${contentValidation.error}`
        );
        return failure(error);
      }

      const safePeer = sanitizeForLog(peer);
      const safeText = sanitizeForLog(message.message.substring(0, 50));
      logger.debug?.(
        `[ZTM API] Sending message to peer "${safePeer}" at time=${message.time}, text="${safeText}..."`
      );

      const ztmEntry = { text: message.message };
      const encodedPeer = encodeURIComponent(peer);

      const result = await request<void>(
        'POST',
        `${CHAT_API_BASE}/peers/${encodedPeer}/messages`,
        ztmEntry
      );

      if (!result.ok) {
        const error = new ZTMSendError({
          peer,
          messageTime: message.time,
          contentPreview: message.message,
          cause: result.error ?? new Error('Unknown error'),
        });
        logger.error?.(`[ZTM API] Failed to send message to ${safePeer}: ${error.message}`);
        return failure(error);
      }

      logger.debug?.(`[ZTM API] Successfully sent message to peer "${safePeer}"`);
      return success(true);
    },

    /**
     * Get group messages
     *
     * @param creator - The group creator's username
     * @param group - The group ID
     * @param since - Optional timestamp to get messages after
     * @returns Promise resolving to a Result containing array of ZTMMessage objects, or failure with ZTMReadError
     */
    async getGroupMessages(
      creator: string,
      group: string,
      since?: number
    ): Promise<Result<ZTMMessage[], ZTMReadError>> {
      // Validate creator username format
      const creatorValidation = validateUsername(creator);
      if (!creatorValidation.valid) {
        const error = new ZTMReadError({
          peer: `${creator}/${group}`,
          operation: 'read',
          cause: new Error(creatorValidation.error),
        });
        logger.warn?.(
          `[ZTM API] Invalid creator username "${sanitizeForLog(creator)}": ${creatorValidation.error}`
        );
        return failure(error);
      }

      // Validate group ID format
      const groupValidation = validateGroupId(group);
      if (!groupValidation.valid) {
        const error = new ZTMReadError({
          peer: `${creator}/${group}`,
          operation: 'read',
          cause: new Error(groupValidation.error),
        });
        logger.warn?.(
          `[ZTM API] Invalid group ID "${sanitizeForLog(group)}": ${groupValidation.error}`
        );
        return failure(error);
      }

      const safeGroup = sanitizeForLog(`${creator}/${group}`);
      logger.debug?.(`[ZTM API] Fetching group messages from "${safeGroup}" since=${since}`);

      const queryParams = new URLSearchParams();
      if (since !== undefined) {
        queryParams.set('since', since.toString());
      }

      const result = await request<ZTMMessage[]>(
        'GET',
        `${CHAT_API_BASE}/groups/${encodeURIComponent(creator)}/${encodeURIComponent(group)}/messages?${queryParams.toString()}`
      );

      if (!result.ok) {
        const error = new ZTMReadError({
          peer: `${creator}/${group}`,
          operation: 'read',
          cause: result.error ?? new Error('Unknown error'),
        });
        logger.error?.(`[ZTM API] Failed to get group messages: ${error.message}`);
        return failure(error);
      }

      const messages = getOrDefault(result.value, []).map(msg => {
        const msgMessage = msg.message ?? null;
        let normalizedMessage = '';
        if (msgMessage !== null && typeof msgMessage === 'object') {
          normalizedMessage = (msgMessage as { text?: string }).text || JSON.stringify(msgMessage);
        } else {
          normalizedMessage = String(msgMessage ?? '');
        }
        return {
          ...msg,
          message: normalizedMessage,
        };
      });

      logger.debug?.(`[ZTM API] Fetched ${messages.length} messages from group "${safeGroup}"`);
      return success(messages);
    },

    /**
     * Send a message to a group
     *
     * @param creator - The group creator's username
     * @param group - The group ID
     * @param message - The message to send
     * @returns Promise resolving to a Result with true on success, or failure with ZTMSendError
     */
    async sendGroupMessage(
      creator: string,
      group: string,
      message: ZTMMessage
    ): Promise<Result<boolean, ZTMSendError>> {
      // Validate creator username format
      const creatorValidation = validateUsername(creator);
      if (!creatorValidation.valid) {
        const error = new ZTMSendError({
          peer: `${creator}/${group}`,
          messageTime: message.time,
          contentPreview: message.message,
          cause: new Error(creatorValidation.error),
        });
        logger.warn?.(
          `[ZTM API] Invalid creator username "${sanitizeForLog(creator)}": ${creatorValidation.error}`
        );
        return failure(error);
      }

      // Validate group ID format
      const groupValidation = validateGroupId(group);
      if (!groupValidation.valid) {
        const error = new ZTMSendError({
          peer: `${creator}/${group}`,
          messageTime: message.time,
          contentPreview: message.message,
          cause: new Error(groupValidation.error),
        });
        logger.warn?.(
          `[ZTM API] Invalid group ID "${sanitizeForLog(group)}": ${groupValidation.error}`
        );
        return failure(error);
      }

      // Validate message content
      const contentValidation = validateMessageContent(message.message);
      if (!contentValidation.valid) {
        const error = new ZTMSendError({
          peer: `${creator}/${group}`,
          messageTime: message.time,
          contentPreview: message.message,
          cause: new Error(contentValidation.error),
        });
        logger.warn?.(
          `[ZTM API] Invalid message content for group "${sanitizeForLog(`${creator}/${group}`)}": ${contentValidation.error}`
        );
        return failure(error);
      }

      const safeGroup = sanitizeForLog(`${creator}/${group}`);
      const safeText = sanitizeForLog(message.message.substring(0, 50));
      logger.debug?.(`[ZTM API] Sending message to group "${safeGroup}", text="${safeText}..."`);

      const ztmEntry = { text: message.message };

      const result = await request<void>(
        'POST',
        `${CHAT_API_BASE}/groups/${encodeURIComponent(creator)}/${encodeURIComponent(group)}/messages`,
        ztmEntry
      );

      if (!result.ok) {
        const error = new ZTMSendError({
          peer: `${creator}/${group}`,
          messageTime: message.time,
          contentPreview: message.message,
          cause: result.error ?? new Error('Unknown error'),
        });
        logger.error?.(`[ZTM API] Failed to send group message: ${error.message}`);
        return failure(error);
      }

      logger.debug?.(`[ZTM API] Successfully sent message to group "${safeGroup}"`);
      return success(true);
    },

    /**
     * Watch for changes in chats
     *
     * @returns Promise resolving to a Result containing array of WatchChangeItem objects, or failure with ZTMReadError
     */
    async watchChanges(): Promise<Result<WatchChangeItem[], ZTMReadError>> {
      logger.debug?.(`[ZTM API] Watching for changes`);

      const chatsResult = await getChats();
      if (!chatsResult.ok) {
        const error = new ZTMReadError({
          peer: '*',
          operation: 'list',
          cause: chatsResult.error ?? new Error('Unknown error'),
        });
        logger.error?.(`[ZTM API] Watch failed: ${error.message}`);
        return failure(error);
      }

      const changedItems: WatchChangeItem[] = [];

      logger.debug?.(
        `[ZTM API] Watch: got ${chatsResult.value?.length ?? 0} chats, lastPollTime=${lastPollTime}`
      );

      for (const chat of getOrDefault(chatsResult.value, [])) {
        const chatLatestTime = chat.latest?.time ?? 0;
        if (chatLatestTime <= (lastPollTime ?? 0)) continue;

        if (chat.peer && chat.peer !== config.username) {
          // Validate peer username format to avoid repeated processing of invalid names
          const peerValidation = validateUsername(chat.peer);
          if (!peerValidation.valid) {
            logger.debug?.(
              `[ZTM API] Watch: skipping invalid peer username "${sanitizeForLog(chat.peer)}": ${peerValidation.error}`
            );
            continue;
          }
          changedItems.push({ type: 'peer', peer: chat.peer });
        } else if (chat.group && chat.creator) {
          // Validate creator username and group ID format
          const creatorValidation = validateUsername(chat.creator);
          if (!creatorValidation.valid) {
            logger.debug?.(
              `[ZTM API] Watch: skipping invalid creator username "${sanitizeForLog(chat.creator)}": ${creatorValidation.error}`
            );
            continue;
          }
          const groupValidation = validateGroupId(chat.group);
          if (!groupValidation.valid) {
            logger.debug?.(
              `[ZTM API] Watch: skipping invalid group ID "${sanitizeForLog(chat.group)}": ${groupValidation.error}`
            );
            continue;
          }

          // Validate group name if present
          if (chat.name) {
            const nameValidation = validateGroupName(chat.name);
            if (!nameValidation.valid) {
              logger.debug?.(
                `[ZTM API] Watch: skipping group with invalid name "${sanitizeForLog(chat.name)}": ${nameValidation.error}`
              );
              continue;
            }
          }

          changedItems.push({
            type: 'group',
            creator: chat.creator,
            group: chat.group,
            name: chat.name,
          });
        }
      }

      if (changedItems.length > 0) {
        const chats = getOrDefault(chatsResult.value, []);
        const latestTime = Math.max(...chats.map(c => c.latest?.time ?? 0));
        lastPollTime = latestTime;
        const peerCount = changedItems.filter(i => i.type === 'peer').length;
        const groupCount = changedItems.filter(i => i.type === 'group').length;
        logger.debug?.(
          `[ZTM API] Watch: found ${peerCount} peers, ${groupCount} groups with new messages`
        );
      }

      logger.debug?.(`[ZTM API] Watch complete: ${changedItems.length} chats with new messages`);
      return success(changedItems);
    },

    /**
     * Get the last poll time (for testing)
     *
     * @returns The last poll timestamp, or undefined if never polled
     */
    getLastPollTime(): number | undefined {
      return lastPollTime;
    },

    /**
     * Set the last poll time (for testing)
     *
     * @param time - The timestamp to set as last poll time
     */
    setLastPollTime(time: number): void {
      lastPollTime = time;
    },
  };
}
