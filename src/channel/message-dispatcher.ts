// Message Dispatcher for ZTM Chat
// Handles inbound message context creation and dispatch to AI agents

import type { ZTMChatConfig } from "../types/config.js";
import type { ZTMChatMessage } from "../types/messaging.js";
import type { AccountRuntimeState } from "../runtime/state.js";
import { checkGroupPolicy } from "../core/group-policy.js";
import { getGroupPermissionCached } from "../runtime/state.js";
import { sendZTMMessage } from "../messaging/outbound.js";
import { getZTMRuntime } from "../runtime/index.js";
import { extractErrorMessage } from "../utils/error.js";

/**
 * Create inbound context payload for AI agent dispatch.
 * Centralized context construction to avoid code duplication.
 */
export function createInboundContext(params: {
  rt: ReturnType<typeof getZTMRuntime>;
  msg: ZTMChatMessage;
  config: ZTMChatConfig;
  accountId: string;
  cfg?: Record<string, unknown>;
}) {
  const { rt, msg, config, accountId, cfg = {} } = params;

  const route = rt.channel.routing.resolveAgentRoute({
    channel: "ztm-chat",
    accountId,
    peer: { kind: "direct" as const, id: msg.sender },
    cfg,
  });

  return {
    ctxPayload: rt.channel.reply.finalizeInboundContext({
      Body: msg.content,
      RawBody: msg.content,
      CommandBody: msg.content,
      From: `ztm-chat:${msg.sender}`,
      To: `ztm-chat:${config.username}`,
      SessionKey: route.sessionKey,
      AccountId: route.accountId,
      ChatType: "direct" as const,
      ConversationLabel: msg.sender,
      SenderName: msg.sender,
      SenderId: msg.sender,
      Provider: "ztm-chat",
      Surface: "ztm-chat",
      MessageSid: msg.id,
      Timestamp: msg.timestamp,
      OriginatingChannel: "ztm-chat",
      OriginatingTo: `ztm-chat:${msg.sender}`,
    }),
    matchedBy: route.matchedBy,
    agentId: route.agentId,
  };
}

/**
 * Check group policy for incoming group messages
 */
function checkGroupMessagePolicy(
  msg: ZTMChatMessage,
  config: ZTMChatConfig,
  accountId: string,
  ctx: { log?: { info: (...args: unknown[]) => void } }
): boolean {
  if (!msg.isGroup || !msg.groupId || !msg.groupCreator) {
    return true; // Not a group message, allow
  }

  const permissions = getGroupPermissionCached(accountId, msg.groupCreator, msg.groupId, config);
  const policyResult = checkGroupPolicy(
    msg.sender,
    msg.content,
    permissions,
    config.username
  );

  if (!policyResult.allowed) {
    ctx.log?.info(
      `[DM] Group message from ${msg.sender} blocked: ${policyResult.reason} (group: ${msg.groupCreator}/${msg.groupId})`
    );
    return false;
  }

  ctx.log?.info(
    `[DM] Group message from ${msg.sender} allowed: ${policyResult.reason}`
  );
  return true;
}

/**
 * Handle inbound message dispatch to AI agent
 */
export async function handleInboundMessage(
  state: AccountRuntimeState,
  rt: ReturnType<typeof getZTMRuntime>,
  cfg: Record<string, unknown>,
  config: ZTMChatConfig,
  accountId: string,
  ctx: { log?: { info: (...args: unknown[]) => void; error?: (...args: unknown[]) => void } },
  msg: ZTMChatMessage,
): Promise<void> {
  try {
    // Check group policy for group messages
    if (!checkGroupMessagePolicy(msg, config, accountId, ctx)) {
      return; // Don't process the message
    }

    const { ctxPayload, matchedBy, agentId } = createInboundContext({ rt, msg, config, accountId, cfg });

    ctx.log?.info(
      `[${accountId}] Dispatching message from ${msg.sender} to AI agent (route: ${matchedBy})`,
    );

    const { queuedFinal } =
      await rt.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
        ctx: ctxPayload,
        cfg,
        dispatcherOptions: {
          humanDelay: rt.channel.reply.resolveHumanDelayConfig(
            cfg,
            agentId,
          ),
          deliver: async (payload: { text?: string; mediaUrl?: string }) => {
            const replyText = payload.text ?? "";
            if (!replyText) return;
            const groupInfo = msg.isGroup && msg.groupId && msg.groupCreator
              ? { creator: msg.groupCreator, group: msg.groupId }
              : undefined;
            await sendZTMMessage(state, msg.sender, replyText, groupInfo);
            ctx.log?.info(
              `[${accountId}] Sent reply to ${msg.sender}: ${replyText.substring(0, 100)}${replyText.length > 100 ? "..." : ""}`,
            );
          },
          onError: (err: unknown) => {
            ctx.log?.error?.(
              `[${accountId}] Reply delivery failed for ${msg.sender}: ${String(err)}`,
            );
          },
        },
      });

    if (!queuedFinal) {
      ctx.log?.info(
        `[${accountId}] No response generated for message from ${msg.sender}`,
      );
    }
  } catch (error) {
    const errorMsg = extractErrorMessage(error);
    ctx.log?.error?.(
      `[${accountId}] Failed to dispatch message from ${msg.sender}: ${errorMsg}`,
    );
  }
}

/**
 * Create message callback for inbound messages
 */
export function createMessageCallback(
  accountId: string,
  config: ZTMChatConfig,
  rt: ReturnType<typeof getZTMRuntime>,
  cfg: Record<string, unknown> | undefined,
  state: AccountRuntimeState,
  ctx: { log?: { info: (...args: unknown[]) => void } }
): (msg: ZTMChatMessage) => void {
  return (msg: ZTMChatMessage) => {
    let msgType: string;
    if (msg.isGroup) {
      const name = msg.groupName;
      const id = msg.groupId;
      msgType = name ? `group "${name}" (${id})` : `group ${id}`;
    } else {
      msgType = `peer "${msg.sender}"`;
    }
    ctx.log?.info(
      `[${accountId}] Received ${msgType} message: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? "..." : ""}`,
    );

    // Call the handler
    handleInboundMessage(state, rt, cfg ?? {}, config, accountId, ctx, msg);
  };
}
