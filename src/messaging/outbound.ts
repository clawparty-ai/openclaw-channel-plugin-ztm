/**
 * Outbound Message Sending
 * @module messaging/outbound
 * Outbound message sending for ZTM Chat
 */

import { randomBytes } from 'node:crypto';
import { logger } from '../utils/logger.js';
import { type ZTMMessage } from '../api/ztm-api.js';
import type { AccountRuntimeState } from '../runtime/state.js';
import { failure, success, type Result } from '../types/common.js';
import { ZTMSendError } from '../types/errors.js';
import { validateUsername } from '../utils/validation.js';

/**
 * Generate a unique message ID for outbound messages.
 *
 * Combines timestamp with random bytes for collision avoidance.
 *
 * @returns A unique message ID string in format "ztm-{timestamp}-{random}"
 *
 * @example
 * ```typescript
 * const messageId = generateMessageId();
 * // Returns: "ztm-1678890123456-a1b2c3d4"
 * ```
 *
 * @complexity O(1) - Constant time operation
 * @performance Uses crypto.randomBytes for secure random generation
 * @since 2026.3.13
 */
export function generateMessageId(): string {
  const randomPart = randomBytes(4).toString('hex');
  return `ztm-${Date.now()}-${randomPart}`;
}

/**
 * Send a message to a ZTM peer or group.
 *
 * Routes to the appropriate API method (sendPeerMessage or sendGroupMessage)
 * based on whether groupInfo is provided. Validates peer identifier for security.
 *
 * @param state - Account runtime state with chat sender and config
 * @param peer - The recipient peer identifier (for peer messages) or ignored (for group messages)
 * @param content - The message content to send
 * @param groupInfo - Optional group info for sending to a group
 * @returns Result indicating success or failure with error details
 *
 * @throws {ZTMSendError} When runtime not initialized, peer validation fails, or send fails
 *
 * @example
 * ```typescript
 * // Send peer message
 * const result = await sendZTMMessage(state, 'alice', 'Hello!');
 *
 * // Send group message
 * const groupResult = await sendZTMMessage(
 *   state,
 *   '',
 *   'Hello team!',
 *   { creator: 'alice', group: 'team-chat' }
 * );
 * ```
 *
 * @complexity O(1) + network latency - Validation is constant time, sending depends on network
 * @performance Validates peer before sending to fail fast on invalid input
 * @since 2026.3.13
 * @see {@link ../api/chat-api.ts} Chat API interface
 * @see {@link ../utils/validation.ts#validateUsername} Peer validation
 */
export async function sendZTMMessage(
  state: AccountRuntimeState,
  peer: string,
  content: string,
  groupInfo?: { creator: string; group: string }
): Promise<Result<boolean, ZTMSendError>> {
  // Check initialization first
  if (!state.config || !state.chatSender) {
    const error = new ZTMSendError({
      peer,
      messageTime: Date.now(),
      cause: new Error('Runtime not initialized'),
    });
    logger.error(`[${state.accountId}] Failed to send message: ${error.message}`);
    state.lastError = error.message;
    return failure(error);
  }

  // Validate peer parameter to prevent injection attacks
  if (!groupInfo) {
    const peerValidation = validateUsername(peer);
    if (!peerValidation.valid) {
      const error = new ZTMSendError({
        peer,
        messageTime: Date.now(),
        cause: new Error(`Invalid peer: ${peerValidation.error}`),
      });
      logger.error(`[${state.accountId}] Failed to send message: ${error.message}`);
      state.lastError = error.message;
      return failure(error);
    }
  }

  const message: ZTMMessage = {
    time: Date.now(),
    message: content,
    sender: state.config.username,
  };

  // Route to appropriate API method based on groupInfo
  const result = groupInfo
    ? await state.chatSender.sendGroupMessage(groupInfo.creator, groupInfo.group, message)
    : await state.chatSender.sendPeerMessage(peer, message);

  // Handle result with consistent logging and state updates
  if (result.ok) {
    state.lastOutboundAt = new Date();
    const operation = groupInfo ? 'sendGroupMessage' : 'sendPeerMessage';
    const target = groupInfo ? `${groupInfo.creator}/${groupInfo.group}` : peer;
    logger.debug(`[${state.accountId}] ${operation} to "${target}" succeeded`);
    // Cast the result to the expected return type
    return success(result.value as boolean);
  }

  // Error path - update state and log
  state.lastError = result.error?.message ?? 'Unknown send error';
  const operation = groupInfo ? 'sendGroupMessage' : 'sendPeerMessage';
  const target = groupInfo ? `${groupInfo.creator}/${groupInfo.group}` : peer;
  logger.warn(`[${state.accountId}] ${operation} to "${target}" failed: ${state.lastError}`);

  // Wrap the error in ZTMSendError if it's not already one
  const sendError =
    result.error instanceof ZTMSendError
      ? result.error
      : new ZTMSendError({
          peer,
          messageTime: message.time,
          cause: result.error,
        });
  return failure(sendError);
}
