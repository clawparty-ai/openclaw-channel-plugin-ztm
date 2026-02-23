// Test Data Generators - Dynamic test data generation for ZTM Chat tests
// Provides functions to generate test data with configurable parameters

import type { ZTMChatConfig } from '../types/config.js';
import type { ZTMMessage, ZTMChat, ZTMPeer } from '../types/api.js';
import {
  ZTMError,
  ZTMApiError,
  ZTMTimeoutError,
  ZTMReadError,
  ZTMSendError,
} from '../types/errors.js';

// ============================================================================
// Error Types for Network Error Generation
// ============================================================================

/**
 * Types of network errors that can be generated
 */
export const NetworkErrorType = {
  TIMEOUT: 'timeout',
  CONNECTION_REFUSED: 'connection_refused',
  CONNECTION_RESET: 'connection_reset',
  DNS_ERROR: 'dns_error',
  SSL_ERROR: 'ssl_error',
  SERVER_ERROR: 'server_error',
  CLIENT_ERROR: 'client_error',
  NETWORK_UNAVAILABLE: 'network_unavailable',
} as const;

export type NetworkErrorType = (typeof NetworkErrorType)[keyof typeof NetworkErrorType];

// ============================================================================
// Message Generators
// ============================================================================

/**
 * Generate a message with specified character length
 * @param length - Desired character length of the message content
 * @param sender - Username of the message sender
 * @returns ZTMMessage with the specified length
 */
export function generateMessage(length: number, sender = 'test-user'): ZTMMessage {
  const actualLength = Math.max(0, length);
  const message = 'x'.repeat(actualLength);

  return {
    time: Date.now(),
    message,
    sender,
  };
}

/**
 * Generate a random alphanumeric string of specified length
 * @param length - Desired length of the string
 * @returns Random alphanumeric string
 */
export function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate multiple messages with incrementing timestamps
 * @param count - Number of messages to generate
 * @param sender - Username of the message sender
 * @param baseTime - Base timestamp for the first message
 * @returns Array of ZTMMessage objects
 */
export function generateMessages(
  count: number,
  sender = 'test-user',
  baseTime = Date.now()
): ZTMMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    time: baseTime - (count - i) * 60_000,
    message: `Message ${i + 1}: ${generateRandomString(20)}`,
    sender,
  }));
}

// ============================================================================
// Chat Generators
// ============================================================================

/**
 * Generate a chat with specified number of participants (for group chats)
 * @param participantCount - Number of participants in the chat
 * @returns ZTMChat with the specified number of members
 */
export function generateChat(participantCount: number): ZTMChat {
  const count = Math.max(1, participantCount);
  const members = Array.from({ length: count }, (_, i) => `user-${i + 1}`);
  const creator = members[0];
  const groupName = `group-${generateRandomString(8)}`;
  const now = Date.now();

  return {
    creator,
    group: groupName,
    name: `Test Group ${groupName}`,
    members,
    time: now - 3600_000,
    updated: now,
    latest: {
      time: now,
      message: `Hello from ${members[0]}!`,
      sender: members[0],
    },
  };
}

/**
 * Generate a direct message chat (single peer)
 * @param peer - The peer username
 * @param messageCount - Number of messages in the chat history
 * @returns ZTMChat representing a DM conversation
 */
export function generateDmChat(peer: string, messageCount = 5): ZTMChat {
  const now = Date.now();
  const messages = generateMessages(messageCount, peer, now - 300_000);

  return {
    peer,
    time: now - 300_000,
    updated: now,
    latest: messages[messages.length - 1],
  };
}

/**
 * Generate multiple chats for testing
 * @param count - Number of chats to generate
 * @returns Array of ZTMChat objects
 */
export function generateChats(count: number): ZTMChat[] {
  return Array.from({ length: count }, (_, i) => {
    const peer = `peer-${i + 1}`;
    return generateDmChat(peer, 3);
  });
}

// ============================================================================
// Peer/User Generators
// ============================================================================

/**
 * Generate a peer with specified properties
 * @param username - Username of the peer
 * @returns ZTMPeer object
 */
export function generatePeer(username?: string): ZTMPeer {
  const name = username ?? generateRandomString(10);
  return {
    username: name,
    endpoint: `${name}@192.168.1.${Math.floor(Math.random() * 255)}:7777`,
  };
}

/**
 * Generate multiple peers
 * @param count - Number of peers to generate
 * @returns Array of ZTMPeer objects
 */
export function generatePeers(count: number): ZTMPeer[] {
  return Array.from({ length: count }, () => generatePeer());
}

// ============================================================================
// Config Generators
// ============================================================================

const defaultConfigBase: ZTMChatConfig = {
  agentUrl: 'https://example.com:7777',
  permitUrl: 'https://example.com/permit',
  permitSource: 'server',
  meshName: 'test-mesh',
  username: 'test-bot',
  dmPolicy: 'allow',
  enableGroups: true,
};

