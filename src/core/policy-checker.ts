/**
 * Unified Policy Checking for ZTM Chat
 * @module core/policy-checker
 *
 * **ADR-010 Layer 3**: This module implements the Policy Enforcement layer
 * of the multi-layer message processing pipeline defined in ADR-010.
 *
 * Provides centralized policy checking for both DM and Group messages.
 * Ensures consistent policy enforcement across all message types.
 *
 * Key design principle:
 * - **DM messages**: Check DM policy (pairing/allowlist/deny modes)
 * - **Group messages**: Check ONLY Group policy (DM policy is NOT applied)
 *
 * This fixes the critical bug where dmPolicy:deny was incorrectly rejecting
 * group messages.
 */

import type { ZTMChatConfig } from '../types/config.js';
import { ZTMConfigError } from '../types/errors.js';
import { checkDmPolicy } from './dm-policy.js';
import { checkGroupPolicy } from './group-policy.js';
import { getGroupPermissionCached } from '../runtime/state.js';

/**
 * Result of a unified policy check
 */
export interface PolicyCheckResult {
  /** Whether the message is allowed to proceed */
  allowed: boolean;
  /** Reason for the policy decision (e.g., 'allowed', 'whitelisted', 'mention_required') */
  reason: string;
  /** Action to take (process, ignore, request_pairing) */
  action: 'process' | 'ignore' | 'request_pairing';
}

/**
 * Input parameters for unified policy checking
 */
export interface PolicyCheckInput {
  /** Sender username */
  sender: string;
  /** Message content */
  content: string;
  /** ZTM Chat configuration */
  config: ZTMChatConfig;
  /** Account identifier for caching */
  accountId: string;
  /** Persisted allowFrom list (for DM policy) */
  storeAllowFrom?: string[];
  /** Group information (required for group messages) */
  groupInfo?: { creator: string; group: string };
}

/**
 * Result of input validation
 * @internal
 */
interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validate policy check input parameters.
 *
 * Performs early validation to ensure all required parameters are present and valid.
 * This prevents invalid inputs from propagating deep into the call stack.
 *
 * @param input - The input to validate
 * @returns Validation result
 * @throws {ZTMConfigError} If required parameters (config, accountId) are missing
 * @internal
 */
function validatePolicyInput(input: {
  sender: unknown;
  content: unknown;
  config: unknown;
  accountId: unknown;
}): ValidationResult {
  // Validate sender
  if (typeof input.sender !== 'string') {
    return { valid: false, reason: 'denied' };
  }

  if (!input.sender || !input.sender.trim()) {
    return { valid: false, reason: 'denied' };
  }

  // Validate content (required for group mentions check)
  if (typeof input.content !== 'string') {
    return { valid: false, reason: 'denied' };
  }

  // Validate required config
  if (!input.config || typeof input.config !== 'object') {
    throw new ZTMConfigError({
      field: 'config',
      reason: 'config is required for policy check',
    });
  }

  // Validate required accountId
  if (!input.accountId || typeof input.accountId !== 'string') {
    throw new ZTMConfigError({
      field: 'accountId',
      reason: 'accountId is required for policy check',
    });
  }

  return { valid: true };
}

/**
 * Check if a message should be allowed based on unified policy.
 *
 * This is the unified policy checking function (ADR-010 Layer 3) that handles
 * both DM and Group messages.
 *
 * **For group messages**: It ONLY checks group policy (NOT DM policy).
 * This ensures group messages are not incorrectly rejected by DM policy settings.
 *
 * **For DM messages**: It checks DM policy (pairing/allowlist/deny modes).
 *
 * @param input - Policy check parameters
 * @returns Policy check result with allowed flag and action
 *
 * @example
 * // Check DM message policy
 * const dmResult = checkMessagePolicy({
 *   sender: 'alice',
 *   content: 'Hello',
 *   config: { dmPolicy: 'pairing', allowFrom: [], ... },
 *   accountId: 'account-123',
 *   storeAllowFrom: []
 * });
 *
 * @example
 * // Check group message policy (DM policy is NOT applied)
 * const groupResult = checkMessagePolicy({
 *   sender: 'bob',
 *   content: '@bot help',
 *   config: { groupPolicy: 'open', ... },
 *   accountId: 'account-123',
 *   groupInfo: { creator: 'alice', group: 'team-chat' }
 * });
 */
export function checkMessagePolicy(input: PolicyCheckInput): PolicyCheckResult {
  const { sender, content, config, accountId, storeAllowFrom = [], groupInfo } = input;

  // Early validation: fail fast for invalid inputs
  const validationResult = validatePolicyInput({ sender, content, config, accountId });
  if (!validationResult.valid) {
    return {
      allowed: false,
      reason: validationResult.reason ?? 'denied',
      action: 'ignore',
    };
  }

  // Group message: Check ONLY group policy (NOT DM policy)
  // This is the key fix for the double-policy-check bug
  if (groupInfo) {
    const permissions = getGroupPermissionCached(
      accountId,
      groupInfo.creator,
      groupInfo.group,
      config
    );

    const groupResult = checkGroupPolicy(sender, content, permissions, config.username);

    return {
      allowed: groupResult.allowed,
      reason: groupResult.reason,
      action: groupResult.action as 'process' | 'ignore',
    };
  }

  // DM message: Check DM policy
  const dmResult = checkDmPolicy(sender, config, storeAllowFrom);

  return {
    allowed: dmResult.allowed,
    reason: dmResult.reason ?? 'denied',
    action: dmResult.action ?? 'ignore',
  };
}

/**
 * Check if group policy is enabled for a specific group.
 *
 * @param creator - Group creator username
 * @param group - Group ID
 * @param config - ZTM Chat configuration
 * @param accountId - Account identifier for caching
 * @returns true if group policy is NOT 'disabled'
 */
export function isGroupPolicyEnabled(
  creator: string,
  group: string,
  config: ZTMChatConfig,
  accountId: string
): boolean {
  const permissions = getGroupPermissionCached(accountId, creator, group, config);
  return permissions.groupPolicy !== 'disabled';
}
