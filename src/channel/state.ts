/**
 * ZTM Chat State Management
 * @module channel/state
 * Account snapshot building and state utilities
 */

import type { ZTMChatConfig } from '../types/config.js';
import { isConfigMinimallyValid } from '../config/validation.js';
import { getAllAccountStates } from '../runtime/state.js';
import type { ResolvedZTMChatAccount } from './config.js';
import { resolvePermitPath } from '../utils/paths.js';
import { loadPermitFromFile } from '../connectivity/permit.js';
import { getCertificateExpiryStatus } from '../utils/certificate.js';
import { formatTimestampToLocalTz } from '../utils/format.js';

// ============================================================================
// Build Account Snapshot
// ============================================================================

/**
 * Build account snapshot for status display
 *
 * @param account - The resolved ZTM Chat account
 * @returns Account snapshot with status information
 *
 * @example
 * ```typescript
 * const snapshot = buildAccountSnapshot({ account: resolvedAccount });
 * // Returns: { accountId: 'default', name: 'mybot', enabled: true, configured: true, running: true, ... }
 * ```
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
  lastEventAt: number | null;
  // Credential snapshot fields for OpenClaw status display
  credentialSource?: string;
  meshName?: string;
  // Certificate expiry fields
  certExpiryDate?: string | null;
  certDaysUntilExpiry?: number | null;
  certIsExpired?: boolean | null;
} {
  const accountStates = getAllAccountStates();
  const state = accountStates.get(account.accountId);
  const config = account.config;

  // Build credentialSource: format as "server:<url>" or "file:<path>"
  const credentialSource =
    config.permitSource === 'server'
      ? `server:${config.permitUrl}`
      : `file:${config.permitFilePath}`;

  // Get certificate from permit file
  const permitPath = resolvePermitPath(account.accountId);
  const permitData = loadPermitFromFile(permitPath);

  let certExpiryDate: string | null = null;
  let certDaysUntilExpiry: number | null = null;
  let certIsExpired: boolean | null = null;

  if (permitData?.agent?.certificate) {
    const expiryStatus = getCertificateExpiryStatus(permitData.agent.certificate);

    // Handle parse error - mark as expired so system doesn't trust the certificate
    if (expiryStatus.parseError) {
      certIsExpired = null; // Indicates parsing failed
    } else {
      // Only format certExpiryDate as local timezone string when parsing succeeds
      certExpiryDate = formatTimestampToLocalTz(expiryStatus.expiryDate);
      certDaysUntilExpiry = expiryStatus.daysUntilExpiry;
      certIsExpired = expiryStatus.isExpired;
    }
  }

  return {
    accountId: account.accountId,
    name: account.username,
    enabled: account.enabled,
    configured: isConfigMinimallyValid(config as ZTMChatConfig),
    running: state?.started ?? false,
    lastStartAt: state?.lastStartAt ? Number(state.lastStartAt) : null,
    lastStopAt: state?.lastStopAt ? Number(state.lastStopAt) : null,
    lastError: state?.lastError ?? null,
    lastInboundAt: state?.lastInboundAt ? Number(state.lastInboundAt) : null,
    lastOutboundAt: state?.lastOutboundAt ? Number(state.lastOutboundAt) : null,
    // lastEventAt: 取 lastInboundAt 和 lastOutboundAt 中更近的时间，表示最后有活动的时间
    lastEventAt: (() => {
      const inbound = state?.lastInboundAt ? Number(state.lastInboundAt) : 0;
      const outbound = state?.lastOutboundAt ? Number(state.lastOutboundAt) : 0;
      const max = Math.max(inbound, outbound);
      return max > 0 ? max : null;
    })(),
    // Credential snapshot fields
    credentialSource,
    meshName: config.meshName,
    // Certificate expiry fields
    certExpiryDate,
    certDaysUntilExpiry,
    certIsExpired,
  };
}