/**
 * Generate a configuration with optional overrides
 * @param overrides - Partial configuration to override defaults
 * @returns ZTMChatConfig with specified overrides
 */
export function generateConfig(overrides?: Partial<ZTMChatConfig>): ZTMChatConfig {
  return {
    ...defaultConfigBase,
    ...overrides,
  };
}

/**
 * Generate configuration with specific DM policy
 * @param policy - DM policy to apply
 * @param allowFrom - Optional allowFrom list for pairing mode
 * @returns ZTMChatConfig with specified DM policy
 */
export function generateConfigWithPolicy(
  policy: 'allow' | 'deny' | 'pairing',
  allowFrom?: string[]
): ZTMChatConfig {
  return generateConfig({
    dmPolicy: policy,
    allowFrom,
  });
}

/**
 * Generate multiple configurations for testing
 * @param count - Number of configs to generate
 * @returns Array of ZTMChatConfig objects
 */
export function generateConfigs(count: number): ZTMChatConfig[] {
  const policies: Array<'allow' | 'deny' | 'pairing'> = ['allow', 'deny', 'pairing'];

  return Array.from({ length: count }, (_, i) =>
    generateConfig({
      meshName: `mesh-${i + 1}`,
      username: `bot-${i + 1}`,
      dmPolicy: policies[i % policies.length],
      enableGroups: i % 2 === 0,
    })
  );
}

// ============================================================================
// Network Error Generators
// ============================================================================

/**
 * Generate a network error based on the specified type
 * @param type - Type of network error to generate
 * @param options - Additional options for error construction
 * @returns Appropriate ZTM error based on type
 */
export function generateNetworkError(
  type: NetworkErrorType,
  options?: {
    method?: string;
    path?: string;
    peer?: string;
  }
): ZTMError {
  const method = options?.method ?? 'GET';
  const path = options?.path ?? '/api/test';

  switch (type) {
    case NetworkErrorType.TIMEOUT:
      return new ZTMTimeoutError({
        method,
        path,
        timeoutMs: 30_000,
        cause: new Error('Request timed out'),
      });

    case NetworkErrorType.CONNECTION_REFUSED:
      return new ZTMApiError({
        method,
        path,
        statusCode: 0,
        statusText: 'Connection refused',
        cause: new Error('ECONNREFUSED: Connection refused'),
      });

    case NetworkErrorType.CONNECTION_RESET:
      return new ZTMApiError({
        method,
        path,
        statusCode: 0,
        statusText: 'Connection reset',
        cause: new Error('ECONNRESET: Connection reset by peer'),
      });

    case NetworkErrorType.DNS_ERROR:
      return new ZTMApiError({
        method,
        path,
        cause: new Error('ENOTFOUND: DNS lookup failed'),
      });

    case NetworkErrorType.SSL_ERROR:
      return new ZTMApiError({
        method,
        path,
        cause: new Error('CERT_HAS_EXPIRED: SSL certificate error'),
      });

    case NetworkErrorType.SERVER_ERROR:
      return new ZTMApiError({
        method,
        path,
        statusCode: 500,
        statusText: 'Internal Server Error',
        responseBody: '{"error": "Internal server error"}',
      });

    case NetworkErrorType.CLIENT_ERROR:
      return new ZTMApiError({
        method,
        path,
        statusCode: 400,
        statusText: 'Bad Request',
        responseBody: '{"error": "Invalid request"}',
      });

    case NetworkErrorType.NETWORK_UNAVAILABLE:
      return new ZTMApiError({
        method,
        path,
        cause: new Error('Network is unreachable'),
      });

    default:
      return new ZTMApiError({
        method,
        path,
        cause: new Error('Unknown network error'),
      });
  }
}

/**
 * Generate a read error for testing
 * @param peer - The peer whose messages were being read
 * @param operation - Type of read operation
 * @returns ZTMReadError
 */
export function generateReadError(
  peer: string,
  operation: 'read' | 'list' | 'parse' = 'read'
): ZTMReadError {
  return new ZTMReadError({
    peer,
    operation,
    cause: new Error(`Failed to ${operation} messages`),
  });
}

/**
 * Generate a send error for testing
 * @param peer - The peer the message was sent to
 * @returns ZTMSendError
 */
export function generateSendError(peer: string): ZTMSendError {
  return new ZTMSendError({
    peer,
    messageTime: Date.now(),
    cause: new Error('Failed to send message'),
  });
}

// ============================================================================
// Utility Generators
// ============================================================================

/**
 * Generate a timestamp relative to now
 * @param offsetMs - Offset in milliseconds (negative for past, positive for future)
 * @returns Timestamp offset from now
 */
export function generateTimestamp(offsetMs: number): number {
  return Date.now() + offsetMs;
}

/**
 * Generate timestamps for message sequencing
 * @param count - Number of timestamps to generate
 * @param intervalMs - Interval between timestamps
 * @returns Array of timestamps
 */
export function generateTimestamps(count: number, intervalMs = 60_000): number[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => now - (count - i) * intervalMs);
}
