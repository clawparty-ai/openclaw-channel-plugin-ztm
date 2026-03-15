/**
 * Status Operations for ZTM Chat Channel Plugin
 * @module channel/status
 * Handles runtime status collection and channel summaries
 */

import type { ChannelAccountSnapshot as BaseChannelAccountSnapshot } from 'openclaw/plugin-sdk';
import { DEFAULT_ACCOUNT_ID } from '../constants.js';

/**
 * Extended snapshot type with ZTM custom fields
 *
 * @example
 * ```typescript
 * const snapshot: ChannelAccountSnapshot = {
 *   accountId: 'account-1',
 *   configured: true,
 *   running: true,
 *   credentialSource: 'permit-file',
 *   meshName: 'my-mesh',
 *   certDaysUntilExpiry: 30
 * };
 * ```
 */
export type ChannelAccountSnapshot = BaseChannelAccountSnapshot & {
  credentialSource?: string;
  meshName?: string;
  certExpiryDate?: string | null;
  certDaysUntilExpiry?: number | null;
  certIsExpired?: boolean;
};

/**
 * Interface for buildChannelSummary function parameters
 *
 * @example
 * ```typescript
 * const ctx: BuildChannelSummaryContext = {
 *   snapshot: {
 *     accountId: 'account-1',
 *     configured: true,
 *     running: true
 *   }
 * };
 * ```
 */
export interface BuildChannelSummaryContext {
  snapshot: ChannelAccountSnapshot;
}

/**
 * Interface for status issues
 *
 * @example
 * ```typescript
 * const issue: ChannelStatusIssue = {
 *   channel: 'ztm-chat',
 *   accountId: 'account-1',
 *   kind: 'auth',
 *   level: 'error',
 *   message: 'Certificate expired'
 * };
 * ```
 */
export interface ChannelStatusIssue {
  channel: string;
  accountId: string;
  kind: 'config' | 'intent' | 'permissions' | 'auth' | 'runtime';
  level?: 'error' | 'warn' | 'info';
  message: string;
}

/**
 * Builds channel summary from account snapshot
 *
 * Maps the account snapshot to a summary format with all relevant status fields.
 * Includes custom credential snapshot fields (credentialSource, meshName, certExpiry*, etc.)
 * Only certExpiryDate is formatted as local timezone string; other timestamp fields
 * remain as number | null per ChannelAccountSnapshot definition.
 *
 * @param snapshot - Account snapshot to convert
 * @returns Channel summary object with all fields
 *
 * @example
 * ```typescript
 * const snapshot = {
 *   accountId: 'account-1',
 *   configured: true,
 *   running: true,
 *   meshName: 'my-mesh',
 *   certDaysUntilExpiry: 30
 * };
 * const summary = buildChannelSummary({ snapshot });
 * console.log(summary.running); // true
 * ```
 */
export function buildChannelSummary({ snapshot }: BuildChannelSummaryContext) {
  return {
    // Base fields - pass through as-is (number | null)
    accountId: snapshot.accountId,
    configured: snapshot.configured ?? false,
    running: snapshot.running ?? false,
    lastStartAt: snapshot.lastStartAt ?? null,
    lastStopAt: snapshot.lastStopAt ?? null,
    lastError: snapshot.lastError ?? null,
    lastInboundAt: snapshot.lastInboundAt ?? null,
    lastOutboundAt: snapshot.lastOutboundAt ?? null,
    // Credential snapshot fields - pass through all custom fields
    ...(snapshot.credentialSource !== undefined && { credentialSource: snapshot.credentialSource }),
    ...(snapshot.meshName !== undefined && { meshName: snapshot.meshName }),
    // Certificate expiry fields - certExpiryDate is already formatted as string
    ...(snapshot.certExpiryDate !== undefined && { certExpiryDate: snapshot.certExpiryDate }),
    ...(snapshot.certDaysUntilExpiry !== undefined && {
      certDaysUntilExpiry: snapshot.certDaysUntilExpiry,
    }),
    ...(snapshot.certIsExpired !== undefined && { certIsExpired: snapshot.certIsExpired }),
  };
}

/**
 * Default runtime status for accounts that haven't been initialized yet
 *
 * @returns Default channel account snapshot
 */
export const defaultRuntime: ChannelAccountSnapshot = {
  accountId: DEFAULT_ACCOUNT_ID,
  running: false,
  lastStartAt: null,
  lastStopAt: null,
  lastError: null,
  lastInboundAt: null,
  lastOutboundAt: null,
};
