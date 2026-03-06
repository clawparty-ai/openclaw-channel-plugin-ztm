/**
 * Watermark key generation utilities
 *
 * Extracted from message-processor-helpers.ts to break circular dependencies.
 * This module has NO dependencies on other messaging modules.
 */

import type { ZTMChatMessage } from '../types/messaging.js';

/**
 * Input parameters for generating a watermark key
 *
 * Uses discriminated union for type-safe key generation based on message type
 */
export type WatermarkKeyInput =
  | { type: 'message'; data: ZTMChatMessage }
  | { type: 'group'; data: { group: string; creator: string } }
  | { type: 'peer'; data: string };

/**
 * Generate a watermark key for message deduplication.
 * Uses discriminated union for type-safe parameter handling.
 *
 * @param input - Discriminated union containing message, group, or peer info
 * @returns Watermark key: "group:{creator}/{groupId}" for groups, or peer identifier
 *
 * @example
 * ```typescript
 * // Peer message
 * const key = getWatermarkKey({ type: 'peer', data: 'bob@example.com' });
 * // Returns: "bob@example.com"
 *
 * // Group message
 * const key = getWatermarkKey({
 *   type: 'group',
 *   data: { group: 'project-alpha', creator: 'alice@example.com' }
 * });
 * // Returns: "group:alice@example.com/project-alpha"
 *
 * // Message with group info
 * const key = getWatermarkKey({
 *   type: 'message',
 *   data: { isGroup: true, groupCreator: 'alice', groupId: 'project-alpha', peer: 'bob@example.com' }
 * });
 * // Returns: "group:alice/project-alpha"
 *
 * // Direct message
 * const key = getWatermarkKey({
 *   type: 'message',
 *   data: { isGroup: false, peer: 'bob@example.com' }
 * });
 * // Returns: "bob@example.com"
 * ```
 */
export function getWatermarkKey(input: WatermarkKeyInput): string {
  switch (input.type) {
    case 'message': {
      const msg = input.data;
      if (msg.isGroup && msg.groupCreator && msg.groupId) {
        return `group:${msg.groupCreator}/${msg.groupId}`;
      }
      return msg.peer;
    }
    case 'group':
      return `group:${input.data.creator}/${input.data.group}`;
    case 'peer':
      return input.data;
  }
}
