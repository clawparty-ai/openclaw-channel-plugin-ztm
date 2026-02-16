// Unit tests for Message Dispatcher

import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleInboundMessage, createInboundContext, createMessageCallback } from "./message-dispatcher.js";
import type { AccountRuntimeState } from "../runtime/state.js";
import type { ZTMChatConfig } from "../types/config.js";
import type { ZTMChatMessage } from "../types/messaging.js";
import { testConfig, testAccountId } from "../test-utils/fixtures.js";

// Mock dependencies
vi.mock("../messaging/outbound.js", () => ({
  sendZTMMessage: vi.fn(() => Promise.resolve()),
}));

vi.mock("../runtime/index.js", () => ({
  getZTMRuntime: vi.fn(() => ({
    channel: {
      routing: {
        resolveAgentRoute: vi.fn(() => ({
          sessionKey: "test-session",
          accountId: testAccountId,
          matchedBy: "default",
          agentId: "test-agent",
        })),
      },
      reply: {
        finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
        dispatchReplyWithBufferedBlockDispatcher: vi.fn(() => Promise.resolve({ queuedFinal: true })),
        resolveHumanDelayConfig: vi.fn(() => ({ enabled: false })),
      },
    },
  })),
}));

vi.mock("../runtime/state.js", () => ({
  getGroupPermissionCached: vi.fn(() => ({})),
}));

vi.mock("../core/group-policy.js", () => ({
  checkGroupPolicy: vi.fn(() => ({ allowed: true, reason: "allowed" as const, action: "process" as const })),
}));

vi.mock("../utils/error.js", () => ({
  extractErrorMessage: vi.fn((err: unknown) => String(err)),
}));

describe("createInboundContext", () => {
  it("should create inbound context with required fields", () => {
    const rt = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: "test-session-key",
            accountId: testAccountId,
            matchedBy: "default",
            agentId: "agent-1",
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
        },
      },
    } as any;

    const msg: ZTMChatMessage = {
      id: "msg-123",
      sender: "alice",
      senderId: "alice-id",
      content: "Hello world",
      timestamp: new Date(),
      peer: "alice",
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: "testuser",
    };

    const result = createInboundContext({
      rt,
      msg,
      config,
      accountId: testAccountId,
    });

    expect(result.ctxPayload).toBeDefined();
    expect(result.ctxPayload.From).toBe("ztm-chat:alice");
    expect(result.ctxPayload.To).toBe("ztm-chat:testuser");
    expect(result.ctxPayload.Body).toBe("Hello world");
    expect(result.matchedBy).toBe("default");
    expect(result.agentId).toBe("agent-1");
  });

  it("should use custom cfg when provided", () => {
    const rt = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: "test-session-key",
            accountId: testAccountId,
            matchedBy: "custom",
            agentId: "custom-agent",
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
        },
      },
    } as any;

    const msg: ZTMChatMessage = {
      id: "msg-456",
      sender: "bob",
      senderId: "bob-id",
      content: "Test message",
      timestamp: new Date(),
      peer: "bob",
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: "testuser",
    };

    const customCfg = { customKey: "customValue" };

    createInboundContext({
      rt,
      msg,
      config,
      accountId: testAccountId,
      cfg: customCfg,
    });

    expect(rt.channel.routing.resolveAgentRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        cfg: customCfg,
      })
    );
  });
});

