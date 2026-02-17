// Test Fixtures - Static test data for ZTM Chat tests
// Provides reusable test data like configs, messages, users, etc.

import type { ZTMChatConfig } from "../types/config.js";
import type { ZTMMessage, ZTMChat, ZTMPeer, ZTMUserInfo, ZTMMeshInfo } from "../api/ztm-api.js";
import { Semaphore } from "../utils/concurrency.js";
import type { MessageCallback } from "../types/runtime.js";

// ============================================================================
// Time Constants
// ============================================================================

export const NOW = Date.now();
export const ONE_MINUTE_AGO = NOW - 60_000;
export const FIVE_MINUTES_AGO = NOW - 300_000;
export const ONE_HOUR_AGO = NOW - 3_600_000;

// ============================================================================
// Config Fixtures
// ============================================================================

/** Default test configuration */
export const testConfig: ZTMChatConfig = {
  agentUrl: "https://example.com:7777",
  permitUrl: "https://example.com/permit",
  permitSource: "server",
  meshName: "test-mesh",
  username: "test-bot",
  dmPolicy: "pairing",
  enableGroups: false,
  autoReply: true,
  messagePath: "/shared",
};

/** Configuration with groups enabled */
export const testConfigWithGroups: ZTMChatConfig = {
  ...testConfig,
  enableGroups: true,
};

/** Configuration for pairing-only mode */
export const testConfigPairingOnly: ZTMChatConfig = {
  ...testConfig,
  dmPolicy: "pairing",
  allowFrom: ["alice", "bob"],
};

/** Configuration for open DM policy */
export const testConfigOpenDM: ZTMChatConfig = {
  ...testConfig,
  dmPolicy: "allow",
};

/** Configuration for closed DM policy */
export const testConfigClosedDM: ZTMChatConfig = {
  ...testConfig,
  dmPolicy: "deny",
};

// ============================================================================
// User/Peer Fixtures
// ============================================================================

export const testUsers: ZTMUserInfo[] = [
  { username: "alice" },
  { username: "bob" },
  { username: "charlie" },
];

export const testPeers: ZTMPeer[] = [
  { username: "alice", endpoint: "alice@192.168.1.10:7777" },
  { username: "bob", endpoint: "bob@192.168.1.11:7777" },
  { username: "charlie" },
];

// ============================================================================
// Message Fixtures
// ============================================================================

export const testMessages: ZTMMessage[] = [
  { time: ONE_MINUTE_AGO, message: "Hello!", sender: "alice" },
  { time: ONE_MINUTE_AGO + 10_000, message: "How are you?", sender: "alice" },
  { time: ONE_MINUTE_AGO + 20_000, message: "test-bot", sender: "alice" },
];

/** Single test message */
export const testMessage: ZTMMessage = {
  time: NOW,
  message: "Test message",
  sender: "alice",
};

/** Empty message */
export const emptyMessage: ZTMMessage = {
  time: NOW,
  message: "",
  sender: "alice",
};

/** Unicode message */
export const unicodeMessage: ZTMMessage = {
  time: NOW,
  message: "你好世界 🌍 Привет мир",
  sender: "alice",
};

/** Long message */
export const longMessage: ZTMMessage = {
  time: NOW,
  message: "A".repeat(10_000),
  sender: "alice",
};

// ============================================================================
// Chat Fixtures
// ============================================================================

export const testChats: ZTMChat[] = [
  {
    peer: "alice",
    time: ONE_MINUTE_AGO,
    updated: NOW,
    latest: testMessages[0],
  },
  {
    peer: "bob",
    time: FIVE_MINUTES_AGO,
    updated: ONE_MINUTE_AGO,
    latest: { time: FIVE_MINUTES_AGO, message: "Hi there!", sender: "bob" },
  },
];

export const testGroupChats: ZTMChat[] = [
  {
    creator: "alice",
    group: "test-group-1",
    name: "Test Group",
    members: ["alice", "bob", "test-bot"],
    time: ONE_HOUR_AGO,
    updated: NOW,
    latest: { time: NOW, message: "Hello group!", sender: "alice" },
  },
];

// ============================================================================
// Mesh Info Fixtures
// ============================================================================

