/**
 * ZTM Mesh connectivity management via Agent API
 * @module connectivity/mesh
 *
 * Provides functions for managing ZTM mesh connectivity:
 * - Port connectivity checking
 * - Identity (public key) retrieval
 * - Mesh joining operations
 */

import * as net from 'net';
import { logger } from '../utils/logger.js';
import { isValidUrl } from '../utils/validation.js';
import { isValidMeshName } from '../config/validation.js';
import type { PermitData } from '../types/connectivity.js';

/**
 * Custom error for invalid input parameters
 * Thrown when input validation fails for security reasons
 */
export class MeshInputValidationError extends Error {
  /** The parameter name that failed validation */
  readonly param: string;
  /** The invalid value that was provided */
  readonly value: unknown;

  constructor(param: string, value: unknown, reason: string) {
    super(`Invalid ${param}: ${reason}`);
    this.name = 'MeshInputValidationError';
    this.param = param;
    this.value = value;
  }
}

/**
 * Validate hostname format
 * @param hostname - Hostname to validate
 * @returns true if valid, false otherwise
 */
function isValidHostname(hostname: string): boolean {
  if (!hostname || typeof hostname !== 'string') {
    return false;
  }
  const trimmed = hostname.trim();
  if (trimmed.length === 0 || trimmed.length > 253) {
    return false;
  }
  // Check for path traversal patterns
  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    return false;
  }
  // Basic hostname pattern (labels separated by dots)
  const hostnamePattern =
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return hostnamePattern.test(trimmed);
}

/**
 * Validate port number
 * @param port - Port number to validate
 * @returns true if valid, false otherwise
 */
function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/**
 * Validate endpoint name format
 * @param name - Endpoint name to validate
 * @returns true if valid, false otherwise
 */
function isValidEndpointName(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return false;
  }
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 64) {
    return false;
  }
  // Check for path traversal or special characters
  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    return false;
  }
  // Same pattern as mesh name
  return isValidMeshName(trimmed);
}

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
  // Security: Validate hostname to prevent SSRF attacks
  if (!isValidHostname(hostname)) {
    throw new MeshInputValidationError('hostname', hostname, 'Invalid hostname format');
  }

  // Security: Validate port range
  if (!isValidPort(port)) {
    throw new MeshInputValidationError('port', port, 'Port must be between 1 and 65535');
  }

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
  // Security: Validate URL to prevent SSRF attacks
  if (!isValidUrl(agentUrl)) {
    throw new MeshInputValidationError('agentUrl', agentUrl, 'Invalid URL format');
  }

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
  // Security: Validate inputs before making network requests
  if (!isValidUrl(agentUrl)) {
    throw new MeshInputValidationError('agentUrl', agentUrl, 'Invalid URL format');
  }

  if (!isValidMeshName(meshName)) {
    throw new MeshInputValidationError(
      'meshName',
      meshName,
      'Mesh name must be 1-64 characters, alphanumeric with - and _ only'
    );
  }

  if (!isValidEndpointName(endpointName)) {
    throw new MeshInputValidationError(
      'endpointName',
      endpointName,
      'Endpoint name must be 1-64 characters, alphanumeric with - and _ only'
    );
  }

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
