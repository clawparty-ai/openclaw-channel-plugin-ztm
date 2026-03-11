// Unit tests for Message Dispatcher

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleInboundMessage,
  createInboundContext,
  createMessageCallback,
} from './message-dispatcher.js';
import type { AccountRuntimeState } from '../runtime/state.js';
import type { ZTMChatConfig } from '../types/config.js';
import type { ZTMChatMessage } from '../types/messaging.js';
import { testConfig, testAccountId } from '../test-utils/fixtures.js';

// Mock dependencies
vi.mock('../messaging/outbound.js', () => ({
  sendZTMMessage: vi.fn(() => Promise.resolve()),
}));

vi.mock('../runtime/index.js', () => ({
  getZTMRuntime: vi.fn(() => ({
    channel: {
      routing: {
        resolveAgentRoute: vi.fn(() => ({
          sessionKey: 'test-session',
          accountId: testAccountId,
          matchedBy: 'default',
          agentId: 'test-agent',
        })),
      },
      reply: {
        finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
        dispatchReplyWithBufferedBlockDispatcher: vi.fn(() =>
          Promise.resolve({ queuedFinal: true })
        ),
        resolveHumanDelayConfig: vi.fn(() => ({ enabled: false })),
      },
    },
  })),
}));

vi.mock('../utils/error.js', () => ({
  extractErrorMessage: vi.fn((err: unknown) => String(err)),
}));