export const testMeshInfo: ZTMMeshInfo = {
  name: "test-mesh",
  connected: true,
  endpoints: 5,
  errors: [],
};

export const testMeshInfoDisconnected: ZTMMeshInfo = {
  name: "test-mesh",
  connected: false,
  endpoints: 0,
  errors: [{ time: new Date().toISOString(), message: "Connection lost" }],
};

// ============================================================================
// Account ID Fixtures
// ============================================================================

export const testAccountId = "test-account";
export const testAccountId2 = "test-account-2";

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a message with custom properties
 */
export function createMessage(overrides: Partial<ZTMMessage> = {}): ZTMMessage {
  return {
    time: NOW,
    message: "Test message",
    sender: "alice",
    ...overrides,
  };
}

/**
 * Create a chat with custom properties
 */
export function createChat(overrides: Partial<ZTMChat> = {}): ZTMChat {
  return {
    peer: "alice",
    time: NOW,
    updated: NOW,
    latest: createMessage(),
    ...overrides,
  };
}

/**
 * Create a user with custom properties
 */
export function createUser(overrides: Partial<ZTMUserInfo> = {}): ZTMUserInfo {
  return {
    username: "alice",
    ...overrides,
  };
}

/**
 * Create a peer with custom properties
 */
export function createPeer(overrides: Partial<ZTMPeer> = {}): ZTMPeer {
  return {
    username: "alice",
    ...overrides,
  };
}

/**
 * Create a config with custom properties
 */
export function createConfig(overrides: Partial<ZTMChatConfig> = {}): ZTMChatConfig {
  return {
    ...testConfig,
    ...overrides,
  };
}

/**
 * Create multiple messages for testing
 */
export function createMessages(count: number, sender = "alice"): ZTMMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    time: NOW - (count - i) * 60_000,
    message: `Message ${i + 1}`,
    sender,
  }));
}

// ============================================================================
// Mock Chat Factory (for polling-watcher tests)
// ============================================================================

export interface MockChatOptions {
  peer: string;
  message?: string;
  time?: number;
  latest?: { time: number; message: string; sender: string } | null;
}

/**
 * Create a mock ZTMChat for polling watcher tests
 * Supports both positional args and options object for compatibility
 */
export function createMockChat(
  peerOrOptions: string | MockChatOptions,
  message?: string,
  chatTime?: number
): ZTMChat {
  const options: MockChatOptions = typeof peerOrOptions === "string"
    ? { peer: peerOrOptions, message: message!, time: chatTime! }
    : peerOrOptions;

  const time = options.time ?? NOW;
  return {
    peer: options.peer,
    time,
    updated: time,
    latest: options.latest ?? {
      time,
      message: options.message ?? "Test message",
      sender: options.peer,
    },
  };
}

// ============================================================================
// Mock State Factory (for watcher tests)
// ============================================================================

import type { AccountRuntimeState } from "../types/runtime.js";
import type { ZTMApiClient } from "../types/api.js";
import type { ZTMChatMessage } from "../types/messaging.js";
import { ZTMReadError } from "../types/errors.js";

/**
 * Create a mock failure response for getChats
 */
export function createChatsFailure(peer = "test"): { ok: false; error: ZTMReadError } {
  return {
    ok: false,
    error: new ZTMReadError({
      peer,
      operation: "list",
      cause: new Error("Network error"),
    }),
  };
}

/**
 * Create a mock AccountRuntimeState for testing
 */
export function createMockState(
  accountId: string = testAccountId,
  config: ZTMChatConfig = testConfig,
  apiClient: ZTMApiClient | null = null
): AccountRuntimeState {
  return {
    accountId,
    config,
    apiClient: apiClient as ZTMApiClient,
    connected: true,
    meshConnected: true,
    lastError: null,
    lastStartAt: new Date(),
    lastStopAt: null,
    lastInboundAt: null,
    lastOutboundAt: null,
    peerCount: 5,
    messageCallbacks: new Set<MessageCallback>(),
    callbackSemaphore: new Semaphore(10),
    watchInterval: null,
    watchErrorCount: 0,
    pendingPairings: new Map(),
  };
}
