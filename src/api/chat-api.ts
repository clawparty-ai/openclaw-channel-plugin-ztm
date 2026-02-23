/**
 * Chat operations API for ZTM Chat
 * @module api/chat-api
 * Provides functions for retrieving chat list from ZTM Agent
 */

import type { ZTMChatConfig } from '../types/config.js';
import type { ZTMChat } from '../types/api.js';
import { success, failure, type Result } from '../types/common.js';
import { ZTMReadError } from '../types/errors.js';
import type { ZTMLogger, RequestHandler } from './request.js';
import { getOrDefault } from '../utils/guards.js';

/**
 * Normalize message content from API format to plain string.
 * Handles cases where message is:
 * - A plain string
 * - An object with {text: "..."}
 * - An object with {message: {text: "..."}} (nested format)
 *
 * @param message - The raw message content from the API (can be string, object, or nested object)
 * @returns A normalized string representation of the message content
 */
export function normalizeMessageContent(message: unknown): string {
  if (message === null || message === undefined) {
    return '';
  }
  if (typeof message === 'object') {
    // Handle nested {message: {text: "..."}} format
    const nestedMessage = (message as { message?: unknown }).message;
    if (
      nestedMessage !== undefined &&
      nestedMessage !== null &&
      typeof nestedMessage === 'object'
    ) {
      const nestedText = (nestedMessage as { text?: string }).text;
      if (typeof nestedText === 'string') {
        return nestedText;
      }
      return JSON.stringify(nestedMessage);
    }
    // Handle standard {text: "..."} format
    const text = (message as { text?: string }).text;
    if (typeof text === 'string') {
      return text;
    }
    return JSON.stringify(message);
  }
  return String(message);
}

/**
 * Create chat operations API for interacting with ZTM Chat App
 *
 * @param config - ZTM Chat configuration containing mesh name and other settings
 * @param request - HTTP request handler for making API calls
 * @param logger - Logger instance for debugging and error reporting
 * @returns Chat API interface with methods for retrieving chats
 */
export function createChatApi(config: ZTMChatConfig, request: RequestHandler, logger: ZTMLogger) {
  const CHAT_API_BASE = `/api/meshes/${config.meshName}/apps/ztm/chat/api`;

  return {
    /**
     * Get all chats from the Chat App API
     *
     * @returns Promise resolving to a Result containing array of ZTMChat objects, or failure with ZTMReadError
     */
    async getChats(): Promise<Result<ZTMChat[], ZTMReadError>> {
      logger.debug?.(`[ZTM API] Fetching chats via Chat App API`);

      const result = await request<ZTMChat[]>('GET', `${CHAT_API_BASE}/chats`);

      if (!result.ok) {
        const error = new ZTMReadError({
          peer: '*',
          operation: 'list',
          cause: result.error ?? new Error('Unknown error'),
        });
        logger.error?.(`[ZTM API] Failed to get chats: ${error.message}`);
        return failure(error);
      }

      // Normalize message format: convert {text: "..."} to string
      const chats = getOrDefault(result.value, []).map(chat => {
        if (chat.latest) {
          return {
            ...chat,
            latest: {
              ...chat.latest,
              message: normalizeMessageContent(chat.latest?.message),
            },
          };
        }
        return chat;
      });

      logger.debug?.(`[ZTM API] Got ${chats.length} chats`);
      return success(chats);
    },
  };
}