describe('createInboundContext', () => {
  it('should create inbound context with required fields', () => {
    const rt = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: 'test-session-key',
            accountId: testAccountId,
            matchedBy: 'default',
            agentId: 'agent-1',
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
        },
      },
    } as any;

    const msg: ZTMChatMessage = {
      id: 'msg-123',
      sender: 'alice',
      senderId: 'alice-id',
      content: 'Hello world',
      timestamp: new Date(),
      peer: 'alice',
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: 'testuser',
    };

    const result = createInboundContext({
      rt,
      msg,
      config,
      accountId: testAccountId,
    });

    expect(result.ctxPayload).toBeDefined();
    expect(result.ctxPayload.From).toBe('ztm-chat:alice');
    expect(result.ctxPayload.To).toBe('ztm-chat:testuser');
    expect(result.ctxPayload.Body).toBe('Hello world');
    expect(result.matchedBy).toBe('default');
    expect(result.agentId).toBe('agent-1');
  });

  it('should use custom cfg when provided', () => {
    const rt = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: 'test-session-key',
            accountId: testAccountId,
            matchedBy: 'custom',
            agentId: 'custom-agent',
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
        },
      },
    } as any;

    const msg: ZTMChatMessage = {
      id: 'msg-456',
      sender: 'bob',
      senderId: 'bob-id',
      content: 'Test message',
      timestamp: new Date(),
      peer: 'bob',
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: 'testuser',
    };

    const customCfg = { customKey: 'customValue' };

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

  it('should set ChatType to direct and peer.kind to direct for DM messages', () => {
    const rt = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: 'test-session-key',
            accountId: testAccountId,
            matchedBy: 'default',
            agentId: 'agent-1',
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
        },
      },
    } as any;

    const msg: ZTMChatMessage = {
      id: 'msg-dm',
      sender: 'alice',
      senderId: 'alice-id',
      content: 'Hello',
      timestamp: new Date(),
      peer: 'alice',
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: 'testuser',
    };

    const result = createInboundContext({
      rt,
      msg,
      config,
      accountId: testAccountId,
    });

    expect(result.ctxPayload.ChatType).toBe('direct');
    expect(result.ctxPayload.ConversationLabel).toBe('alice');
    expect(rt.channel.routing.resolveAgentRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        peer: { kind: 'direct', id: 'alice' },
      })
    );
  });

  it('should set ChatType to group and peer.kind to group for group messages', () => {
    const rt = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: 'test-session-key',
            accountId: testAccountId,
            matchedBy: 'default',
            agentId: 'agent-1',
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
        },
      },
    } as any;

    const msg: ZTMChatMessage = {
      id: 'msg-group',
      sender: 'alice',
      senderId: 'alice-id',
      content: '@bot help',
      timestamp: new Date(),
      peer: 'alice',
      isGroup: true,
      groupId: 'team',
      groupCreator: 'bob',
      groupName: 'Test Group',
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: 'testuser',
    };

    const result = createInboundContext({
      rt,
      msg,
      config,
      accountId: testAccountId,
    });

    expect(result.ctxPayload.ChatType).toBe('group');
    expect(result.ctxPayload.ConversationLabel).toBe('bob/team');
    expect(rt.channel.routing.resolveAgentRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        peer: { kind: 'group', id: 'bob/team' },
      })
    );
  });

  it('should use groupId as fallback when groupCreator is missing', () => {
    const rt = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: 'test-session-key',
            accountId: testAccountId,
            matchedBy: 'default',
            agentId: 'agent-1',
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
        },
      },
    } as any;

    const msg: ZTMChatMessage = {
      id: 'msg-group-no-creator',
      sender: 'alice',
      senderId: 'alice-id',
      content: '@bot help',
      timestamp: new Date(),
      peer: 'alice',
      isGroup: true,
      groupId: 'team',
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: 'testuser',
    };

    const result = createInboundContext({
      rt,
      msg,
      config,
      accountId: testAccountId,
    });

    expect(result.ctxPayload.ChatType).toBe('group');
    expect(result.ctxPayload.ConversationLabel).toBe('team');
    expect(rt.channel.routing.resolveAgentRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        peer: { kind: 'group', id: 'team' },
      })
    );
  });

  it('should handle DM message with empty content', () => {
    const rt = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: 'test-session-key',
            accountId: testAccountId,
            matchedBy: 'default',
            agentId: 'agent-1',
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
        },
      },
    } as any;

    const msg: ZTMChatMessage = {
      id: 'msg-empty',
      sender: 'alice',
      senderId: 'alice-id',
      content: '',
      timestamp: new Date(),
      peer: 'alice',
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: 'testuser',
    };

    const result = createInboundContext({
      rt,
      msg,
      config,
      accountId: testAccountId,
    });

    expect(result.ctxPayload.Body).toBe('');
    expect(result.ctxPayload.ChatType).toBe('direct');
    expect(result.ctxPayload.ConversationLabel).toBe('alice');
  });

  it('should handle DM message with undefined timestamp', () => {
    const rt = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: 'test-session-key',
            accountId: testAccountId,
            matchedBy: 'default',
            agentId: 'agent-1',
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
        },
      },
    } as any;

    const msg: ZTMChatMessage = {
      id: 'msg-no-timestamp',
      sender: 'alice',
      senderId: 'alice-id',
      content: 'Hello',
      timestamp: undefined as any,
      peer: 'alice',
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: 'testuser',
    };

    const result = createInboundContext({
      rt,
      msg,
      config,
      accountId: testAccountId,
    });

    expect(result.ctxPayload.Timestamp).toBeUndefined();
    expect(result.ctxPayload.ChatType).toBe('direct');
  });

  it('should handle DM message with special characters in sender', () => {
    const rt = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: 'test-session-key',
            accountId: testAccountId,
            matchedBy: 'default',
            agentId: 'agent-1',
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
        },
      },
    } as any;

    const msg: ZTMChatMessage = {
      id: 'msg-special-sender',
      sender: 'user@example.com',
      senderId: 'user-id',
      content: 'Hello',
      timestamp: new Date(),
      peer: 'user@example.com',
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: 'testuser',
    };

    const result = createInboundContext({
      rt,
      msg,
      config,
      accountId: testAccountId,
    });

    expect(result.ctxPayload.From).toBe('ztm-chat:user@example.com');
    expect(result.ctxPayload.ConversationLabel).toBe('user@example.com');
    expect(result.ctxPayload.SenderName).toBe('user@example.com');
  });

  it('should handle group message with both groupCreator and groupId missing', () => {
    const rt = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: 'test-session-key',
            accountId: testAccountId,
            matchedBy: 'default',
            agentId: 'agent-1',
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
        },
      },
    } as any;

    const msg: ZTMChatMessage = {
      id: 'msg-group-no-id',
      sender: 'alice',
      senderId: 'alice-id',
      content: '@bot help',
      timestamp: new Date(),
      peer: 'alice',
      isGroup: true,
      groupCreator: undefined,
      groupId: undefined,
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: 'testuser',
    };

    const result = createInboundContext({
      rt,
      msg,
      config,
      accountId: testAccountId,
    });

    expect(result.ctxPayload.ChatType).toBe('group');
    expect(result.ctxPayload.ConversationLabel).toBe('alice');
    expect(rt.channel.routing.resolveAgentRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        peer: { kind: 'group', id: 'alice' },
      })
    );
  });

  it('should handle group message with only groupCreator (no groupId)', () => {
    const rt = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: 'test-session-key',
            accountId: testAccountId,
            matchedBy: 'default',
            agentId: 'agent-1',
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
        },
      },
    } as any;

    const msg: ZTMChatMessage = {
      id: 'msg-group-no-id',
      sender: 'alice',
      senderId: 'alice-id',
      content: '@bot help',
      timestamp: new Date(),
      peer: 'alice',
      isGroup: true,
      groupCreator: 'bob',
      groupId: undefined,
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: 'testuser',
    };

    const result = createInboundContext({
      rt,
      msg,
      config,
      accountId: testAccountId,
    });

    expect(result.ctxPayload.ChatType).toBe('group');
    expect(result.ctxPayload.ConversationLabel).toBe('bob');
    expect(rt.channel.routing.resolveAgentRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        peer: { kind: 'group', id: 'bob' },
      })
    );
  });

  it('should handle group message with sender as groupCreator', () => {
    const rt = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: 'test-session-key',
            accountId: testAccountId,
            matchedBy: 'default',
            agentId: 'agent-1',
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
        },
      },
    } as any;

    const msg: ZTMChatMessage = {
      id: 'msg-group-creator-sender',
      sender: 'alice',
      senderId: 'alice-id',
      content: '@bot help',
      timestamp: new Date(),
      peer: 'alice',
      isGroup: true,
      groupId: 'team',
      groupCreator: 'alice',
      groupName: 'Alice Team',
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: 'testuser',
    };

    const result = createInboundContext({
      rt,
      msg,
      config,
      accountId: testAccountId,
    });

    expect(result.ctxPayload.ChatType).toBe('group');
    expect(result.ctxPayload.ConversationLabel).toBe('alice/team');
    expect(result.ctxPayload.SenderName).toBe('alice');
  });

  it('should handle group message with empty content', () => {
    const rt = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: 'test-session-key',
            accountId: testAccountId,
            matchedBy: 'default',
            agentId: 'agent-1',
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
        },
      },
    } as any;

    const msg: ZTMChatMessage = {
      id: 'msg-group-empty',
      sender: 'alice',
      senderId: 'alice-id',
      content: '',
      timestamp: new Date(),
      peer: 'alice',
      isGroup: true,
      groupId: 'team',
      groupCreator: 'bob',
      groupName: 'Test Group',
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: 'testuser',
    };

    const result = createInboundContext({
      rt,
      msg,
      config,
      accountId: testAccountId,
    });

    expect(result.ctxPayload.Body).toBe('');
    expect(result.ctxPayload.ChatType).toBe('group');
    expect(result.ctxPayload.ConversationLabel).toBe('bob/team');
  });

  it('should handle group message with undefined timestamp', () => {
    const rt = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: 'test-session-key',
            accountId: testAccountId,
            matchedBy: 'default',
            agentId: 'agent-1',
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
        },
      },
    } as any;

    const msg: ZTMChatMessage = {
      id: 'msg-group-no-timestamp',
      sender: 'alice',
      senderId: 'alice-id',
      content: '@bot help',
      timestamp: undefined as any,
      peer: 'alice',
      isGroup: true,
      groupId: 'team',
      groupCreator: 'bob',
      groupName: 'Test Group',
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: 'testuser',
    };

    const result = createInboundContext({
      rt,
      msg,
      config,
      accountId: testAccountId,
    });

    expect(result.ctxPayload.Timestamp).toBeUndefined();
    expect(result.ctxPayload.ChatType).toBe('group');
  });

  it('should handle group message with special characters in groupId', () => {
    const rt = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: 'test-session-key',
            accountId: testAccountId,
            matchedBy: 'default',
            agentId: 'agent-1',
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
        },
      },
    } as any;

    const msg: ZTMChatMessage = {
      id: 'msg-group-special-id',
      sender: 'alice',
      senderId: 'alice-id',
      content: '@bot help',
      timestamp: new Date(),
      peer: 'alice',
      isGroup: true,
      groupId: 'team/subgroup',
      groupCreator: 'bob',
      groupName: 'Test Group',
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: 'testuser',
    };

    const result = createInboundContext({
      rt,
      msg,
      config,
      accountId: testAccountId,
    });

    expect(result.ctxPayload.ChatType).toBe('group');
    expect(result.ctxPayload.ConversationLabel).toBe('bob/team/subgroup');
    expect(rt.channel.routing.resolveAgentRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        peer: { kind: 'group', id: 'bob/team/subgroup' },
      })
    );
  });

  it('should handle message with newlines and special characters', () => {});

  it('should handle message with newlines and special characters', () => {
    const rt = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: 'test-session-key',
            accountId: testAccountId,
            matchedBy: 'default',
            agentId: 'agent-1',
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
        },
      },
    } as any;

    const content = 'Hello\nWorld\n@bot help me\n';
    const msg: ZTMChatMessage = {
      id: 'msg-newlines',
      sender: 'alice',
      senderId: 'alice-id',
      content,
      timestamp: new Date(),
      peer: 'alice',
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: 'testuser',
    };

    const result = createInboundContext({
      rt,
      msg,
      config,
      accountId: testAccountId,
    });

    expect(result.ctxPayload.Body).toBe(content);
    expect(result.ctxPayload.RawBody).toBe(content);
    expect(result.ctxPayload.CommandBody).toBe(content);
  });

  it('should handle message with Unicode characters', () => {
    const rt = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: 'test-session-key',
            accountId: testAccountId,
            matchedBy: 'default',
            agentId: 'agent-1',
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
        },
      },
    } as any;

    const content = '你好 @bot 帮我 🎉';
    const msg: ZTMChatMessage = {
      id: 'msg-unicode',
      sender: 'alice',
      senderId: 'alice-id',
      content,
      timestamp: new Date(),
      peer: 'alice',
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: 'testuser',
    };

    const result = createInboundContext({
      rt,
      msg,
      config,
      accountId: testAccountId,
    });

    expect(result.ctxPayload.Body).toBe(content);
    expect(result.ctxPayload.SenderName).toBe('alice');
  });
});

