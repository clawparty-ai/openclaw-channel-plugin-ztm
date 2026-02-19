// ZTM Permit management

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger.js';
import { getZTMRuntime } from '../runtime/index.js';
import type { ZTMMessage } from '../api/ztm-api.js';
import type { AccountRuntimeState } from '../runtime/state.js';
import { normalizeUsername } from '../utils/validation.js';
import { extractErrorMessage } from '../utils/error.js';
import { getOrDefault } from '../utils/guards.js';
import type { PermitData } from '../types/connectivity.js';

/**
 * Request permit from permit server
 *
 * The permit server returns a complete permit package including:
 * - ca: The mesh's CA certificate
 * - agent.certificate: Certificate for this endpoint (signed by CA)
 * - agent.privateKey: Private key for this endpoint
 * - bootstraps: List of hub addresses to connect to
 */
export async function requestPermit(
  permitUrl: string,
  publicKey: string,
  username: string
): Promise<PermitData | null> {
  try {
    const response = await fetch(permitUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        PublicKey: publicKey,
        UserName: username,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Permit request failed: ${response.status} ${errorText}`);
      return null;
    }

    const permitData = (await response.json()) as PermitData;

    // Validate required fields
    if (!permitData.ca) {
      logger.error('Permit missing CA certificate');
      return null;
    }
    if (!permitData.agent?.certificate) {
      logger.error('Permit missing agent certificate');
      return null;
    }
    if (!Array.isArray(permitData.bootstraps)) {
      logger.error('Permit missing bootstraps');
      return null;
    }

    logger.info('Permit request successful');
    return permitData;
  } catch (error) {
    const errorMsg = extractErrorMessage(error);
    logger.error(`Permit request error: ${errorMsg}`);
    return null;
  }
}

// Save permit data to file
export function savePermitData(permitData: PermitData, permitPath: string): boolean {
  try {
    // Ensure directory exists
    const dir = path.dirname(permitPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(permitPath, JSON.stringify(permitData, null, 2));
    logger.info(`Permit data saved to ${permitPath}`);
    return true;
  } catch (error) {
    const errorMsg = extractErrorMessage(error);
    logger.error(`Failed to save permit data: ${errorMsg}`);
    return false;
  }
}

/**
 * Load permit data from a local file
 */
export function loadPermitFromFile(filePath: string): PermitData | null {
  try {
    if (!fs.existsSync(filePath)) {
      logger.error(`Permit file not found: ${filePath}`);
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const permitData = JSON.parse(content) as PermitData;
    logger.info(`Permit loaded from file: ${filePath}`);
    return permitData;
  } catch (error) {
    const errorMsg = extractErrorMessage(error);
    logger.error(`Failed to load permit from file: ${errorMsg}`);
    return null;
  }
}

// Handle pairing request - send a pairing request message to the peer
export async function handlePairingRequest(
  state: AccountRuntimeState,
  peer: string,
  context: string,
  storeAllowFrom: string[] = []
): Promise<void> {
  const { config, apiClient } = state;
  if (!apiClient) return;

  const normalizedPeer = normalizeUsername(peer);

  const allowFrom = getOrDefault(config.allowFrom, []);
  if (allowFrom.some(entry => normalizeUsername(entry) === normalizedPeer)) {
    logger.debug(`[${state.accountId}] ${peer} is already approved`);
    return;
  }

  // Check if already approved via pairing store (persisted across restarts)
  if (
    storeAllowFrom.length > 0 &&
    storeAllowFrom.some(entry => normalizeUsername(entry) === normalizedPeer)
  ) {
    logger.debug(`[${state.accountId}] ${peer} is already approved via pairing store`);
    return;
  }

  // Check if already in pending pairings (prevents duplicate requests in same session)
  const existingTimestamp = state.pendingPairings.get(normalizedPeer);
  if (existingTimestamp) {
    logger.debug(
      `[${state.accountId}] ${peer} already has pending pairing request (created at ${existingTimestamp.toISOString()})`
    );
    return;
  }

  // Register pairing request with openclaw's pairing store
  let pairingCode = '';
  let pairingCreated = false;
  try {
    const rt = getZTMRuntime();
    const { code, created } = await rt.channel.pairing.upsertPairingRequest({
      channel: 'ztm-chat',
      id: normalizedPeer,
      meta: { name: peer },
    });
    pairingCode = code;
    pairingCreated = created;
    if (pairingCreated) {
      // Track pending pairing in memory for deduplication and expiration
      state.pendingPairings.set(normalizedPeer, new Date());
      logger.info(`[${state.accountId}] Registered new pairing request for ${peer} (code=${code})`);
    }
  } catch (error) {
    logger.warn(
      `[${state.accountId}] Failed to register pairing request in store for ${peer}: ${error}`
    );
  }

  // Build pairing reply message using openclaw's standard format
  let messageText: string;
  if (pairingCode) {
    try {
      const rt = getZTMRuntime();
      messageText = rt.channel.pairing.buildPairingReply({
        channel: 'ztm-chat',
        idLine: `Your ZTM Chat username: ${peer}`,
        code: pairingCode,
      });
    } catch {
      // Fallback if buildPairingReply is unavailable
      messageText =
        `[🤖 PAIRING REQUEST]\n\nUser "${peer}" wants to send messages to your OpenClaw ZTM Chat bot.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Pairing code: ${pairingCode}\n\n` +
        `To approve this user, run:\n` +
        `  openclaw pairing approve ztm-chat ${pairingCode}\n\n` +
        `To deny this request, run:\n` +
        `  openclaw pairing deny ztm-chat ${pairingCode}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━`;
    }
  } else {
    messageText =
      `[🤖 PAIRING REQUEST]\n\nUser "${peer}" wants to send messages to your OpenClaw ZTM Chat bot.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `To approve this user, run:\n` +
      `  openclaw pairing approve ztm-chat ${peer}\n\n` +
      `To deny this request, run:\n` +
      `  openclaw pairing deny ztm-chat ${peer}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Note: Your bot is in "pairing" mode, which requires explicit approval for new users.`;
  }

  // Only send pairing message to the peer if this is a newly created request
  if (pairingCreated) {
    const pairingMessage: ZTMMessage = {
      time: Date.now(),
      message: messageText,
      sender: config.username,
    };

    try {
      await apiClient.sendPeerMessage(peer, pairingMessage);
      logger.info(`[${state.accountId}] Sent pairing request to ${peer}`);
    } catch (error) {
      logger.warn(`[${state.accountId}] Failed to send pairing request to ${peer}: ${error}`);
    }
  } else {
    logger.debug(
      `[${state.accountId}] Pairing request already exists for ${peer}, not re-sending message`
    );
  }
}
