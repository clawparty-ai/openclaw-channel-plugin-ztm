/**
 * Gateway Message Handler
 * @module channel/gateway-message-handler
 * @remarks
 * This module handles message dispatching logic for the ZTM Chat gateway.
 * It provides functions for creating reply dispatcher options and dispatching
 * inbound messages to AI agents.
 */
import type { ZTMChatConfig } from '../types/config.js';
import type { ZTMChatMessage } from '../types/messaging.js';
import type { AccountRuntimeState } from '../runtime/state.js';
import { sendZTMMessage } from '../messaging/outbound.js';
import { createInboundContext } from './message-dispatcher.js';
import { logger } from '../utils/logger.js';

/**
 * Create dispatcher options for reply delivery
 * Extracted to reduce nesting in buildMessageCallback
 *
 * @param state - Account runtime state
 * @param msg - The incoming message to reply to
 * @param accountId - The account identifier
 * @param agentId - The AI agent identifier
 * @param rt - ZTM runtime instance
 * @returns Dispatcher options object with deliver and onError callbacks
 */
export function createReplyDispatcherOptions(
  state: AccountRuntimeState,
  msg: ZTMChatMessage,
  accountId: string,
  agentId: string,
  rt: ReturnType<typeof import('../runtime/index.js').getZTMRuntime>
) {
  return {
    humanDelay: rt.channel.reply.resolveHumanDelayConfig({}, agentId),
    deliver: async (payload: { text?: string; mediaUrl?: string }) => {
      const replyText = payload.text ?? '';
      if (!replyText) return;
      const groupInfo =
        msg.isGroup && msg.groupId && msg.groupCreator
          ? { creator: msg.groupCreator, group: msg.groupId }
          : undefined;
      await sendZTMMessage(state, msg.sender, replyText, groupInfo);
    },
    onError: (err: unknown) => {
      logger.error?.(`[${accountId}] Reply delivery failed for ${msg.sender}: ${String(err)}`);
    },
  };
}

/**
 * Dispatch inbound message to AI agent
 * Extracted to reduce nesting in buildMessageCallback
 *
 * @param state - Account runtime state
 * @param accountId - The account identifier
 * @param config - ZTM Chat configuration
 * @param msg - The incoming message to dispatch
 * @param rt - ZTM runtime instance
 * @returns Promise that resolves when dispatch completes
 */
export async function dispatchInboundMessage(
  state: AccountRuntimeState,
  accountId: string,
  config: ZTMChatConfig,
  msg: ZTMChatMessage,
  rt: ReturnType<typeof import('../runtime/index.js').getZTMRuntime>
): Promise<void> {
  const { ctxPayload, matchedBy, agentId } = createInboundContext({
    rt,
    msg,
    config,
    accountId,
  });

  logger.info?.(
    `[${accountId}] Dispatching message from ${msg.sender} to AI agent (route: ${matchedBy})`
  );

  const dispatcherOptions = createReplyDispatcherOptions(state, msg, accountId, agentId, rt);

  const { queuedFinal } = await rt.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: {},
    dispatcherOptions,
  });

  if (!queuedFinal) {
    logger.info?.(`[${accountId}] No response generated for message from ${msg.sender}`);
  }
}
