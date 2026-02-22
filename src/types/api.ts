/**
 * @fileoverview ZTM Chat API Types
 * @module types/api
 * Types for ZTM Agent API communication
 */

import type { Result } from './common.js';
import type { ZTMApiError, ZTMSendError, ZTMReadError, ZTMDiscoveryError } from './errors.js';

export type { ZTMDiscoveryError } from './errors.js';

// ═════════════════════════════════════════════════════════════════════════════
// Core ZTM Types
// ═════════════════════════════════════════════════════════════════════════════

/**
 * @description ZTM Message interface - matches ZTM Agent API format
 */
export interface ZTMMessage {
  time: number;
  message: string;
  sender: string;
}

/**
 * @description ZTM Peer interface
 */
export interface ZTMPeer {
  username: string;
  endpoint?: string;
}

/**
 * @description ZTM User Info interface
 */
export interface ZTMUserInfo {
  username: string;
  endpoint?: string;
}

/**
 * @description ZTM Mesh Info interface - matches /api/meshes/{name} response
 */
export interface ZTMMeshInfo {
  name: string;
  connected: boolean;
  endpoints?: number;
  errors?: Array<{ time: string; message: string }>;
}

/**
 * @description ZTM Endpoint interface - matches /api/meshes/{name}/endpoints response
 */
export interface ZTMEndpoint {
  isLocal: boolean;
  id: string;
  name: string;
  username: string;
  ip?: string;
  port?: number;
  online?: boolean;
}

/**
 * @description ZTM Chat interface - matches /apps/ztm/chat/api/chats response
 */
export interface ZTMChat {
  peer?: string;
  creator?: string;
  group?: string;
  name?: string;
  members?: string[];
  time: number;
  updated: number;
  latest: ZTMMessage;
}

/**
 * @description Watch change item for storage monitoring
 */
export interface WatchChangeItem {
  type: 'peer' | 'group';
  peer?: string;
  creator?: string;
  group?: string;
  name?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// ZTM API Client Interface - Using Result<T, E> for consistent error handling
// ═════════════════════════════════════════════════════════════════════════════

/**
 * @description ZTM API Client interface with Result-based error handling.
 *
 * All operations return Result<T, E> types for consistent error handling:
 * - Success: { ok: true, value: T }
 * - Failure: { ok: false, error: E }
 *
 * This replaces previous patterns of:
 * - Promise<boolean> (lost error details)
 * - Promise<T | null> (couldn't distinguish "not found" from "error")
 * - Silent failures (returning empty arrays)
 */
export interface ZTMApiClient {
  // ═══════════════════════════════════════════════════════════════════════════
  // Mesh Operations - Return Result types with ZTMApiError
  // ═══════════════════════════════════════════════════════════════════════════

  /** Get current mesh information */
  getMeshInfo(): Promise<Result<ZTMMeshInfo, ZTMApiError>>;

  /** Get all endpoints in the mesh */
  getEndpoints(): Promise<Result<ZTMEndpoint[], ZTMApiError>>;

  /** Get count of endpoints in the mesh */
  getEndpointCount(): Promise<Result<number, ZTMApiError>>;

  // ═══════════════════════════════════════════════════════════════════════════
  // User/Peer Discovery - Return Result types with ZTMDiscoveryError
  // ═══════════════════════════════════════════════════════════════════════════

  /** Discover available users in the mesh. Returns Result with discovered users or discovery error. */
  discoverUsers(): Promise<Result<ZTMUserInfo[], ZTMDiscoveryError>>;

  /** Discover available peers. Returns Result with discovered peers or discovery error. */
  discoverPeers(): Promise<Result<ZTMPeer[], ZTMDiscoveryError>>;

  // ═══════════════════════════════════════════════════════════════════════════
  // Chat Operations - Return Result types with ZTMSendError / ZTMReadError
  // ═══════════════════════════════════════════════════════════════════════════

  /** Get all chats. Returns Result with chats list or error. */
  getChats(): Promise<Result<ZTMChat[], ZTMReadError>>;

  /** Get messages from a specific peer. Returns Result with messages or read error. */
  getPeerMessages(
    peer: string,
    since?: number,
    before?: number
  ): Promise<Result<ZTMMessage[], ZTMReadError>>;

  /** Send a message to a peer. Returns Result with success=true or ZTMSendError on failure. */
  sendPeerMessage(peer: string, message: ZTMMessage): Promise<Result<boolean, ZTMSendError>>;

  // ═════════════════════════════════════════════════════════════════════════════
  // Group Operations
  // ═════════════════════════════════════════════════════════════════════════════

  /** Get messages from a group. Returns Result with messages or read error. */
  getGroupMessages(
    creator: string,
    group: string,
    since?: number
  ): Promise<Result<ZTMMessage[], ZTMReadError>>;

  /** Send a message to a group. Returns Result with success or error. */
  sendGroupMessage(
    creator: string,
    group: string,
    message: ZTMMessage
  ): Promise<Result<boolean, ZTMSendError>>;

  // ═══════════════════════════════════════════════════════════════════════════
  // File Operations - Return Result types with appropriate errors
  // ═══════════════════════════════════════════════════════════════════════════

  /** Watch for changes in storage with given prefix. Returns Result with changed items or error. */
  watchChanges(prefix: string): Promise<Result<WatchChangeItem[], ZTMReadError>>;

  /** Discover active peers by scanning shared storage. Returns Result with users or discovery error. */
  listUsers(): Promise<Result<ZTMUserInfo[], ZTMDiscoveryError>>;
}