describe("handleInboundMessage", () => {
  let mockState: AccountRuntimeState;
  let mockLog: { info: (...args: unknown[]) => void; error?: (...args: unknown[]) => void };

  function createMockRt() {
    return {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: "test-session",
            accountId: testAccountId,
            matchedBy: "default",
            agentId: "test-agent",
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
          dispatchReplyWithBufferedBlockDispatcher: vi.fn(() => Promise.resolve({ queuedFinal: true })),
          resolveHumanDelayConfig: vi.fn(() => ({ enabled: false })),
        },
      },
    } as any;
  }

  beforeEach(() => {
    vi.clearAllMocks();

    mockLog = {
      info: vi.fn(),
      error: vi.fn(),
    };

    mockState = {
      accountId: testAccountId,
      config: testConfig,
      apiClient: null,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };
  });

  it("should dispatch message successfully", async () => {
    const msg: ZTMChatMessage = {
      id: "msg-001",
      sender: "alice",
      senderId: "alice-id",
      content: "Hello",
      timestamp: new Date(),
      peer: "alice",
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: "testuser",
    };

    await handleInboundMessage(mockState, createMockRt(), {}, config, testAccountId, { log: mockLog }, msg);

    expect(mockLog.info).toHaveBeenCalledWith(
      expect.stringContaining("Dispatching message from alice")
    );
  });

  it("should handle message with no response generated", async () => {
    const mockRtInstance = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: "test-session",
            accountId: testAccountId,
            matchedBy: "default",
            agentId: "test-agent",
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
          dispatchReplyWithBufferedBlockDispatcher: vi.fn(() => Promise.resolve({ queuedFinal: false })),
          resolveHumanDelayConfig: vi.fn(() => ({ enabled: false })),
        },
      },
    } as any;

    const msg: ZTMChatMessage = {
      id: "msg-002",
      sender: "bob",
      senderId: "bob-id",
      content: "Silent message",
      timestamp: new Date(),
      peer: "bob",
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: "testuser",
    };

    await handleInboundMessage(mockState, mockRtInstance, {}, config, testAccountId, { log: mockLog }, msg);

    expect(mockLog.info).toHaveBeenCalledWith(
      expect.stringContaining("No response generated")
    );
  });

  it("should handle errors gracefully", async () => {
    const mockRtInstance = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => {
            throw new Error("Route error");
          }),
        },
        reply: {
          finalizeInboundContext: vi.fn(),
          dispatchReplyWithBufferedBlockDispatcher: vi.fn(),
          resolveHumanDelayConfig: vi.fn(),
        },
      },
    } as any;

    const msg: ZTMChatMessage = {
      id: "msg-003",
      sender: "charlie",
      senderId: "charlie-id",
      content: "Error trigger",
      timestamp: new Date(),
      peer: "charlie",
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: "testuser",
    };

    await handleInboundMessage(mockState, mockRtInstance, {}, config, testAccountId, { log: mockLog }, msg);

    expect(mockLog.error).toHaveBeenCalled();
  });
});

describe("createMessageCallback", () => {
  let mockState: AccountRuntimeState;
  let mockLog: { info: (...args: unknown[]) => void };

  function createMockRt() {
    return {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: "test-session",
            accountId: testAccountId,
            matchedBy: "default",
            agentId: "test-agent",
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
          dispatchReplyWithBufferedBlockDispatcher: vi.fn(() => Promise.resolve({ queuedFinal: true })),
          resolveHumanDelayConfig: vi.fn(() => ({ enabled: false })),
        },
      },
    } as any;
  }

  beforeEach(() => {
    vi.clearAllMocks();

    mockLog = {
      info: vi.fn(),
    };

    mockState = {
      accountId: testAccountId,
      config: testConfig,
      apiClient: null,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };
  });

  it("should create callback for peer message", () => {
    const config: ZTMChatConfig = {
      ...testConfig,
      username: "testuser",
    };

    const callback = createMessageCallback(testAccountId, config, createMockRt(), undefined, mockState, { log: mockLog });

    const msg: ZTMChatMessage = {
      id: "msg-peer-1",
      sender: "alice",
      senderId: "alice-id",
      content: "Hello from peer",
      timestamp: new Date(),
      peer: "alice",
      isGroup: false,
    };

    callback(msg);

    expect(mockLog.info).toHaveBeenCalledWith(
      expect.stringContaining('peer "alice"')
    );
  });

  it("should create callback for group message with name", () => {
    const config: ZTMChatConfig = {
      ...testConfig,
      username: "testuser",
    };

    const callback = createMessageCallback(testAccountId, config, createMockRt(), undefined, mockState, { log: mockLog });

    const msg: ZTMChatMessage = {
      id: "msg-group-1",
      sender: "bob",
      senderId: "bob-id",
      content: "Hello from group",
      timestamp: new Date(),
      peer: "bob",
      isGroup: true,
      groupId: "group-123",
      groupCreator: "alice",
      groupName: "Test Group",
    };

    callback(msg);

    expect(mockLog.info).toHaveBeenCalledWith(
      expect.stringContaining('group "Test Group"')
    );
  });

  it("should create callback for group message without name", () => {
    const config: ZTMChatConfig = {
      ...testConfig,
      username: "testuser",
    };

    const callback = createMessageCallback(testAccountId, config, createMockRt(), undefined, mockState, { log: mockLog });

    const msg: ZTMChatMessage = {
      id: "msg-group-2",
      sender: "bob",
      senderId: "bob-id",
      content: "Hello from group",
      timestamp: new Date(),
      peer: "bob",
      isGroup: true,
      groupId: "group-456",
      groupCreator: "alice",
      groupName: undefined,
    };

    callback(msg);

    expect(mockLog.info).toHaveBeenCalledWith(
      expect.stringContaining("group group-456")
    );
  });

  it("should truncate long message content in log", () => {
    const config: ZTMChatConfig = {
      ...testConfig,
      username: "testuser",
    };

    const callback = createMessageCallback(testAccountId, config, createMockRt(), undefined, mockState, { log: mockLog });

    // Create a long message (more than 100 chars)
    const longContent = "A".repeat(150);
    const msg: ZTMChatMessage = {
      id: "msg-long",
      sender: "alice",
      senderId: "alice-id",
      content: longContent,
      timestamp: new Date(),
      peer: "alice",
      isGroup: false,
    };

    callback(msg);

    expect(mockLog.info).toHaveBeenCalledWith(
      expect.stringContaining("...")
    );
  });
});