describe('handleInboundMessage', () => {
  let mockState: AccountRuntimeState;
  let mockLog: { info: (...args: unknown[]) => void; error?: (...args: unknown[]) => void };

  function createMockRt() {
    return {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: 'test-session',
            accountId: testAccountId,
            matchedBy: 'default',
            agentId: 'test-agent',
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
          dispatchReplyWithBufferedBlockDispatcher: vi.fn(() =>
            Promise.resolve({ queuedFinal: true })
          ),
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
      chatReader: null,
      chatSender: null,
      discovery: null,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      messageCallbacks: new Set(),
      watchInterval: null,
      watchErrorCount: 0,
      groupPermissionCache: new Map(),
    };
  });

  it('should dispatch message successfully', async () => {
    const msg: ZTMChatMessage = {
      id: 'msg-001',
      sender: 'alice',
      senderId: 'alice-id',
      content: 'Hello',
      timestamp: new Date(),
      peer: 'alice',
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: 'testuser',
    };

    await handleInboundMessage(
      mockState,
      createMockRt(),
      {},
      config,
      testAccountId,
      { log: mockLog },
      msg
    );

    expect(mockLog.info).toHaveBeenCalledWith(
      expect.stringContaining('Dispatching message from alice')
    );
  });

  it('should handle message with no response generated', async () => {
    const mockRtInstance = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: 'test-session',
            accountId: testAccountId,
            matchedBy: 'default',
            agentId: 'test-agent',
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
          dispatchReplyWithBufferedBlockDispatcher: vi.fn(() =>
            Promise.resolve({ queuedFinal: false })
          ),
          resolveHumanDelayConfig: vi.fn(() => ({ enabled: false })),
        },
      },
    } as any;

    const msg: ZTMChatMessage = {
      id: 'msg-002',
      sender: 'bob',
      senderId: 'bob-id',
      content: 'Silent message',
      timestamp: new Date(),
      peer: 'bob',
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: 'testuser',
    };

    await handleInboundMessage(
      mockState,
      mockRtInstance,
      {},
      config,
      testAccountId,
      { log: mockLog },
      msg
    );

    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('No response generated'));
  });

  it('should handle errors gracefully', async () => {
    const mockRtInstance = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => {
            throw new Error('Route error');
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
      id: 'msg-003',
      sender: 'charlie',
      senderId: 'charlie-id',
      content: 'Error trigger',
      timestamp: new Date(),
      peer: 'charlie',
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: 'testuser',
    };

    await handleInboundMessage(
      mockState,
      mockRtInstance,
      {},
      config,
      testAccountId,
      { log: mockLog },
      msg
    );

    expect(mockLog.error).toHaveBeenCalled();
  });

  it('should dispatch group messages (policy already checked earlier)', async () => {
    const msg: ZTMChatMessage = {
      id: 'msg-group',
      sender: 'alice',
      senderId: 'alice-id',
      content: '@bot help',
      timestamp: new Date(),
      peer: 'alice',
      isGroup: true,
      groupId: 'test-group',
      groupCreator: 'bob',
      groupName: 'Test Group',
    };

    const config: ZTMChatConfig = {
      ...testConfig,
      username: 'testuser',
    };

    await handleInboundMessage(
      mockState,
      createMockRt(),
      {},
      config,
      testAccountId,
      { log: mockLog },
      msg
    );

    expect(mockLog.info).toHaveBeenCalledWith(
      expect.stringContaining('Dispatching message from alice')
    );
  });
});

