// E2E Test Fixtures - Shared utilities for E2E tests
// Provides reusable helpers for account management, message generation,
// and server setup common across E2E test scenarios

import type { ZTMChatMessage } from '../types/messaging.js';
import type { ZTMChatConfig } from '../types/config.js';
import { testConfig, testConfigOpenDM, testAccountId, NOW } from './fixtures.js';
import {
  disposeMessageStateStore,
  resetDefaultProvider,
  getOrCreateAccountState,
  removeAccountState,
} from '../runtime/index.js';

// ============================================================================
// Account Management Helpers
// ============================================================================

/**
 * Creates a fresh account state for testing
 * Call this in beforeEach to ensure test isolation
 *
 * @example
 * ```typescript
 * beforeEach(() => {
 *   setupE2EAccount();
 * });
 *
 * afterEach(() => {
 *   teardownE2EAccount();
 * });
 * ```
 */
export function setupE2EAccount(accountId: string = testAccountId): void {
  disposeMessageStateStore();
  resetDefaultProvider();
  getOrCreateAccountState(accountId);
}

/**
 * Cleans up account state after test
 * Call this in afterEach to prevent state leakage
 */
export function teardownE2EAccount(accountId: string = testAccountId): void {
  removeAccountState(accountId);
  resetDefaultProvider();
}

/**
 * Creates account context object for message processing
 * Used to pass account-specific data to processor functions
 *
 * @example
 * ```typescript
 * const context = createE2EContext({
 *   config: testConfigOpenDM,
 *   accountId: 'test-account'
 * });
 * const result = processIncomingMessage(msg, context);
 * ```
 */
export interface E2EContextOptions {
  config?: ZTMChatConfig;
  accountId?: string;
  storeAllowFrom?: string[];
}

export function createE2EContext(options: E2EContextOptions = {}): {
  config: ZTMChatConfig;
  storeAllowFrom: string[];
  accountId: string;
} {
  return {
    config: options.config ?? testConfigOpenDM,
    storeAllowFrom: options.storeAllowFrom ?? [],
    accountId: options.accountId ?? testAccountId,
  };
}

// ============================================================================
// Message Generation Helpers
// ============================================================================

/**
 * Creates a single test message with unique sender prefix
 * Use prefix to avoid watermark collisions between test files
 *
 * @param sender - Sender identifier
 * @param message - Message content
 * @param time - Message timestamp (default: NOW)
 */
export function createE2EMessage(
  sender: string,
  message: string,
  time: number = NOW
): { time: number; message: string; sender: string } {
  return { time, message, sender };
}

/**
 * Creates multiple test messages with sequential timestamps
 * Useful for testing message ordering and deduplication
 *
 * @param count - Number of messages to create
 * @param senderPrefix - Prefix for sender IDs
 * @param baseTime - Starting timestamp
 * @param intervalMs - Interval between messages in ms
 */
export function createE2EMessageBatch(
  count: number,
  senderPrefix: string,
  baseTime: number = NOW,
  intervalMs: number = 1
): { time: number; message: string; sender: string }[] {
  const messages = [];
  for (let i = 0; i < count; i++) {
    messages.push({
      time: baseTime + i * intervalMs,
      message: `Message ${i + 1}`,
      sender: `${senderPrefix}-user-${i % 10}`,
    });
  }
  return messages;
}

/**
 * Converts E2E message format to ZTMChatMessage
 * Used when testing message processing that expects full ZTM types
 *
 * @param msg - Simple message format
 * @returns ZTMChatMessage object
 */
export function toZTMChatMessage(msg: {
  time: number;
  message: string;
  sender: string;
}): ZTMChatMessage {
  return {
    id: `msg-${msg.time}`,
    content: msg.message,
    sender: msg.sender,
    senderId: msg.sender,
    timestamp: new Date(msg.time),
    peer: msg.sender,
  };
}

// ============================================================================
// Server Helpers
// ============================================================================

/**
 * Default E2E test server options
 */
export interface E2EServerOptions {
  /** Response delay in ms */
  delay?: number;
  /** Whether to enable error injection */
  injectable?: boolean;
}

/**
 * Creates a simple E2E test server with common defaults
 * Wrapper around test-utils/http-server for E2E scenarios
 *
 * @param handler - Optional request handler function
 * @param options - Server options (delay, injectable)
 * @returns Promise resolving to server instance with url and close method
 */
export async function createE2ETestServer(
  handler?: (req: Request) => Response | Promise<Response>,
  options?: E2EServerOptions
): Promise<{ url: string; close: () => Promise<void> }> {
  const { createTestServer } = await import('./http-server.js');

  if (!handler) {
    // Default handler returns empty chats
    handler = async () => {
      return new Response(JSON.stringify({ chats: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
  }

  const server = await createTestServer({
    handler: async (req, res) => {
      if (options?.delay) {
        await new Promise(r => setTimeout(r, options.delay));
      }
      const request = new Request(req.url || '', {
        method: req.method || 'GET',
        headers: req.headers as Record<string, string>,
      });
      const response = await handler!(request);
      res.statusCode = response.status;
      response.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await response.text());
    },
  });

  return server;
}

// ============================================================================
// Test Lifecycle Helpers
// ============================================================================

/**
 * Standard E2E test setup
 * Call in beforeEach to ensure consistent test environment
 */
export function e2eBeforeEach(): void {
  setupE2EAccount();
}

/**
 * Standard E2E test teardown
 * Call in afterEach to clean up test environment
 */
export async function e2eAfterEach(): Promise<void> {
  teardownE2EAccount();
}

// ============================================================================
// Re-export commonly used fixtures
// ============================================================================

export { testConfig, testConfigOpenDM, testAccountId, NOW };

// Re-export runtime functions for backward compatibility
export {
  disposeMessageStateStore,
  resetDefaultProvider,
  getOrCreateAccountState,
  removeAccountState,
} from '../runtime/index.js';
