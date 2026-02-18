// Connectivity Management for ZTM Chat
// Handles agent connectivity, permit loading, and mesh joining

import * as fs from 'fs';
import type { ZTMChatConfig } from '../types/config.js';
import type { ZTMMeshInfo } from '../api/ztm-api.js';
import { createZTMApiClient } from '../api/ztm-api.js';
import { isSuccess } from '../types/common.js';
import { resolvePermitPath } from '../utils/paths.js';
import { checkPortOpen, getIdentity, joinMesh } from '../connectivity/mesh.js';
import { requestPermit, savePermitData, loadPermitFromFile } from '../connectivity/permit.js';
import type { PermitData } from '../types/connectivity.js';
import { PROBE_TIMEOUT_MS } from '../constants.js';

/**
 * Validate connectivity to ZTM agent
 */
export async function validateAgentConnectivity(
  agentUrl: string,
  _ctx: { log?: { info: (...args: unknown[]) => void } }
): Promise<void> {
  try {
    const agentUrlObj = new URL(agentUrl);
    const portStr = agentUrlObj.port || (agentUrlObj.protocol === 'https:' ? '443' : '80');
    const agentPort = parseInt(portStr, 10);
    const agentConnected = await checkPortOpen(agentUrlObj.hostname, agentPort);
    if (!agentConnected) {
      throw new Error(`Cannot connect to ZTM agent at ${agentUrl}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Cannot connect')) {
      throw error;
    }
    throw new Error(`Invalid ZTM agent URL: ${agentUrl}`);
  }
}

/**
 * Load or request permit data based on configuration
 */
export async function loadOrRequestPermit(
  config: ZTMChatConfig,
  permitPath: string,
  ctx: { log?: { info: (...args: unknown[]) => void } }
): Promise<PermitData> {
  if (config.permitSource === 'file') {
    // Load from file
    if (!config.permitFilePath) {
      throw new Error("permitFilePath is required when permitSource is 'file'");
    }
    ctx.log?.info(`Loading permit from file: ${config.permitFilePath}...`);
    const permitData = loadPermitFromFile(config.permitFilePath);
    if (!permitData) {
      throw new Error(`Failed to load permit from file: ${config.permitFilePath}`);
    }
    return permitData;
  }

  // Auto mode: Check if permit.json exists
  const permitExists = fs.existsSync(permitPath);

  if (!permitExists) {
    // Step 3: Get identity from ZTM Agent API
    ctx.log?.info('Getting identity from ZTM agent...');
    const publicKey = await getIdentity(config.agentUrl);
    if (!publicKey) {
      throw new Error('Failed to get identity from ZTM agent');
    }

    // Step 4: Request permit from permit server
    ctx.log?.info('Requesting permit from permit server...');
    const permitData = await requestPermit(config.permitUrl, publicKey, config.username);

    if (!permitData) {
      throw new Error('Failed to request permit from permit server');
    }

    // Step 5: Save permit data
    if (!savePermitData(permitData, permitPath)) {
      throw new Error('Failed to save permit data');
    }

    return permitData;
  }

  // Load existing permit
  const permitData = loadPermitFromFile(permitPath);
  if (!permitData) {
    throw new Error('Failed to load existing permit data');
  }
  return permitData;
}

/**
 * Join mesh if not already connected
 */
export async function joinMeshIfNeeded(
  config: ZTMChatConfig,
  endpointName: string,
  permitData: PermitData,
  ctx: { log?: { info: (...args: unknown[]) => void } }
): Promise<void> {
  const preCheckClient = createZTMApiClient(config);
  let alreadyConnected = false;
  const preCheckResult = await preCheckClient.getMeshInfo();
  if (isSuccess(preCheckResult)) {
    alreadyConnected = preCheckResult.value.connected;
  }

  if (alreadyConnected) {
    ctx.log?.info(`Already connected to mesh ${config.meshName}, skipping join`);
    return;
  }

  ctx.log?.info(`Joining mesh ${config.meshName} as ${endpointName} via API...`);
  const joinSuccess = await joinMesh(config.agentUrl, config.meshName, endpointName, permitData);
  if (!joinSuccess) {
    throw new Error('Failed to join mesh');
  }
}

/**
 * Probe an account to check connectivity
 */
export async function probeAccount({
  config,
  _timeoutMs = PROBE_TIMEOUT_MS,
}: {
  config: ZTMChatConfig;
  _timeoutMs?: number;
}): Promise<{
  ok: boolean;
  error: string | null;
  meshInfo?: ZTMMeshInfo;
}> {
  if (!config?.agentUrl) {
    return {
      ok: false,
      error: 'No agent URL configured',
    };
  }

  const apiClient = createZTMApiClient(config);
  const meshResult = await apiClient.getMeshInfo();

  if (!meshResult.ok || !meshResult.value) {
    return {
      ok: false,
      error: meshResult.error?.message ?? 'Unknown error',
    };
  }

  const meshInfo = meshResult.value;
  return {
    ok: meshInfo.connected,
    error: meshInfo.connected ? null : 'ZTM Agent is not connected to mesh',
    meshInfo,
  };
}

/**
 * Resolve permit path using cross-platform compatible path resolution
 */
export function resolveAccountPermitPath(): string {
  return resolvePermitPath();
}
