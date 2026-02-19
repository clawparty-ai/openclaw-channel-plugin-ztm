// Status Operations for ZTM Chat Channel Plugin
// Handles runtime status collection and channel summaries

import type { ChannelAccountSnapshot as BaseChannelAccountSnapshot } from 'openclaw/plugin-sdk';

/**
 * Extended snapshot type with additional ZTM-specific properties
 */
export interface ChannelAccountSnapshot extends BaseChannelAccountSnapshot {
  meshConnected?: boolean;
  peerCount?: number;
}

/**
 * Interface for buildChannelSummary function parameters
 */
export interface BuildChannelSummaryContext {
  snapshot: ChannelAccountSnapshot;
}

/**
 * Interface for status issues
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
 *
 * @param snapshot - Account snapshot to convert
 * @returns Channel summary object
 */
export function buildChannelSummary({ snapshot }: BuildChannelSummaryContext) {
  const extendedSnapshot = snapshot;
  return {
    configured: snapshot.configured ?? false,
    running: snapshot.running ?? false,
    connected: extendedSnapshot.meshConnected ?? false,
    lastStartAt: snapshot.lastStartAt ?? null,
    lastStopAt: snapshot.lastStopAt ?? null,
    lastError: snapshot.lastError ?? null,
    lastInboundAt: snapshot.lastInboundAt ?? null,
    lastOutboundAt: snapshot.lastOutboundAt ?? null,
    peerCount: extendedSnapshot.peerCount ?? 0,
  };
}

/**
 * Default runtime status for accounts that haven't been initialized yet
 *
 * @returns Default channel account snapshot
 */
export function getDefaultStatus(): ChannelAccountSnapshot {
  return {
    accountId: 'default',
    running: false,
    connected: false,
    meshConnected: false,
    lastStartAt: null,
    lastStopAt: null,
    lastError: null,
    lastInboundAt: null,
    lastOutboundAt: null,
    peerCount: 0,
  };
}
