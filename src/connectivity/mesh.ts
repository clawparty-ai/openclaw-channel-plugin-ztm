// ZTM Mesh connectivity management via Agent API

import * as net from 'net';
import { logger } from '../utils/logger.js';
import type { PermitData } from '../types/connectivity.js';

/**
 * Check if a TCP port is open and accepting connections.
 *
 * This is a basic connectivity check used to verify if a ZTM agent
 * is reachable at the specified host and port.
 *
 * @param hostname - The hostname or IP address to check
 * @param port - The port number to check
 * @returns Promise resolving to true if port is open, false otherwise
 *
 * @example
 * const isOpen = await checkPortOpen("localhost", 7777);
 * // isOpen: true if agent is running
 */
export async function checkPortOpen(hostname: string, port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = new net.Socket();
    socket.setTimeout(5000);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, hostname);
  });
}

/**
 * Get identity (public key) from ZTM Agent API
 *
 * API: GET /api/identity
 * Returns: Public key in PEM format
 *
 * @param agentUrl - ZTM Agent URL (e.g., http://localhost:7777)
 * @returns Promise resolving to public key PEM string or null
 *
 * @example
 * const pubkey = await getIdentity("http://localhost:7777");
 * // pubkey: "-----BEGIN PUBLIC KEY-----\nMIIBIj...\n-----END PUBLIC KEY-----"
 */
export async function getIdentity(agentUrl: string): Promise<string | null> {
  try {
    const response = await fetch(`${agentUrl}/api/identity`, {
      method: 'GET',
      headers: {
        Accept: 'text/plain',
      },
    });

    if (!response.ok) {
      logger.error(`Failed to get identity: ${response.status} ${response.statusText}`);
      return null;
    }

    const publicKey = await response.text();

    if (
      !publicKey.includes('-----BEGIN PUBLIC KEY-----') ||
      !publicKey.includes('-----END PUBLIC KEY-----')
    ) {
      logger.error('Invalid identity format received from agent');
      return null;
    }

    return publicKey.trim();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to fetch identity: ${errorMsg}`);
    return null;
  }
}

/**
 * Join mesh via ZTM Agent API
 *
 * API: POST /api/meshes/{meshName}
 *
 * @param agentUrl - ZTM Agent URL
 * @param meshName - Name of the mesh to join
 * @param endpointName - Endpoint name for this agent
 * @param permitData - Complete permit data from permit server (contains CA, certificate, key, bootstraps)
 * @returns Promise resolving to true if join was successful
 *
 * @example
 * const success = await joinMesh(
 *   "http://localhost:7777",
 *   "my-mesh",
 *   "my-ep",
 *   permitData
 * );
 */
export async function joinMesh(
  agentUrl: string,
  meshName: string,
  endpointName: string,
  permitData: PermitData
): Promise<boolean> {
  try {
    const permit = {
      ca: permitData.ca,
      agent: {
        name: endpointName,
        certificate: permitData.agent.certificate,
        privateKey: permitData.agent.privateKey || '',
        labels: permitData.agent.labels || [],
      },
      bootstraps: permitData.bootstraps,
    };

    const response = await fetch(`${agentUrl}/api/meshes/${encodeURIComponent(meshName)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(permit),
    });

    if (response.ok) {
      logger.info(`Successfully joined mesh ${meshName} as ${endpointName}`);
      return true;
    }

    if (response.status === 409) {
      logger.info(`Already a member of mesh ${meshName}`);
      return true;
    }

    const errorText = await response.text().catch(() => 'Unknown error');
    logger.error(`Failed to join mesh: ${response.status} ${errorText}`);
    return false;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to join mesh: ${errorMsg}`);
    return false;
  }
}