describe("checkGroupMessagePolicy", () => {
  let mockState: AccountRuntimeState;
  let mockLog: { info: (...args: unknown[]) => void; error?: (...args: unknown[]) => void };

  function createMockRt() {
    return {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: "test-session",
            accountId: testAccountId,
            matchedBy: "default",
            agentId: "test-agent",
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
          dispatchReplyWithBufferedBlockDispatcher: vi.fn(() => Promise.resolve({ queuedFinal: true })),
          resolveHumanDelayConfig: vi.fn(() => ({ enabled: false })),
        },
      },
    } as any;
  }

  beforeEach(() => {
    vi.clearAllMocks();

    mockLog = {
      info: vi.fn(),
      error: vi.fn(),
    };

    mockState = {
      accountId: testAccountId,
      config: testConfig,
      apiClient: null,
      connected: true,
      meshConnected: true,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      peerCount: 5,
      messageCallbacks: new Set(),
      watchInterval: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
      groupPermissionCache: new Map(),
    };
  });

  it("should allow non-group messages", async () => {
    const msg: ZTMChatMessage = {
      id: "msg-dm",
      sender: "alice",
      senderId: "alice-id",
      content: "Hello",
      timestamp: new Date(),
      peer: "alice",
      isGroup: false,
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: "testuser",
    };

    await handleInboundMessage(mockState, createMockRt(), {}, config, testAccountId, { log: mockLog }, msg);

    // Should not be blocked by policy
    expect(mockLog.info).toHaveBeenCalledWith(
      expect.stringContaining("Dispatching message")
    );
  });

  it("should block group message when policy denies", async () => {
    const { checkGroupPolicy } = await import("../core/group-policy.js");
    vi.mocked(checkGroupPolicy).mockReturnValueOnce({
      allowed: false,
      reason: "denied",
      action: "ignore",
    });

    const mockRtInstance = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: "test-session",
            accountId: testAccountId,
            matchedBy: "default",
            agentId: "test-agent",
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
          dispatchReplyWithBufferedBlockDispatcher: vi.fn(() => Promise.resolve({ queuedFinal: true })),
          resolveHumanDelayConfig: vi.fn(() => ({ enabled: false })),
        },
      },
    } as any;

    const msg: ZTMChatMessage = {
      id: "msg-blocked",
      sender: "alice",
      senderId: "alice-id",
      content: "Blocked message",
      timestamp: new Date(),
      peer: "alice",
      isGroup: true,
      groupId: "group-999",
      groupCreator: "owner",
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: "testuser",
    };

    await handleInboundMessage(mockState, mockRtInstance, {}, config, testAccountId, { log: mockLog }, msg);

    // Should be blocked
    expect(mockLog.info).toHaveBeenCalledWith(
      expect.stringContaining("blocked")
    );
  });

  it("should allow group message when policy permits", async () => {
    const { checkGroupPolicy } = await import("../core/group-policy.js");
    vi.mocked(checkGroupPolicy).mockReturnValueOnce({
      allowed: true,
      reason: "allowed",
      action: "process",
    });

    const mockRtInstance = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: "test-session",
            accountId: testAccountId,
            matchedBy: "default",
            agentId: "test-agent",
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
          dispatchReplyWithBufferedBlockDispatcher: vi.fn(() => Promise.resolve({ queuedFinal: true })),
          resolveHumanDelayConfig: vi.fn(() => ({ enabled: false })),
        },
      },
    } as any;

    const msg: ZTMChatMessage = {
      id: "msg-allowed",
      sender: "alice",
      senderId: "alice-id",
      content: "Allowed message",
      timestamp: new Date(),
      peer: "alice",
      isGroup: true,
      groupId: "group-888",
      groupCreator: "owner",
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: "testuser",
    };

    await handleInboundMessage(mockState, mockRtInstance, {}, config, testAccountId, { log: mockLog }, msg);

    // Should be allowed
    expect(mockLog.info).toHaveBeenCalledWith(
      expect.stringContaining("allowed")
    );
  });
});
