/**
 * Connectivity Management for ZTM Chat
 * @module channel/connectivity-manager
 * Handles agent connectivity, permit loading, and mesh joining
 */

import * as fs from 'fs';
import type { ZTMChatConfig } from '../types/config.js';
import type { ZTMMeshInfo } from '../api/ztm-api.js';
import { isSuccess } from '../types/common.js';
import { resolvePermitPath } from '../utils/paths.js';
import { checkPortOpen, getIdentity, joinMesh } from '../connectivity/mesh.js';
import { createZTMApiClient } from '../api/ztm-api.js';
import { requestPermit, savePermitData, loadPermitFromFile } from '../connectivity/permit.js';
import type { PermitData } from '../types/connectivity.js';
import { PROBE_TIMEOUT_MS } from '../constants.js';
import { containsPathTraversal } from '../utils/validation.js';

/**
 * Validate connectivity to ZTM agent
 *
 * @param agentUrl - The URL of the ZTM agent to validate
 * @param _ctx - Optional context with logger for debugging
 * @returns Promise that resolves if connectivity is valid, throws if unreachable
 */
export async function validateAgentConnectivity(
  agentUrl: string,
  _ctx?: { log?: { info: (...args: unknown[]) => void } }
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

    // Security: Validate permitFilePath against path traversal attacks
    if (containsPathTraversal(config.permitFilePath)) {
      throw new Error('permitFilePath contains invalid path traversal patterns');
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
    if (!config.permitUrl) {
      throw new Error('permitUrl is required when permitSource is server');
    }
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
 * Configure agent before joining mesh
 * Similar to `ztm config --agent <host:port>` - sets up the agent configuration
 * This ensures the agent is properly configured before attempting to join mesh
 *
 * @param config - ZTM chat configuration including agentUrl
 * @param ctx - Context with logger
 */
export async function configureAgent(
  config: ZTMChatConfig,
  ctx: { log?: { info: (...args: unknown[]) => void } }
): Promise<void> {
  // Parse agent URL to get host:port
  const agentUrlObj = new URL(config.agentUrl);
  const agentHost = agentUrlObj.hostname;
  const agentPort = agentUrlObj.port || (agentUrlObj.protocol === 'https:' ? '443' : '80');

  ctx.log?.info(`Configuring agent: ${agentHost}:${agentPort}`);

  // Verify the agent is reachable
  const isReachable = await checkPortOpen(agentHost, parseInt(agentPort.toString(), 10));
  if (!isReachable) {
    throw new Error(`Agent not reachable at ${config.agentUrl}`);
  }

  ctx.log?.info(`Agent configured: ${agentHost}:${agentPort}`);
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
  // Create API client directly
  const preCheckClient = createZTMApiClient(config);
  let alreadyConnected = false;
  let meshUsername: string | undefined;
  const preCheckResult = await preCheckClient.getMeshInfo();
  if (isSuccess(preCheckResult)) {
    alreadyConnected = preCheckResult.value.connected;
    meshUsername = preCheckResult.value.username;
  }

  if (alreadyConnected) {
    // Strict mode: also check username match
    if (meshUsername === config.username) {
      ctx.log?.info(
        `Already connected to mesh ${config.meshName} as ${meshUsername}, skipping join`
      );
      return;
    }
    ctx.log?.info(
      `Connected as ${meshUsername}, but config expects ${config.username}, re-joining...`
    );
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
  meshConnected: boolean;
  meshInfo?: ZTMMeshInfo;
}> {
  if (!config?.agentUrl) {
    return {
      ok: false,
      error: 'No agent URL configured',
      meshConnected: false,
    };
  }

  const apiClient = createZTMApiClient(config);
  const meshResult = await apiClient.getMeshInfo();

  if (!meshResult.ok || !meshResult.value) {
    return {
      ok: false,
      error: meshResult.error?.message ?? 'Unknown error',
      meshConnected: false,
    };
  }

  const meshInfo = meshResult.value;
  return {
    ok: true,
    error: null,
    meshConnected: meshInfo.connected,
    meshInfo,
  };
}

/**
 * Resolve permit path for a specific account using cross-platform compatible path resolution
 *
 * @param accountId - The account identifier
 * @returns The resolved path to the permit file
 */
export function resolveAccountPermitPath(accountId: string): string {
  return resolvePermitPath(accountId);
}