describe('createMessageCallback', () => {
  let mockState: AccountRuntimeState;
  let mockLog: { info: (...args: unknown[]) => void };

  function createMockRt() {
    return {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: 'test-session',
            accountId: testAccountId,
            matchedBy: 'default',
            agentId: 'test-agent',
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
          dispatchReplyWithBufferedBlockDispatcher: vi.fn(() =>
            Promise.resolve({ queuedFinal: true })
          ),
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
      chatReader: null,
      chatSender: null,
      discovery: null,
      lastError: null,
      lastStartAt: new Date(),
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      messageCallbacks: new Set(),
      watchInterval: null,
      watchErrorCount: 0,
      groupPermissionCache: new Map(),
    };
  });

  it('should create callback for peer message', () => {
    const config: ZTMChatConfig = {
      ...testConfig,
      username: 'testuser',
    };

    const callback = createMessageCallback(
      testAccountId,
      config,
      createMockRt(),
      undefined,
      mockState,
      { log: mockLog }
    );

    const msg: ZTMChatMessage = {
      id: 'msg-peer-1',
      sender: 'alice',
      senderId: 'alice-id',
      content: 'Hello from peer',
      timestamp: new Date(),
      peer: 'alice',
      isGroup: false,
    };

    callback(msg);

    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('peer "alice"'));
  });

  it('should create callback for group message with name', () => {
    const config: ZTMChatConfig = {
      ...testConfig,
      username: 'testuser',
    };

    const callback = createMessageCallback(
      testAccountId,
      config,
      createMockRt(),
      undefined,
      mockState,
      { log: mockLog }
    );

    const msg: ZTMChatMessage = {
      id: 'msg-group-1',
      sender: 'bob',
      senderId: 'bob-id',
      content: 'Hello from group',
      timestamp: new Date(),
      peer: 'bob',
      isGroup: true,
      groupId: 'group-123',
      groupCreator: 'alice',
      groupName: 'Test Group',
    };

    callback(msg);

    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('group "Test Group"'));
  });

  it('should create callback for group message without name', () => {
    const config: ZTMChatConfig = {
      ...testConfig,
      username: 'testuser',
    };

    const callback = createMessageCallback(
      testAccountId,
      config,
      createMockRt(),
      undefined,
      mockState,
      { log: mockLog }
    );

    const msg: ZTMChatMessage = {
      id: 'msg-group-2',
      sender: 'bob',
      senderId: 'bob-id',
      content: 'Hello from group',
      timestamp: new Date(),
      peer: 'bob',
      isGroup: true,
      groupId: 'group-456',
      groupCreator: 'alice',
      groupName: undefined,
    };

    callback(msg);

    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('group group-456'));
  });

  it('should truncate long message content in log', () => {
    const config: ZTMChatConfig = {
      ...testConfig,
      username: 'testuser',
    };

    const callback = createMessageCallback(
      testAccountId,
      config,
      createMockRt(),
      undefined,
      mockState,
      { log: mockLog }
    );

    // Create a long message (more than 100 chars)
    const longContent = 'A'.repeat(150);
    const msg: ZTMChatMessage = {
      id: 'msg-long',
      sender: 'alice',
      senderId: 'alice-id',
      content: longContent,
      timestamp: new Date(),
      peer: 'alice',
      isGroup: false,
    };

    callback(msg);

    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('...'));
  });
});
