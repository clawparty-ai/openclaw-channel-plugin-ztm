/**
 * Message Dispatcher for ZTM Chat
 * @module channel/message-dispatcher
 * Handles inbound message context creation and dispatch to AI agents
 */

import type { ZTMChatConfig } from '../types/config.js';
import type { ZTMChatMessage } from '../types/messaging.js';
import type { AccountRuntimeState } from '../runtime/state.js';
import { sendZTMMessage } from '../messaging/outbound.js';
import { getZTMRuntime } from '../runtime/index.js';
import { extractErrorMessage } from '../utils/error.js';
import { ZTM_CHANNEL_ID, formatZTMAddress } from '../constants.js';

/**
 * Create inbound context payload for AI agent dispatch.
 * Centralized context construction to avoid code duplication.
 *
 * @param params - Parameters including runtime, message, config, and accountId
 * @returns Inbound context payload with routing information
 *
 * @example
 * ```typescript
 * const context = createInboundContext({
 *   rt, msg, config, accountId, cfg
 * });
 * // Returns: { ctxPayload, matchedBy, agentId }
 * ```
 */
export function createInboundContext(params: {
  rt: ReturnType<typeof getZTMRuntime>;
  msg: ZTMChatMessage;
  config: ZTMChatConfig;
  accountId: string;
  cfg?: Record<string, unknown>;
}) {
  const { rt, msg, config, accountId, cfg = {} } = params;

  const isGroup = Boolean(msg.isGroup);
  const groupLabel = msg.groupId
    ? msg.groupCreator
      ? `${msg.groupCreator}/${msg.groupId}`
      : msg.groupId
    : msg.groupCreator;

  const route = rt.channel.routing.resolveAgentRoute({
    channel: ZTM_CHANNEL_ID,
    accountId,
    peer: isGroup
      ? { kind: 'group' as const, id: groupLabel ?? msg.sender }
      : { kind: 'direct' as const, id: msg.sender },
    cfg,
  });

  return {
    ctxPayload: rt.channel.reply.finalizeInboundContext({
      Body: msg.content,
      RawBody: msg.content,
      CommandBody: msg.content,
      From: formatZTMAddress(msg.sender),
      To: formatZTMAddress(config.username),
      SessionKey: route.sessionKey,
      AccountId: route.accountId,
      ChatType: isGroup ? ('group' as const) : ('direct' as const),
      ConversationLabel: isGroup ? (groupLabel ?? msg.sender) : msg.sender,
      SenderName: msg.sender,
      SenderId: msg.sender,
      Provider: ZTM_CHANNEL_ID,
      Surface: ZTM_CHANNEL_ID,
      MessageSid: msg.id,
      Timestamp: msg.timestamp,
      OriginatingChannel: ZTM_CHANNEL_ID,
      OriginatingTo: formatZTMAddress(msg.sender),
    }),
    matchedBy: route.matchedBy,
    agentId: route.agentId,
  };
}

/**
 * Handle inbound message dispatch to AI agent
 *
 * **ADR-010 Layer 4**: Dispatch layer.
 *
 * Note: Policy checks (ADR-010 Layer 3) are now performed BEFORE this function:
 * - DM messages: checkMessagePolicy in processPeerMessage
 * - Group messages: checkMessagePolicy in processGroupMessage
 *
 * This function only handles routing to the AI agent (Layer 4 responsibility).
 *
 * @param state - Account runtime state
 * @param rt - ZTM runtime
 * @param cfg - OpenClaw configuration
 * @param config - ZTM Chat configuration
 * @param accountId - Account identifier
 * @param ctx - Log context
 * @param msg - Chat message
 * @returns void
 *
 * @example
 * ```typescript
 * await handleInboundMessage(state, rt, cfg, config, accountId, ctx, msg);
 * // Dispatches message to AI agent for processing
 * ```
 */
export async function handleInboundMessage(
  state: AccountRuntimeState,
  rt: ReturnType<typeof getZTMRuntime>,
  cfg: Record<string, unknown>,
  config: ZTMChatConfig,
  accountId: string,
  ctx: { log?: { info: (...args: unknown[]) => void; error?: (...args: unknown[]) => void } },
  msg: ZTMChatMessage
): Promise<void> {
  try {
    // Policy check removed - already done earlier in pipeline (ADR-010 Layer 3)

    const { ctxPayload, matchedBy, agentId } = createInboundContext({
      rt,
      msg,
      config,
      accountId,
      cfg,
    });

    ctx.log?.info(
      `[${accountId}] Dispatching message from ${msg.sender} to AI agent (route: ${matchedBy})`
    );

    const { queuedFinal } = await rt.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg,
      dispatcherOptions: {
        humanDelay: rt.channel.reply.resolveHumanDelayConfig(cfg, agentId),
        deliver: async (payload: { text?: string; mediaUrl?: string }) => {
          const replyText = payload.text ?? '';
          if (!replyText) return;
          const groupInfo =
            msg.isGroup && msg.groupId && msg.groupCreator
              ? { creator: msg.groupCreator, group: msg.groupId }
              : undefined;
          await sendZTMMessage(state, msg.sender, replyText, groupInfo);
          ctx.log?.info(
            `[${accountId}] Sent reply to ${msg.sender}: ${replyText.substring(0, 100)}${replyText.length > 100 ? '...' : ''}`
          );
        },
        onError: (err: unknown) => {
          ctx.log?.error?.(
            `[${accountId}] Reply delivery failed for ${msg.sender}: ${String(err)}`
          );
        },
      },
    });

    if (!queuedFinal) {
      ctx.log?.info(`[${accountId}] No response generated for message from ${msg.sender}`);
    }
  } catch (error) {
    const errorMsg = extractErrorMessage(error);
    ctx.log?.error?.(`[${accountId}] Failed to dispatch message from ${msg.sender}: ${errorMsg}`);
  }
}

/**
 * Create message callback for inbound messages
 *
 * @param accountId - Account identifier
 * @param config - ZTM Chat configuration
 * @param rt - ZTM runtime
 * @param cfg - OpenClaw configuration
 * @param state - Account runtime state
 * @param ctx - Log context
 * @returns Message callback function
 *
 * @example
 * ```typescript
 * const callback = createMessageCallback('default', config, rt, cfg, state, ctx);
 * callback(message); // Handles inbound message dispatch
 * ```
 */
export function createMessageCallback(
  accountId: string,
  config: ZTMChatConfig,
  rt: ReturnType<typeof getZTMRuntime>,
  cfg: Record<string, unknown> | undefined,
  state: AccountRuntimeState,
  ctx: { log?: { info: (...args: unknown[]) => void } }
): (msg: ZTMChatMessage) => Promise<void> {
  return async (msg: ZTMChatMessage) => {
    let msgType: string;
    if (msg.isGroup) {
      const name = msg.groupName;
      const id = msg.groupId;
      msgType = name ? `group "${name}" (${id})` : `group ${id}`;
    } else {
      msgType = `peer "${msg.sender}"`;
    }
    ctx.log?.info(
      `[${accountId}] Received ${msgType} message: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`
    );

    // Call the handler
    await handleInboundMessage(state, rt, cfg ?? {}, config, accountId, ctx, msg);
  };
}
