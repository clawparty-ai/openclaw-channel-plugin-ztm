/**
 * @fileoverview ZTM Chat State Management
 * @module channel/state
 * Account snapshot building and state utilities
 */

import type { ZTMChatConfig } from '../types/config.js';
import { isConfigMinimallyValid } from '../config/validation.js';
import { getAllAccountStates } from '../runtime/state.js';
import type { ResolvedZTMChatAccount } from './config.js';

// ============================================================================
// Build Account Snapshot
// ============================================================================

/**
 * Build account snapshot for status display
 */
export function buildAccountSnapshot({ account }: { account: ResolvedZTMChatAccount }): {
  accountId: string;
  name: string;
  enabled: boolean;
  configured: boolean;
  running: boolean;
  lastStartAt: number | null;
  lastStopAt: number | null;
  lastError: string | null;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
} {
  const accountStates = getAllAccountStates();
  const state = accountStates.get(account.accountId);

  // running: process state - watcher is active
  const running = state?.started ?? false;

  return {
    accountId: account.accountId,
    name: account.username,
    enabled: account.enabled,
    configured: isConfigMinimallyValid(account.config as ZTMChatConfig),
    running,
    lastStartAt: state?.lastStartAt ? Number(state.lastStartAt) : null,
    lastStopAt: state?.lastStopAt ? Number(state.lastStopAt) : null,
    lastError: state?.lastError ?? null,
    lastInboundAt: state?.lastInboundAt ? Number(state.lastInboundAt) : null,
    lastOutboundAt: state?.lastOutboundAt ? Number(state.lastOutboundAt) : null,
  };
}
