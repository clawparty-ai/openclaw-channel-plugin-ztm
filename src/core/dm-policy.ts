/**
 * DM (Direct Message) Policy enforcement for ZTM Chat
 * @module core/dm-policy
 *
 * Controls which users can send messages based on policy configuration.
 *
 * DM Policy Types:
 * - "allow": Allow all messages (open policy)
 * - "deny": Block all messages from unknown users (closed policy)
 * - "pairing": Require pairing approval before accepting messages
 */

import type { ZTMChatConfig } from '../types/config.js';
import type { MessageCheckResult } from '../types/messaging.js';
import { getOrDefault } from '../utils/guards.js';
import { normalizeUsername } from '../utils/validation.js';

/**
 * Check if a sender is allowed to send messages based on DM policy.
 *
 * This function evaluates multiple sources to determine if a message should be
 * processed:
 * 1. Config allowFrom whitelist (static)
 * 2. Store allowFrom whitelist (persisted pairing approvals)
 * 3. DM policy configuration (allow/deny/pairing)
 *
 * @param sender - The username of the message sender
 * @param config - The ZTM Chat configuration including dmPolicy and allowFrom
 * @param storeAllowFrom - Optional array of approved usernames from persistent store
 * @returns MessageCheckResult with allowed flag, reason, and recommended action
 *
 * @example
 * // Check if Alice can send messages (pairing mode)
 * const result = checkDmPolicy("alice", { dmPolicy: "pairing", allowFrom: [] });
 * // result: { allowed: false, reason: "pending", action: "request_pairing" }
 *
 * @example
 * // Check if whitelisted user can send (deny mode)
 * const result = checkDmPolicy("alice", { dmPolicy: "deny", allowFrom: ["alice"] });
 * // result: { allowed: true, reason: "whitelisted", action: "process" }
 */
export function checkDmPolicy(
  sender: string,
  config: ZTMChatConfig,
  storeAllowFrom: string[] | null | undefined = []
): MessageCheckResult {
  // Reject empty or whitespace-only sender (security: prevent spoofing)
  if (!sender || !sender.trim()) {
    return { allowed: false, reason: 'denied', action: 'ignore' };
  }

  // Normalize sender for comparison
  const normalizedSender = normalizeUsername(sender);

  // Reject sender with only special characters (normalizes to empty string)
  if (!normalizedSender) {
    return { allowed: false, reason: 'denied', action: 'ignore' };
  }

  const allowFrom = getOrDefault(config.allowFrom, []);
  const isWhitelisted =
    allowFrom.length > 0 && allowFrom.some(entry => normalizeUsername(entry) === normalizedSender);

  if (isWhitelisted) {
    return { allowed: true, reason: 'whitelisted', action: 'process' };
  }

  // Safely handle null/undefined storeAllowFrom
  const safeStoreAllowFrom = storeAllowFrom ?? [];
  const isStoreApproved =
    safeStoreAllowFrom.length > 0 &&
    safeStoreAllowFrom.some(entry => normalizeUsername(entry) === normalizedSender);

  if (isStoreApproved) {
    return { allowed: true, reason: 'whitelisted', action: 'process' };
  }

  const policy = config.dmPolicy ?? 'pairing';

  switch (policy) {
    case 'allow':
      return { allowed: true, reason: 'allowed', action: 'process' };

    case 'deny':
      return { allowed: false, reason: 'denied', action: 'ignore' };

    case 'pairing':
      return { allowed: false, reason: 'pending', action: 'request_pairing' };

    default:
      // Security: Fail-closed for unknown/invalid policy values
      // This prevents configuration errors from opening security holes
      return { allowed: false, reason: 'denied', action: 'ignore' };
  }
}

/**
 * Check if a username is whitelisted in either config or store allowFrom lists.
 *
 * Whitelisted users bypass DM policy restrictions and can always send messages.
 * This checks both the static config.allowFrom array and the persistent storeAllowFrom array.
 *
 * @param username - The username to check
 * @param config - The ZTM Chat configuration containing allowFrom list
 * @param storeAllowFrom - Optional array of approved usernames from persistent store
 * @returns true if username is whitelisted in either source, false otherwise
 *
 * @example
 * // Check if user is whitelisted
 * const isAllowed = isUserWhitelisted("alice", { allowFrom: ["alice", "bob"] }, []);
 * // isAllowed: true
 */
export function isUserWhitelisted(
  username: string,
  config: ZTMChatConfig,
  storeAllowFrom: string[] | null | undefined = []
): boolean {
  // Handle null/undefined username
  if (!username) {
    return false;
  }

  const normalized = normalizeUsername(username);

  // Empty after normalization means invalid username
  if (!normalized) {
    return false;
  }

  const allowFrom = getOrDefault(config.allowFrom, []);

  const inConfig = allowFrom.some(entry => normalizeUsername(entry) === normalized);
  const inStore = (storeAllowFrom ?? []).some(entry => normalizeUsername(entry) === normalized);

  return inConfig || inStore;
}

/**
 * Check if DM policy is set to pairing mode.
 *
 * In pairing mode, unknown users cannot send messages until they are approved
 * through a pairing request. This is the default secure mode.
 *
 * @param config - The ZTM Chat configuration
 * @returns true if dmPolicy is "pairing", false otherwise
 *
 * @example
 * const isPairing = isPairingMode({ dmPolicy: "pairing", allowFrom: [] });
 * // isPairing: true
 */
export function isPairingMode(config: ZTMChatConfig): boolean {
  return config.dmPolicy === 'pairing';
}
