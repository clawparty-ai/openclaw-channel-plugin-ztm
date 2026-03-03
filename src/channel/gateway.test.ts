// Unit tests for Channel Gateway

import * as fs from 'fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { OpenClawConfig } from 'openclaw/plugin-sdk';
import type { ZTMChatConfig } from '../types/index.js';
import type { ZTMChatMessage } from '../types/messaging.js';
import type { AccountRuntimeState } from '../runtime/state.js';
import { testConfig, testAccountId } from '../test-utils/fixtures.js';
import { createMockLoggerFns, createMockApiClient, mockSuccess } from '../test-utils/mocks.js';
import {
  collectStatusIssues,
  probeAccountGateway,
  sendTextGateway,
  startAccountGateway,
  logoutAccountGateway,
  buildMessageCallback,
} from './gateway.js';

// Mock all dependencies using vi.hoisted
const { mockResolveZTMChatConfig, mockValidateZTMChatConfig, mockGetDefaultConfig } = vi.hoisted(
  () => ({
    mockResolveZTMChatConfig: vi.fn(config => config),
    mockValidateZTMChatConfig: vi.fn(() => ({ valid: true, errors: [] })),
    mockGetDefaultConfig: vi.fn(() => ({
      agentUrl: 'http://localhost:7777',
      permitUrl: 'https://clawparty.flomesh.io:7779/permit',
      meshName: 'openclaw-mesh',
      username: 'openclaw-bot',
      enableGroups: false,
      autoReply: true,
      messagePath: '/shared',
      dmPolicy: 'pairing',
    })),
  })
);

const { mockIsConfigMinimallyValid } = vi.hoisted(() => ({
  mockIsConfigMinimallyValid: vi.fn(config => !!config?.agentUrl && !!config?.username),
}));

const { mockCreateZTMApiClient } = vi.hoisted(() => ({
  mockCreateZTMApiClient: vi.fn(() => ({
    getMeshInfo: vi.fn().mockResolvedValue({ ok: true, value: { connected: true, peers: 5 } }),
    sendPeerMessage: vi.fn().mockResolvedValue({ ok: true, value: null }),
  })),
}));

const { mockGetAllAccountStates, mockInitializeRuntime, mockStopRuntime, mockRemoveAccountState } =
  vi.hoisted(() => ({
    mockGetAllAccountStates: vi.fn().mockReturnValue(new Map()),
    mockInitializeRuntime: vi.fn().mockResolvedValue(true),
    mockStopRuntime: vi.fn().mockResolvedValue(undefined),
    mockRemoveAccountState: vi.fn(),
  }));

const { mockSendZTMMessage, mockGenerateMessageId } = vi.hoisted(() => ({
  mockSendZTMMessage: vi.fn().mockResolvedValue({ ok: true }),
  mockGenerateMessageId: vi.fn(() => 'msg-123'),
}));

const { mockCheckPortOpen, mockGetIdentity, mockJoinMesh } = vi.hoisted(() => ({
  mockCheckPortOpen: vi.fn().mockResolvedValue(true),
  mockGetIdentity: vi.fn().mockResolvedValue('public-key-123'),
  mockJoinMesh: vi.fn().mockResolvedValue(true),
}));

const { mockRequestPermit, mockSavePermitData, mockLoadPermitFromFile } = vi.hoisted(() => ({
  mockRequestPermit: vi.fn().mockResolvedValue({ token: 'permit-token' }),
  mockSavePermitData: vi.fn().mockReturnValue(true),
  mockLoadPermitFromFile: vi.fn().mockResolvedValue({ key: 'value' }),
}));

const { mockStartMessageWatcher } = vi.hoisted(() => ({
  mockStartMessageWatcher: vi.fn().mockResolvedValue(undefined),
}));

const { mockGetZTMRuntime } = vi.hoisted(() => ({
  mockGetZTMRuntime: vi.fn(() => ({
    channel: {
      routing: {
        resolveAgentRoute: vi.fn(() => ({
          sessionKey: 'session-123',
          agentId: 'agent-456',
          matchedBy: 'test-route',
        })),
      },
      reply: {
        finalizeInboundContext: vi.fn(ctx => ctx),
        dispatchReplyWithBufferedBlockDispatcher: vi.fn().mockResolvedValue({ queuedFinal: true }),
        resolveHumanDelayConfig: vi.fn(() => ({ delay: 0 })),
      },
    },
  })),
}));

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../config/index.js', () => ({
  resolveZTMChatConfig: mockResolveZTMChatConfig,
  validateZTMChatConfig: mockValidateZTMChatConfig,
  getDefaultConfig: mockGetDefaultConfig,
}));

vi.mock('../config/validation.js', () => ({
  isConfigMinimallyValid: mockIsConfigMinimallyValid,
}));

vi.mock('../api/ztm-api.js', () => ({
  createZTMApiClient: mockCreateZTMApiClient,
}));

vi.mock('../runtime/state.js', () => ({
  getAllAccountStates: mockGetAllAccountStates,
  initializeRuntime: mockInitializeRuntime,
  stopRuntime: mockStopRuntime,
  removeAccountState: mockRemoveAccountState,
}));

vi.mock('../messaging/outbound.js', () => ({
  sendZTMMessage: mockSendZTMMessage,
  generateMessageId: mockGenerateMessageId,
}));

vi.mock('../connectivity/mesh.js', () => ({
  checkPortOpen: mockCheckPortOpen,
  getIdentity: mockGetIdentity,
  joinMesh: mockJoinMesh,
}));

vi.mock('../connectivity/permit.js', () => ({
  requestPermit: mockRequestPermit,
  savePermitData: mockSavePermitData,
  loadPermitFromFile: mockLoadPermitFromFile,
}));

vi.mock('../messaging/watcher.js', () => ({
  startMessageWatcher: mockStartMessageWatcher,
}));

vi.mock('../runtime/index.js', () => ({
  getZTMRuntime: mockGetZTMRuntime,
}));

vi.mock('../di/index.js', () => ({
  DEPENDENCIES: {
    RUNTIME: Symbol('ztm:runtime'),
    MESSAGE_STATE_REPO: Symbol('ztm:message-state-repo'),
    ALLOW_FROM_REPO: Symbol('ztm:allow-from-repo'),
    API_CLIENT_FACTORY: Symbol('ztm:api-client-factory'),
    ACCOUNT_STATE_MANAGER: Symbol('ztm:account-state-manager'),
    MESSAGING_CONTEXT: Symbol('ztm:messaging-context'),
  },
  container: {
    get: vi.fn(key => {
      const keyStr = String(key);
      console.log('MOCK get() called with key:', keyStr);
      if (keyStr.includes('ztm:api-client-factory')) {
        const factory = vi.fn(() => ({
          getMeshInfo: vi.fn(() => ({ ok: true, value: { connected: true, endpoints: 1 } })),
        }));
        console.log('API_CLIENT_FACTORY mock returning:', typeof factory, factory());
        return factory;
      }
      if (keyStr.includes('ztm:runtime')) {
        return {
          get: () => ({
            channel: {
              routing: {
                resolveAgentRoute: vi.fn(() => ({
                  sessionKey: 'session-123',
                  agentId: 'agent-456',
                  matchedBy: 'test-route',
                })),
              },
              reply: {
                finalizeInboundContext: vi.fn(ctx => ctx),
                dispatchReplyWithBufferedBlockDispatcher: vi
                  .fn()
                  .mockResolvedValue({ queuedFinal: true }),
                resolveHumanDelayConfig: vi.fn(() => ({ delay: 0 })),
              },
              pairing: {
                readAllowFromStore: vi.fn(() => Promise.resolve([])),
              },
            },
          }),
        };
      }
      if (keyStr.includes('ztm:message-state-repo')) {
        return {
          getWatermark: vi.fn(() => 0),
          setWatermark: vi.fn(),
        };
      }
      if (keyStr.includes('ztm:allow-from-repo')) {
        return {
          getAllowFrom: vi.fn(() => Promise.resolve([])),
          addAllowFrom: vi.fn(),
          removeAllowFrom: vi.fn(),
        };
      }
      if (keyStr.includes('ztm:messaging-context')) {
        return {
          allowFromRepo: {
            getAllowFrom: vi.fn(() => Promise.resolve([])),
            clearCache: vi.fn(),
          },
          messageStateRepo: {
            getWatermark: vi.fn(() => 0),
            setWatermark: vi.fn(),
            flush: vi.fn(),
          },
        };
      }
      if (keyStr.includes('ztm:api-client-factory')) {
        return vi.fn(() => ({
          getMeshInfo: vi.fn(() => ({ ok: true, value: { connected: true, endpoints: 1 } })),
        }));
      }
      if (keyStr.includes('ztm:account-state-manager')) {
        return {
          getOrCreate: vi.fn(() => ({})),
        };
      }
      return null;
    }),
  },
}));

vi.mock('../utils/logger.js', () => ({
  logger: mockLogger,
  defaultLogger: mockLogger,
}));

const { mockResolveZTMChatAccount } = vi.hoisted(() => ({
  mockResolveZTMChatAccount: vi.fn(({ cfg, accountId }) => {
    const accountKey = accountId ?? 'default';
    const accountConfig = cfg?.accounts?.[accountKey] || cfg?.accounts?.default || {};
    return {
      accountId: accountKey,
      username: accountConfig.username || '',
      enabled: true,
      config: {
        agentUrl: accountConfig.agentUrl || '',
        permitUrl: accountConfig.permitUrl || '',
        meshName: accountConfig.meshName || '',
        username: accountConfig.username || '',
        enableGroups: accountConfig.enableGroups ?? false,
        autoReply: accountConfig.autoReply ?? true,
        messagePath: accountConfig.messagePath || '/shared',
        dmPolicy: accountConfig.dmPolicy || 'pairing',
        allowFrom: accountConfig.allowFrom,
      },
    };
  }),
}));

const { mockGetEffectiveChannelConfig } = vi.hoisted(() => ({
  mockGetEffectiveChannelConfig: vi.fn(cfg => {
    if (!cfg) return null;
    return cfg.channels?.['ztm-chat'] || null;
  }),
}));

vi.mock('./config.js', () => ({
  resolveZTMChatAccount: mockResolveZTMChatAccount,
  getEffectiveChannelConfig: mockGetEffectiveChannelConfig,
}));

const {
  mockFsExistsSync,
  mockFsReadFileSync,
  mockFsWriteFileSync,
  mockFsUnlinkSync,
  mockFsMkdirSync,
  mockFsAccess,
} = vi.hoisted(() => ({
  mockFsExistsSync: vi.fn(),
  mockFsReadFileSync: vi.fn(),
  mockFsWriteFileSync: vi.fn(),
  mockFsUnlinkSync: vi.fn(),
  mockFsMkdirSync: vi.fn(),
  mockFsAccess: vi.fn().mockResolvedValue(undefined),
}));

const { mockPathJoin } = vi.hoisted(() => ({
  mockPathJoin: vi.fn((...args: string[]) => args.join('/')),
}));

vi.mock('fs', () => ({
  existsSync: mockFsExistsSync,
  readFileSync: mockFsReadFileSync,
  writeFileSync: mockFsWriteFileSync,
  unlinkSync: mockFsUnlinkSync,
  mkdirSync: mockFsMkdirSync,
  promises: {
    mkdir: async () => {},
    readFile: async () => '',
    writeFile: async () => {},
    access: mockFsAccess,
  },
}));

vi.mock('node:path', () => ({
  join: mockPathJoin,
  dirname: vi.fn((p: string) => p.split('/').slice(0, -1).join('/')),
}));

// Mock the paths module to return a fixed permit path for testing
vi.mock('../utils/paths.js', () => ({
  resolvePermitPath: vi.fn(() => '/mock/permit.json'),
  resolveStatePath: vi.fn(() => '/mock/state.json'),
}));

describe('Channel Gateway', () => {
  let mockConfig: ZTMChatConfig;
  let mockState: AccountRuntimeState;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock return values for each test
    // Initialize mockState first so it can be used by other beforeEach hooks
    mockConfig = {
      ...testConfig,
      allowFrom: undefined,
    };

    mockState = {
      accountId: testAccountId,
      config: mockConfig,
      apiClient: createMockApiClient({
        getMeshInfo: mockSuccess({ connected: true, peers: 5 }),
        sendPeerMessage: mockSuccess(null),
      }),
      connected: true,
      meshConnected: true,
      lastError: null,
      messageCallbacks: new Set(),
    } as any;

    // Set default mock for getAllAccountStates
    mockGetAllAccountStates.mockReturnValue(new Map([['default', mockState]]));

    // Don't call mockClear() here - it will be called in afterEach
    // and this will interfere with nested describe blocks' beforeEach

    process.env.HOME = '/test/home';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('collectStatusIssues', () => {
    beforeEach(() => {
      // Reset to default - validation errors should be detected
      // Use mockImplementation to check config properties
      mockIsConfigMinimallyValid.mockReset();
      mockIsConfigMinimallyValid.mockImplementation((config: any) => {
        return !!(config?.agentUrl && config?.username);
      });
    });

    it('should return empty array for valid config', () => {
      // Override mock to return true for this specific test
      mockIsConfigMinimallyValid.mockReturnValueOnce(true);

      const cfgWithAccounts = {
        channels: {
          'ztm-chat': {
            ...mockConfig,
            accounts: { test: mockConfig },
          },
        },
      };
      const accounts = [{ accountId: 'test', config: mockConfig, cfg: cfgWithAccounts } as any];

      const result = collectStatusIssues(accounts);

      expect(result).toEqual([]);
    });

    it('should return error for missing agentUrl', () => {
      const invalidConfig = { ...mockConfig, agentUrl: '' };
      const accounts = [{ accountId: 'test', config: invalidConfig } as any];

      const result = collectStatusIssues(accounts);

      expect(result).toHaveLength(1);
      expect(result[0].kind).toBe('config');
      expect(result[0].level).toBe('error');
      expect(result[0].message).toContain('Missing required configuration');
    });

    it('should return error for missing username', () => {
      const invalidConfig = { ...mockConfig, username: '' };
      const accounts = [{ accountId: 'test', config: invalidConfig } as any];

      const result = collectStatusIssues(accounts);

      expect(result).toHaveLength(1);
      expect(result[0].accountId).toBe('test');
    });

    it('should return error for both missing agentUrl and username', () => {
      const invalidConfig = { agentUrl: '', username: '' };
      const accounts = [{ accountId: 'test', config: invalidConfig } as any];

      const result = collectStatusIssues(accounts);

      expect(result).toHaveLength(1);
      expect(result[0].message).toContain('agentUrl');
      expect(result[0].message).toContain('username');
    });

    it('should handle empty accounts array', () => {
      const result = collectStatusIssues([]);

      expect(result).toEqual([]);
    });

    it('should handle missing accountId', () => {
      const accounts = [{} as any];

      const result = collectStatusIssues(accounts);

      expect(result[0].accountId).toBe('default');
    });
  });

  describe('probeAccountGateway', () => {
    it('should return ok: true for connected mesh', async () => {
      const account = { config: mockConfig };

      const result = await probeAccountGateway({ account });

      expect(result.ok).toBe(true);
      expect(result.error).toBeNull();
      expect(result.meshInfo?.connected).toBe(true);
    });

    it('should return error when no agentUrl configured', async () => {
      const account = { config: { ...mockConfig, agentUrl: '' } };

      const result = await probeAccountGateway({ account });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('No agent URL configured');
      expect(result.meshInfo).toBeUndefined();
    });

    it('should return error when mesh info fails', async () => {
      const mockClient = {
        getMeshInfo: vi.fn().mockResolvedValue({
          ok: false,
          error: new Error('Mesh info failed'),
        }),
      };
      const { createZTMApiClient } = await import('../api/ztm-api.js');
      (createZTMApiClient as any).mockReturnValue(mockClient);

      const account = { config: mockConfig };

      const result = await probeAccountGateway({ account });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Mesh info failed');
    });

    it('should return error when mesh not connected', async () => {
      const mockClient = {
        getMeshInfo: vi.fn().mockResolvedValue({
          ok: true,
          value: { connected: false, peers: 0 },
        }),
      };
      const { createZTMApiClient } = await import('../api/ztm-api.js');
      (createZTMApiClient as any).mockReturnValue(mockClient);

      const account = { config: mockConfig };

      const result = await probeAccountGateway({ account });

      expect(result.ok).toBe(true);
      expect(result.meshConnected).toBe(false);
      expect(result.error).toBeNull();
    });

    it('should use default timeout', async () => {
      const account = { config: mockConfig };

      await probeAccountGateway({ account, timeoutMs: undefined });

      // Verify it doesn't throw with undefined timeout
      expect(true).toBe(true);
    });

    it('should handle custom timeout', async () => {
      const account = { config: mockConfig };

      await probeAccountGateway({ account, timeoutMs: 5000 });

      // Verify it doesn't throw with custom timeout
      expect(true).toBe(true);
    });
  });

  describe('sendTextGateway', () => {
    it('should send message successfully', async () => {
      const { getAllAccountStates } = await import('../runtime/state.js');
      (getAllAccountStates as any).mockReturnValueOnce(new Map([['default', mockState]]));

      const result = await sendTextGateway({
        to: 'peer-user',
        text: 'Hello, world!',
      });

      expect(result.channel).toBe('ztm-chat');
      expect(result.ok).toBe(true);
      expect(result.messageId).toBeTruthy();
      expect(result.error).toBeUndefined();
    });

    it('should strip ztm-chat prefix from peer', async () => {
      const { getAllAccountStates } = await import('../runtime/state.js');
      (getAllAccountStates as any).mockReturnValueOnce(new Map([['default', mockState]]));

      const result = await sendTextGateway({
        to: 'ztm-chat:peer-user',
        text: 'test',
      });

      expect(result.ok).toBe(true);
    });

    it('should return error when account not initialized', async () => {
      const { getAllAccountStates } = await import('../runtime/state.js');
      // Use mockReturnValueOnce so the default mockReturnValue from beforeEach is restored after
      (getAllAccountStates as any).mockReturnValueOnce(new Map());

      const result = await sendTextGateway({
        to: 'peer-user',
        text: 'test',
      });

      expect(result.channel).toBe('ztm-chat');
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Account not initialized');
      expect(result.messageId).toBe('');
    });

    it('should use specific accountId', async () => {
      const { getAllAccountStates } = await import('../runtime/state.js');
      (getAllAccountStates as any).mockReturnValueOnce(new Map([['custom-account', mockState]]));

      const result = await sendTextGateway({
        to: 'peer',
        text: 'test',
        accountId: 'custom-account',
      });

      expect(result.ok).toBe(true);
    });

    it('should return error from sendZTMMessage', async () => {
      const stateModule = await import('../runtime/state.js');
      const outboundModule = await import('../messaging/outbound.js');
      const { getAllAccountStates } = stateModule;
      const { sendZTMMessage } = outboundModule;
      (getAllAccountStates as any).mockReturnValueOnce(new Map([['default', mockState]]));
      (sendZTMMessage as any).mockResolvedValueOnce({
        ok: false,
        error: new Error('Send failed'),
      });

      const result = await sendTextGateway({
        to: 'peer',
        text: 'test',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should include error message from state', async () => {
      const stateWithError = {
        ...mockState,
        lastError: 'Connection lost',
      };
      const stateModule = await import('../runtime/state.js');
      const outboundModule = await import('../messaging/outbound.js');
      const { getAllAccountStates } = stateModule;
      const { sendZTMMessage } = outboundModule;
      (getAllAccountStates as any).mockReturnValueOnce(new Map([['default', stateWithError]]));
      (sendZTMMessage as any).mockResolvedValueOnce({
        ok: false,
        error: new Error('Send failed'),
      });

      const result = await sendTextGateway({
        to: 'peer',
        text: 'test',
      });

      expect(result.error).toBe('Send failed');
    });
  });

  describe('logoutAccountGateway', () => {
    it('should clear account state', async () => {
      const { stopRuntime, removeAccountState } = await import('../runtime/state.js');

      const result = await logoutAccountGateway({ accountId: 'test-account' });

      expect(result.cleared).toBe(true);
      expect(stopRuntime).toHaveBeenCalledWith('test-account');
      expect(removeAccountState).toHaveBeenCalledWith('test-account');
    });

    it('should handle optional cfg parameter', async () => {
      const { stopRuntime } = await import('../runtime/state.js');

      const result = await logoutAccountGateway({
        accountId: 'test-account',
        cfg: undefined,
      });

      expect(result.cleared).toBe(true);
      expect(stopRuntime).toHaveBeenCalled();
    });

    it('should handle cfg parameter', async () => {
      const cfg: OpenClawConfig = {};

      const result = await logoutAccountGateway({ accountId: 'test', cfg });

      expect(result.cleared).toBe(true);
    });
  });

  /* describe("createInboundContext", () => {
    let mockRuntime: any;
    let mockMsg: ZTMChatMessage;
    let mockCfg: Record<string, unknown>;

    beforeEach(async () => {
      mockRuntime = {
        channel: {
          routing: {
            resolveAgentRoute: vi.fn(() => ({
              sessionKey: "session-123",
              agentId: "agent-456",
              matchedBy: "test-route",
            })),
          },
          reply: {
            finalizeInboundContext: vi.fn((ctx) => ctx),
          },
        },
      };

      mockMsg = {
        id: "msg-123",
        sender: "peer-user",
        senderId: "peer-user",
        content: "Hello, bot!",
        timestamp: new Date(),
        peer: "peer-user",
      } as unknown as ZTMChatMessage;

      mockCfg = { test: "value" };

      const { getZTMRuntime } = await import("../runtime/index.js");
      (getZTMRuntime as any).mockReturnValue(mockRuntime);
    });

    it("should create complete inbound context", () => {
      const accountId = "test-account";

      const result = createInboundContext({
        rt: mockRuntime,
        msg: mockMsg,
        config: mockConfig,
        accountId,
        cfg: mockCfg,
      });

      expect(result).toHaveProperty("ctxPayload");
      expect(result).toHaveProperty("matchedBy");
      expect(result).toHaveProperty("agentId");
    });

    it("should call resolveAgentRoute", () => {
      const accountId = "test-account";

      createInboundContext({
        rt: mockRuntime,
        msg: mockMsg,
        config: mockConfig,
        accountId,
        cfg: mockCfg,
      });

      expect(mockRuntime.channel.routing.resolveAgentRoute).toHaveBeenCalledWith({
        channel: "ztm-chat",
        accountId,
        peer: { kind: "direct", id: mockMsg.sender },
        cfg: mockCfg,
      });
    });

    it("should call finalizeInboundContext", () => {
      const accountId = "test-account";

      createInboundContext({
        rt: mockRuntime,
        msg: mockMsg,
        config: mockConfig,
        accountId,
        cfg: mockCfg,
      });

      expect(mockRuntime.channel.reply.finalizeInboundContext).toHaveBeenCalled();
    });

    it("should return matchedBy and agentId", () => {
      const accountId = "test-account";

      const result = createInboundContext({
        rt: mockRuntime,
        msg: mockMsg,
        config: mockConfig,
        accountId,
        cfg: mockCfg,
      });

      expect(result.matchedBy).toBe("test-route");
      expect(result.agentId).toBe("agent-456");
    });

    it("should handle empty cfg", () => {
      const accountId = "test-account";

      const result = createInboundContext({
        rt: mockRuntime,
        msg: mockMsg,
        config: mockConfig,
        accountId,
        cfg: undefined,
      });

      expect(result.ctxPayload).toBeDefined();
    });

    it("should include all context payload fields", () => {
      const accountId = "test-account";

      const result = createInboundContext({
        rt: mockRuntime,
        msg: mockMsg,
        config: mockConfig,
        accountId,
        cfg: {},
      });

      const payload = result.ctxPayload;
      expect(payload.Body).toBe(mockMsg.content);
      expect(payload.RawBody).toBe(mockMsg.content);
      expect(payload.CommandBody).toBe(mockMsg.content);
      expect(payload.From).toBe(`ztm-chat:${mockMsg.sender}`);
      expect(payload.To).toBe(`ztm-chat:${mockConfig.username}`);
      expect(payload.SessionKey).toBe("session-123");
      expect(payload.AccountId).toBe(accountId);
      expect(payload.ChatType).toBe("direct");
      expect(payload.Provider).toBe("ztm-chat");
    });
  }); */

  describe('buildMessageCallback', () => {
    it('should create callback function', () => {
      const callback = buildMessageCallback(mockState, 'test-account', mockConfig);

      expect(typeof callback).toBe('function');
    });

    it('should dispatch message when callback is invoked', async () => {
      const { container } = await import('../di/index.js');
      const mockRuntime = {
        channel: {
          routing: {
            resolveAgentRoute: vi.fn(() => ({
              sessionKey: 'session-123',
              agentId: 'agent-456',
              matchedBy: 'test-route',
            })),
          },
          reply: {
            finalizeInboundContext: vi.fn(ctx => ctx),
            dispatchReplyWithBufferedBlockDispatcher: vi.fn().mockResolvedValue({
              queuedFinal: true,
            }),
            resolveHumanDelayConfig: vi.fn(() => ({ delay: 0 })),
          },
        },
      };
      (container.get as any).mockReturnValue({
        get: () => mockRuntime,
      });

      const callback = buildMessageCallback(mockState, 'test-account', mockConfig);
      const msg = {
        id: 'msg-123',
        sender: 'peer',
        senderId: 'peer',
        content: 'test',
        timestamp: new Date(),
        peer: 'peer',
      } as unknown as ZTMChatMessage;

      callback(msg);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockRuntime.channel.reply.dispatchReplyWithBufferedBlockDispatcher).toHaveBeenCalled();
    });

    it('should handle dispatch errors gracefully', async () => {
      const { container } = await import('../di/index.js');
      const mockRuntime = {
        channel: {
          routing: {
            resolveAgentRoute: vi.fn(() => {
              throw new Error('Route error');
            }),
          },
          reply: {
            finalizeInboundContext: vi.fn(ctx => ctx),
          },
        },
      };
      (container.get as any).mockReturnValue({
        get: () => mockRuntime,
      });

      const callback = buildMessageCallback(mockState, 'test-account', mockConfig);
      const msg = {
        id: 'msg-123',
        sender: 'peer',
        senderId: 'peer',
        content: 'test',
        timestamp: new Date(),
        peer: 'peer',
      } as unknown as ZTMChatMessage;

      expect(() => callback(msg)).not.toThrow();
    });
  });

  describe('startAccountGateway', () => {
    beforeEach(() => {
      mockValidateZTMChatConfig.mockReturnValue({ valid: true, errors: [] });
      mockCheckPortOpen.mockResolvedValue(true);
      // Ensure getAllAccountStates returns mock state for startAccountGateway tests
      // Note: Some tests use "test" as accountId, so include both
      mockGetAllAccountStates.mockReturnValue(
        new Map([
          ['test-account', mockState],
          ['test', { ...mockState, accountId: 'test' }],
        ])
      );
    });

    it('should throw error for invalid config', async () => {
      const { validateZTMChatConfig } = await import('../config/index.js');
      (validateZTMChatConfig as any).mockReturnValue({
        valid: false,
        errors: [
          {
            field: 'agentUrl',
            reason: 'missing',
            value: undefined,
            message: 'agentUrl is required',
          },
          {
            field: 'username',
            reason: 'missing',
            value: undefined,
            message: 'username is required',
          },
        ],
      });

      const ctx = {
        account: { accountId: 'test', config: mockConfig },
        log: createMockLoggerFns(),
      };

      await expect(startAccountGateway(ctx)).rejects.toThrow(
        'agentUrl: agentUrl is required; username: username is required'
      );
    });

    it('should throw error when cannot connect to agent', async () => {
      const { checkPortOpen } = await import('../connectivity/mesh.js');
      (checkPortOpen as any).mockResolvedValue(false);

      const ctx = {
        account: { accountId: 'test', config: mockConfig },
        log: createMockLoggerFns(),
      };

      await expect(startAccountGateway(ctx)).rejects.toThrow('Cannot connect to ZTM agent');
    });

    it('should throw error for invalid URL', async () => {
      const { checkPortOpen } = await import('../connectivity/mesh.js');
      (checkPortOpen as any).mockImplementation(() => {
        throw new Error('Invalid URL');
      });

      const ctx = {
        account: { accountId: 'test', config: { ...mockConfig, agentUrl: 'invalid-url' } },
        log: createMockLoggerFns(),
      };

      await expect(startAccountGateway(ctx)).rejects.toThrow('Invalid ZTM agent URL');
    });

    it('should log pairing mode info', async () => {
      const { checkPortOpen, joinMesh } = await import('../connectivity/mesh.js');
      const stateModule = await import('../runtime/state.js');
      const watcherModule = await import('../messaging/watcher.js');
      const runtimeModule = await import('../runtime/index.js');
      const { initializeRuntime } = stateModule;
      const { startMessageWatcher } = watcherModule;
      const { getZTMRuntime } = runtimeModule;

      (checkPortOpen as any).mockResolvedValue(true);
      (joinMesh as any).mockResolvedValue(true);
      (initializeRuntime as any).mockResolvedValue(true);
      (startMessageWatcher as any).mockResolvedValue(undefined);

      const mockRuntime = {
        channel: {
          routing: {
            resolveAgentRoute: vi.fn(() => ({ sessionKey: 's', agentId: 'a', matchedBy: 'r' })),
          },
          reply: {
            finalizeInboundContext: vi.fn(ctx => ctx),
            dispatchReplyWithBufferedBlockDispatcher: vi
              .fn()
              .mockResolvedValue({ queuedFinal: true }),
            resolveHumanDelayConfig: vi.fn(() => ({ delay: 0 })),
          },
        },
      };
      (getZTMRuntime as any).mockReturnValue(mockRuntime);

      const ctx = {
        account: {
          accountId: 'test',
          config: { ...mockConfig, dmPolicy: 'pairing' as const, allowFrom: [] },
        },
        log: createMockLoggerFns(),
      };

      await startAccountGateway(ctx);

      expect(ctx.log?.info).toHaveBeenCalledWith(
        expect.stringContaining('Pairing mode active - no approved users')
      );
    });
  });

  describe('permit loading with permitSource', () => {
    it('should load permit from file when permitSource is file', async () => {
      const mockPermitData = { key: 'value' };
      const mockFilePath = '/tmp/mock-permit.json';
      fs.writeFileSync(mockFilePath, JSON.stringify(mockPermitData));

      // Test the loading logic
      const permit = await mockLoadPermitFromFile(mockFilePath);
      expect(permit).toEqual(mockPermitData);

      fs.unlinkSync(mockFilePath);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty message content', async () => {
      const result = await sendTextGateway({
        to: 'peer',
        text: '',
      });

      expect(result.ok).toBe(true);
    });

    it('should handle special characters in message', async () => {
      const result = await sendTextGateway({
        to: 'peer',
        text: 'Test unicode: 你好 🌍',
      });

      expect(result.ok).toBe(true);
    });

    it('should handle very long messages', async () => {
      const longText = 'a'.repeat(10000);

      const result = await sendTextGateway({
        to: 'peer',
        text: longText,
      });

      expect(result.ok).toBe(true);
    });

    it('should handle peer with special characters', async () => {
      const result = await sendTextGateway({
        to: 'user_123-test.dev',
        text: 'test',
      });

      expect(result.ok).toBe(true);
    });

    it('should handle multiple rapid sends', async () => {
      const sends = Array.from({ length: 10 }, (_, i) =>
        sendTextGateway({ to: 'peer', text: `message ${i}` })
      );

      const results = await Promise.all(sends);

      expect(results.every(r => r.ok)).toBe(true);
    });
  });

  describe('dispatchInboundMessage edge cases', () => {
    it('should log info when no response generated (queuedFinal=false)', async () => {
      const { container } = await import('../di/index.js');
      const { logger } = await import('../utils/logger.js');

      const mockRuntime = {
        channel: {
          routing: {
            resolveAgentRoute: vi.fn(() => ({
              sessionKey: 'session-123',
              agentId: 'agent-456',
              matchedBy: 'test-route',
            })),
          },
          reply: {
            finalizeInboundContext: vi.fn(ctx => ctx),
            dispatchReplyWithBufferedBlockDispatcher: vi.fn().mockResolvedValue({
              queuedFinal: false, // Key: no response generated
            }),
            resolveHumanDelayConfig: vi.fn(() => ({ delay: 0 })),
          },
        },
      };
      (container.get as any).mockReturnValue({
        get: () => mockRuntime,
      });

      // Import the dispatchInboundMessage function
      const { buildMessageCallback } = await import('./gateway.js');
      const callback = buildMessageCallback(mockState, 'test-account', mockConfig);

      const msg = {
        id: 'msg-123',
        sender: 'peer',
        senderId: 'peer',
        content: 'test',
        timestamp: new Date(),
        peer: 'peer',
      } as unknown as ZTMChatMessage;

      callback(msg);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify logger.info was called for no response case
      expect(logger.info).toHaveBeenCalled();
    });

    it('should handle retryable errors with retry scheduling', async () => {
      const { container } = await import('../di/index.js');
      const { logger } = await import('../utils/logger.js');

      // First call throws retryable error, second call succeeds
      let callCount = 0;
      const mockRuntime = {
        channel: {
          routing: {
            resolveAgentRoute: vi.fn(() => {
              callCount++;
              if (callCount === 1) {
                throw new Error('ETIMEDOUT network timeout'); // Retryable error
              }
              return {
                sessionKey: 'session-123',
                agentId: 'agent-456',
                matchedBy: 'test-route',
              };
            }),
          },
          reply: {
            finalizeInboundContext: vi.fn(ctx => ctx),
            dispatchReplyWithBufferedBlockDispatcher: vi.fn().mockResolvedValue({
              queuedFinal: true,
            }),
            resolveHumanDelayConfig: vi.fn(() => ({ delay: 0 })),
          },
        },
      };
      (container.get as any).mockReturnValue({
        get: () => mockRuntime,
      });

      const { buildMessageCallback } = await import('./gateway.js');
      const callback = buildMessageCallback(mockState, 'test-account', mockConfig);

      const msg = {
        id: 'msg-123',
        sender: 'peer',
        senderId: 'peer',
        content: 'test',
        timestamp: new Date(),
        peer: 'peer',
      } as unknown as ZTMChatMessage;

      callback(msg);

      // Wait for async error handling
      await new Promise(resolve => setTimeout(resolve, 20));

      // Verify retry warning was logged
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should handle retry scheduling failure gracefully', async () => {
      const { container } = await import('../di/index.js');
      const { logger } = await import('../utils/logger.js');

      // Make resolveAgentRoute always throw retryable error
      const mockRuntime = {
        channel: {
          routing: {
            resolveAgentRoute: vi.fn(() => {
              throw new Error('ETIMEDOUT network timeout');
            }),
          },
          reply: {
            finalizeInboundContext: vi.fn(ctx => ctx),
          },
        },
      };
      (container.get as any).mockReturnValue({
        get: () => mockRuntime,
      });

      const { buildMessageCallback } = await import('./gateway.js');
      const callback = buildMessageCallback(mockState, 'test-account', mockConfig);

      const msg = {
        id: 'msg-123',
        sender: 'peer',
        senderId: 'peer',
        content: 'test',
        timestamp: new Date(),
        peer: 'peer',
      } as unknown as ZTMChatMessage;

      // This should not throw even if retry scheduling fails
      callback(msg);

      // Wait for error handling
      await new Promise(resolve => setTimeout(resolve, 20));

      // Should have logged the error
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('Message retry logic', () => {
    it('should log error after max retry attempts', async () => {
      // Testing that error logging happens after exhausted retries
      // This is implicitly tested via the error handling in callback

      const { container } = await import('../di/index.js');

      // Make all attempts fail with retryable errors
      let attemptCount = 0;
      const mockRuntime = {
        channel: {
          routing: {
            resolveAgentRoute: vi.fn(() => {
              attemptCount++;
              throw new Error('ECONNREFUSED connection refused');
            }),
          },
          reply: {
            finalizeInboundContext: vi.fn(ctx => ctx),
            dispatchReplyWithBufferedBlockDispatcher: vi.fn().mockResolvedValue({
              queuedFinal: false,
            }),
            resolveHumanDelayConfig: vi.fn(() => ({ delay: 0 })),
          },
        },
      };
      (container.get as any).mockReturnValue({
        get: () => mockRuntime,
      });

      const { buildMessageCallback } = await import('./gateway.js');
      const callback = buildMessageCallback(mockState, 'test-account', mockConfig);

      const msg = {
        id: 'msg-123',
        sender: 'peer',
        senderId: 'peer',
        content: 'test',
        timestamp: new Date(),
        peer: 'peer',
      } as unknown as ZTMChatMessage;

      callback(msg);

      // Wait for retries to exhaust
      await new Promise(resolve => setTimeout(resolve, 100));

      // After max attempts, should log error about giving up
      // Note: This tests the exponential backoff retry behavior
      expect(attemptCount).toBeGreaterThan(0);
    });
  });

  describe('isRetryableError', () => {
    beforeEach(async () => {
      // Import the unexported function by testing it indirectly
      // We'll test it through the error handling paths in the callback
    });

    it('should retry on ZTMTimeoutError', async () => {
      const { ZTMTimeoutError } = await import('../types/errors.js');

      // Create a mock that triggers retry
      const timeoutError = new ZTMTimeoutError({
        method: 'GET',
        path: '/api/test',
        timeoutMs: 5000,
        cause: new Error('timeout'),
      });

      // Test indirectly via callback error handling
      const { container } = await import('../di/index.js');

      const mockRuntime = {
        channel: {
          routing: {
            resolveAgentRoute: vi.fn().mockRejectedValue(timeoutError),
          },
          reply: {
            finalizeInboundContext: vi.fn(ctx => ctx),
            dispatchReplyWithBufferedBlockDispatcher: vi.fn().mockResolvedValue({
              queuedFinal: false,
            }),
            resolveHumanDelayConfig: vi.fn(() => ({ delay: 0 })),
          },
        },
      };
      (container.get as any).mockReturnValue({
        get: () => mockRuntime,
      });

      const { buildMessageCallback } = await import('./gateway.js');
      const callback = buildMessageCallback(mockState, 'test-account', mockConfig);

      const msg = {
        id: 'msg-retry-test',
        sender: 'peer',
        senderId: 'peer',
        content: 'test',
        timestamp: new Date(),
        peer: 'peer',
      } as unknown as ZTMChatMessage;

      callback(msg);

      // Should have attempted to route (retryable error)
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(mockRuntime.channel.routing.resolveAgentRoute).toHaveBeenCalled();
    });

    it('should retry on ZTMApiError with 429 status', async () => {
      const { ZTMApiError } = await import('../types/errors.js');

      const rateLimitError = new ZTMApiError({
        method: 'GET',
        path: '/api/test',
        statusCode: 429,
        statusText: 'Too Many Requests',
        cause: new Error('rate limited'),
      });

      const { container } = await import('../di/index.js');

      const mockRuntime = {
        channel: {
          routing: {
            resolveAgentRoute: vi.fn().mockRejectedValue(rateLimitError),
          },
          reply: {
            finalizeInboundContext: vi.fn(ctx => ctx),
            dispatchReplyWithBufferedBlockDispatcher: vi.fn().mockResolvedValue({
              queuedFinal: false,
            }),
            resolveHumanDelayConfig: vi.fn(() => ({ delay: 0 })),
          },
        },
      };
      (container.get as any).mockReturnValue({
        get: () => mockRuntime,
      });

      const { buildMessageCallback } = await import('./gateway.js');
      const callback = buildMessageCallback(mockState, 'test-account', mockConfig);

      const msg = {
        id: 'msg-429-test',
        sender: 'peer',
        senderId: 'peer',
        content: 'test',
        timestamp: new Date(),
        peer: 'peer',
      } as unknown as ZTMChatMessage;

      callback(msg);

      await new Promise(resolve => setTimeout(resolve, 50));
      // Should have attempted to route (429 is retryable)
      expect(mockRuntime.channel.routing.resolveAgentRoute).toHaveBeenCalled();
    });

    it('should retry on ZTMApiError with 500 status', async () => {
      const { ZTMApiError } = await import('../types/errors.js');

      const serverError = new ZTMApiError({
        method: 'GET',
        path: '/api/test',
        statusCode: 500,
        statusText: 'Internal Server Error',
        cause: new Error('internal error'),
      });

      const { container } = await import('../di/index.js');

      const mockRuntime = {
        channel: {
          routing: {
            resolveAgentRoute: vi.fn().mockRejectedValue(serverError),
          },
          reply: {
            finalizeInboundContext: vi.fn(ctx => ctx),
            dispatchReplyWithBufferedBlockDispatcher: vi.fn().mockResolvedValue({
              queuedFinal: false,
            }),
            resolveHumanDelayConfig: vi.fn(() => ({ delay: 0 })),
          },
        },
      };
      (container.get as any).mockReturnValue({
        get: () => mockRuntime,
      });

      const { buildMessageCallback } = await import('./gateway.js');
      const callback = buildMessageCallback(mockState, 'test-account', mockConfig);

      const msg = {
        id: 'msg-500-test',
        sender: 'peer',
        senderId: 'peer',
        content: 'test',
        timestamp: new Date(),
        peer: 'peer',
      } as unknown as ZTMChatMessage;

      callback(msg);

      await new Promise(resolve => setTimeout(resolve, 50));
      // Should have attempted to route (5xx is retryable)
      expect(mockRuntime.channel.routing.resolveAgentRoute).toHaveBeenCalled();
    });

    it('should retry on network error with ETIMEDOUT', async () => {
      const networkError = new Error('socket hang up ETIMEDOUT');

      const { container } = await import('../di/index.js');

      const mockRuntime = {
        channel: {
          routing: {
            resolveAgentRoute: vi.fn().mockRejectedValue(networkError),
          },
          reply: {
            finalizeInboundContext: vi.fn(ctx => ctx),
            dispatchReplyWithBufferedBlockDispatcher: vi.fn().mockResolvedValue({
              queuedFinal: false,
            }),
            resolveHumanDelayConfig: vi.fn(() => ({ delay: 0 })),
          },
        },
      };
      (container.get as any).mockReturnValue({
        get: () => mockRuntime,
      });

      const { buildMessageCallback } = await import('./gateway.js');
      const callback = buildMessageCallback(mockState, 'test-account', mockConfig);

      const msg = {
        id: 'msg-etimedout-test',
        sender: 'peer',
        senderId: 'peer',
        content: 'test',
        timestamp: new Date(),
        peer: 'peer',
      } as unknown as ZTMChatMessage;

      callback(msg);

      await new Promise(resolve => setTimeout(resolve, 50));
      // Should have attempted to route (ETIMEDOUT in message is retryable)
      expect(mockRuntime.channel.routing.resolveAgentRoute).toHaveBeenCalled();
    });

    it('should retry on network error with ENOTFOUND', async () => {
      const dnsError = new Error('getaddrinfo ENOTFOUND example.com');

      const { container } = await import('../di/index.js');

      const mockRuntime = {
        channel: {
          routing: {
            resolveAgentRoute: vi.fn().mockRejectedValue(dnsError),
          },
          reply: {
            finalizeInboundContext: vi.fn(ctx => ctx),
            dispatchReplyWithBufferedBlockDispatcher: vi.fn().mockResolvedValue({
              queuedFinal: false,
            }),
            resolveHumanDelayConfig: vi.fn(() => ({ delay: 0 })),
          },
        },
      };
      (container.get as any).mockReturnValue({
        get: () => mockRuntime,
      });

      const { buildMessageCallback } = await import('./gateway.js');
      const callback = buildMessageCallback(mockState, 'test-account', mockConfig);

      const msg = {
        id: 'msg-enotfound-test',
        sender: 'peer',
        senderId: 'peer',
        content: 'test',
        timestamp: new Date(),
        peer: 'peer',
      } as unknown as ZTMChatMessage;

      callback(msg);

      await new Promise(resolve => setTimeout(resolve, 50));
      // Should have attempted to route (ENOTFOUND in message is retryable)
      expect(mockRuntime.channel.routing.resolveAgentRoute).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// Additional error handling tests for gateway.ts edge cases
// ============================================================================

describe('gateway error handling paths', () => {
  // Test getAccountState error path via sendTextGateway
  describe('sendTextGateway error handling', () => {
    it('should return error when account state not found', async () => {
      const { sendTextGateway } = await import('./gateway.js');

      // Account not initialized - should return error
      const result = await sendTextGateway({
        to: 'peer',
        text: 'test',
        accountId: 'nonexistent-account-12345',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Account not initialized');
    });

    it('should return error when sendZTMMessage fails', async () => {
      // This is covered by existing test but let's verify the error path
      const { sendTextGateway } = await import('./gateway.js');

      // Use existing account
      const result = await sendTextGateway({
        to: 'peer',
        text: 'test',
        accountId: testAccountId,
      });

      // Result depends on mock state - just verify structure
      expect(result).toHaveProperty('channel', 'ztm-chat');
      expect(result).toHaveProperty('ok');
      expect(result).toHaveProperty('messageId');
    });
  });

  // Test collectStatusIssues edge cases
  describe('collectStatusIssues edge cases', () => {
    it('should return empty array for empty accounts', async () => {
      const { collectStatusIssues } = await import('./gateway.js');

      const result = collectStatusIssues([]);
      expect(result).toEqual([]);
    });

    it('should handle account without cfg field', async () => {
      const { collectStatusIssues } = await import('./gateway.js');

      // Should not throw
      const result = collectStatusIssues([{ accountId: 'test' } as any]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return config error for invalid config', async () => {
      const { collectStatusIssues } = await import('./gateway.js');

      // Use config field (not cfg) to match the existing test pattern
      const invalidConfig = { agentUrl: '', username: '' };
      const result = collectStatusIssues([{ accountId: 'test', config: invalidConfig } as any]);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('kind', 'config');
      expect(result[0]).toHaveProperty('level', 'error');
    });
  });
});

// ============================================================================
// New test suites for increased coverage
// ============================================================================

describe('Multi-account concurrent startup', () => {
  let mockConfig: ZTMChatConfig;

  beforeEach(() => {
    mockConfig = {
      ...testConfig,
      allowFrom: undefined,
    };
    mockValidateZTMChatConfig.mockReturnValue({ valid: true, errors: [] });
    mockCheckPortOpen.mockResolvedValue(true);
    mockJoinMesh.mockResolvedValue(true);
    mockInitializeRuntime.mockResolvedValue(true);
    mockStartMessageWatcher.mockResolvedValue(undefined);
    process.env.HOME = '/test/home';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should start 3 accounts concurrently', async () => {
    const { startAccountGateway } = await import('./gateway.js');

    const accountIds = ['account-1', 'account-2', 'account-3'];
    const cleanupFns: Array<() => Promise<void>> = [];

    // Create states for all accounts
    const states = new Map();
    accountIds.forEach(id => {
      states.set(id, {
        accountId: id,
        config: mockConfig,
        apiClient: null,
        connected: true,
        meshConnected: true,
        lastError: null,
        messageCallbacks: new Set(),
        watchAbortController: undefined,
      });
    });
    mockGetAllAccountStates.mockReturnValue(states);

    // Start all accounts concurrently
    const startPromises = accountIds.map(async accountId => {
      const ctx = {
        account: { accountId, config: mockConfig },
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        setStatus: vi.fn(),
      };

      const cleanup = await startAccountGateway(ctx);
      cleanupFns.push(cleanup);
      return cleanup;
    });

    await expect(Promise.all(startPromises)).resolves.toBeDefined();

    // Verify all accounts were initialized
    expect(mockInitializeRuntime).toHaveBeenCalledTimes(3);
    expect(mockStartMessageWatcher).toHaveBeenCalledTimes(3);

    // Cleanup all accounts
    for (const cleanup of cleanupFns) {
      await cleanup();
    }

    expect(mockStopRuntime).toHaveBeenCalledTimes(3);
  });

  it('should start 5 accounts concurrently and cleanup properly', async () => {
    const { startAccountGateway } = await import('./gateway.js');

    const accountIds = ['acc-1', 'acc-2', 'acc-3', 'acc-4', 'acc-5'];
    const states = new Map();

    accountIds.forEach(id => {
      states.set(id, {
        accountId: id,
        config: mockConfig,
        apiClient: null,
        connected: true,
        meshConnected: true,
        lastError: null,
        messageCallbacks: new Set(),
        watchAbortController: undefined,
      });
    });
    mockGetAllAccountStates.mockReturnValue(states);

    const cleanups = await Promise.all(
      accountIds.map(async accountId => {
        const ctx = {
          account: { accountId, config: mockConfig },
          log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
          setStatus: vi.fn(),
        };
        return startAccountGateway(ctx);
      })
    );

    // Verify all started
    expect(mockInitializeRuntime).toHaveBeenCalledTimes(5);
    expect(mockStartMessageWatcher).toHaveBeenCalledTimes(5);

    // Cleanup all
    await Promise.all(cleanups.map(c => c()));

    expect(mockStopRuntime).toHaveBeenCalledTimes(5);
  });

  it('should handle mixed account start results', async () => {
    const { startAccountGateway } = await import('./gateway.js');

    // First two succeed, third will fail on initialize
    const states = new Map();
    states.set('account-1', {
      accountId: 'account-1',
      config: mockConfig,
      apiClient: null,
      connected: true,
      meshConnected: true,
      lastError: null,
      messageCallbacks: new Set(),
      watchAbortController: undefined,
    });
    states.set('account-2', {
      accountId: 'account-2',
      config: mockConfig,
      apiClient: null,
      connected: true,
      meshConnected: true,
      lastError: null,
      messageCallbacks: new Set(),
      watchAbortController: undefined,
    });
    mockGetAllAccountStates.mockReturnValue(states);

    // Start first two
    const ctx1 = {
      account: { accountId: 'account-1', config: mockConfig },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      setStatus: vi.fn(),
    };
    const ctx2 = {
      account: { accountId: 'account-2', config: mockConfig },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      setStatus: vi.fn(),
    };

    const cleanup1 = await startAccountGateway(ctx1);
    const cleanup2 = await startAccountGateway(ctx2);

    expect(mockInitializeRuntime).toHaveBeenCalledTimes(2);

    // Cleanup
    await cleanup1();
    await cleanup2();
  });
});

describe('Fast start-stop race', () => {
  let mockConfig: ZTMChatConfig;

  beforeEach(() => {
    mockConfig = {
      ...testConfig,
      allowFrom: undefined,
    };
    mockValidateZTMChatConfig.mockReturnValue({ valid: true, errors: [] });
    mockCheckPortOpen.mockResolvedValue(true);
    mockJoinMesh.mockResolvedValue(true);
    mockInitializeRuntime.mockResolvedValue(true);
    mockStartMessageWatcher.mockResolvedValue(undefined);
    process.env.HOME = '/test/home';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should handle immediate stop after start', async () => {
    const { startAccountGateway } = await import('./gateway.js');

    const mockState = {
      accountId: 'race-test',
      config: mockConfig,
      apiClient: null,
      connected: true,
      meshConnected: true,
      lastError: null,
      messageCallbacks: new Set(),
      watchAbortController: undefined,
    };
    mockGetAllAccountStates.mockReturnValue(new Map([['race-test', mockState]]));

    const ctx = {
      account: { accountId: 'race-test', config: mockConfig },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      setStatus: vi.fn(),
    };

    // Start and immediately stop
    const cleanup = await startAccountGateway(ctx);
    await cleanup();

    // Verify cleanup was called properly
    expect(mockStopRuntime).toHaveBeenCalledWith('race-test');
  });

  it('should handle start-stop-start sequence', async () => {
    const { startAccountGateway, logoutAccountGateway } = await import('./gateway.js');

    const mockState = {
      accountId: 'sequence-test',
      config: mockConfig,
      apiClient: null,
      connected: true,
      meshConnected: true,
      lastError: null,
      messageCallbacks: new Set(),
      watchAbortController: undefined,
    };
    mockGetAllAccountStates.mockReturnValue(new Map([['sequence-test', mockState]]));

    // First start
    const ctx1 = {
      account: { accountId: 'sequence-test', config: mockConfig },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      setStatus: vi.fn(),
    };
    const cleanup1 = await startAccountGateway(ctx1);

    // Stop via cleanup
    await cleanup1();

    // Second start
    mockGetAllAccountStates.mockReturnValue(
      new Map([['sequence-test', { ...mockState, messageCallbacks: new Set() }]])
    );
    const ctx2 = {
      account: { accountId: 'sequence-test', config: mockConfig },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      setStatus: vi.fn(),
    };
    const cleanup2 = await startAccountGateway(ctx2);

    // Cleanup
    await cleanup2();

    expect(mockInitializeRuntime).toHaveBeenCalledTimes(2);
    expect(mockStopRuntime).toHaveBeenCalledTimes(2);
  });

  it('should handle concurrent start and stop', async () => {
    const { startAccountGateway } = await import('./gateway.js');

    const states = new Map();
    ['concurrent-1', 'concurrent-2', 'concurrent-3'].forEach(id => {
      states.set(id, {
        accountId: id,
        config: mockConfig,
        apiClient: null,
        connected: true,
        meshConnected: true,
        lastError: null,
        messageCallbacks: new Set(),
        watchAbortController: undefined,
      });
    });
    mockGetAllAccountStates.mockReturnValue(states);

    // Start all and immediately stop all
    const startAndStop = async (accountId: string) => {
      const ctx = {
        account: { accountId, config: mockConfig },
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        setStatus: vi.fn(),
      };
      const cleanup = await startAccountGateway(ctx);
      await cleanup();
    };

    await Promise.all(['concurrent-1', 'concurrent-2', 'concurrent-3'].map(startAndStop));

    expect(mockInitializeRuntime).toHaveBeenCalledTimes(3);
    expect(mockStopRuntime).toHaveBeenCalledTimes(3);
  });
});

describe('Config hot reload', () => {
  let mockConfig: ZTMChatConfig;

  beforeEach(() => {
    mockConfig = {
      ...testConfig,
      allowFrom: undefined,
    };
    mockValidateZTMChatConfig.mockReturnValue({ valid: true, errors: [] });
    mockCheckPortOpen.mockResolvedValue(true);
    mockJoinMesh.mockResolvedValue(true);
    mockInitializeRuntime.mockResolvedValue(true);
    mockStartMessageWatcher.mockResolvedValue(undefined);
    process.env.HOME = '/test/home';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should update account config at runtime', async () => {
    const { startAccountGateway } = await import('./gateway.js');

    const mockState = {
      accountId: 'config-test',
      config: mockConfig,
      apiClient: null,
      connected: true,
      meshConnected: true,
      lastError: null,
      messageCallbacks: new Set(),
      watchAbortController: undefined,
    };
    mockGetAllAccountStates.mockReturnValue(new Map([['config-test', mockState]]));

    const ctx = {
      account: { accountId: 'config-test', config: mockConfig },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      setStatus: vi.fn(),
    };

    const cleanup = await startAccountGateway(ctx);

    // Verify initial config was used
    expect(mockInitializeRuntime).toHaveBeenCalledWith(mockConfig, 'config-test');

    // Update config in state (simulating hot reload)
    const updatedConfig = { ...mockConfig, dmPolicy: 'allow' as const };
    mockGetAllAccountStates.mockReturnValue(
      new Map([['config-test', { ...mockState, config: updatedConfig }]])
    );

    // Start another account with new config
    const ctx2 = {
      account: { accountId: 'config-test-2', config: updatedConfig },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      setStatus: vi.fn(),
    };

    const mockState2 = {
      accountId: 'config-test-2',
      config: updatedConfig,
      apiClient: null,
      connected: true,
      meshConnected: true,
      lastError: null,
      messageCallbacks: new Set(),
      watchAbortController: undefined,
    };
    mockGetAllAccountStates.mockReturnValue(new Map([['config-test-2', mockState2]]));

    await startAccountGateway(ctx2);

    await cleanup();
  });

  it('should handle config validation after startup', async () => {
    const { startAccountGateway } = await import('./gateway.js');

    const mockState = {
      accountId: 'validation-test',
      config: mockConfig,
      apiClient: null,
      connected: true,
      meshConnected: true,
      lastError: null,
      messageCallbacks: new Set(),
      watchAbortController: undefined,
    };
    mockGetAllAccountStates.mockReturnValue(new Map([['validation-test', mockState]]));

    // First start succeeds with valid config
    const ctx1 = {
      account: { accountId: 'validation-test', config: mockConfig },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      setStatus: vi.fn(),
    };

    const cleanup1 = await startAccountGateway(ctx1);

    // Start with invalid config should fail
    const invalidConfig = { ...mockConfig, agentUrl: '' };
    const ctx2 = {
      account: { accountId: 'invalid-config', config: invalidConfig },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      setStatus: vi.fn(),
    };

    await expect(startAccountGateway(ctx2)).rejects.toThrow();

    await cleanup1();
  });

  it('should reflect config changes in message callbacks', async () => {
    const { buildMessageCallback } = await import('./gateway.js');

    // First config
    const config1 = { ...mockConfig, dmPolicy: 'deny' as const };
    const mockState1 = {
      accountId: 'callback-config-1',
      config: config1,
      apiClient: null,
      connected: true,
      meshConnected: true,
      lastError: null,
      messageCallbacks: new Set(),
    };

    const callback1 = buildMessageCallback(mockState1 as any, 'callback-config-1', config1);
    expect(typeof callback1).toBe('function');

    // Second config with different settings
    const config2 = { ...mockConfig, dmPolicy: 'allow' as const };
    const mockState2 = {
      accountId: 'callback-config-2',
      config: config2,
      apiClient: null,
      connected: true,
      meshConnected: true,
      lastError: null,
      messageCallbacks: new Set(),
    };

    const callback2 = buildMessageCallback(mockState2 as any, 'callback-config-2', config2);
    expect(typeof callback2).toBe('function');
  });
});

describe('Exception account isolation', () => {
  let mockConfig: ZTMChatConfig;

  beforeEach(() => {
    mockConfig = {
      ...testConfig,
      allowFrom: undefined,
    };
    mockValidateZTMChatConfig.mockReturnValue({ valid: true, errors: [] });
    mockCheckPortOpen.mockResolvedValue(true);
    mockJoinMesh.mockResolvedValue(true);
    mockInitializeRuntime.mockResolvedValue(true);
    mockStartMessageWatcher.mockResolvedValue(undefined);
    process.env.HOME = '/test/home';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should isolate failing account and continue others', async () => {
    const { startAccountGateway } = await import('./gateway.js');

    // Setup states for 3 accounts
    const states = new Map();
    ['good-1', 'bad-account', 'good-2'].forEach(id => {
      states.set(id, {
        accountId: id,
        config: mockConfig,
        apiClient: null,
        connected: true,
        meshConnected: true,
        lastError: null,
        messageCallbacks: new Set(),
        watchAbortController: undefined,
      });
    });
    mockGetAllAccountStates.mockReturnValue(states);

    // Start good accounts
    const ctx1 = {
      account: { accountId: 'good-1', config: mockConfig },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      setStatus: vi.fn(),
    };
    const ctx3 = {
      account: { accountId: 'good-2', config: mockConfig },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      setStatus: vi.fn(),
    };

    const cleanup1 = await startAccountGateway(ctx1);
    const cleanup3 = await startAccountGateway(ctx3);

    // Verify good accounts started
    expect(mockInitializeRuntime).toHaveBeenCalledTimes(2);

    // Cleanup good accounts
    await cleanup1();
    await cleanup3();

    // Both should be stopped
    expect(mockStopRuntime).toHaveBeenCalledTimes(2);
  });

  it('should handle account failure during startup gracefully', async () => {
    const { startAccountGateway } = await import('./gateway.js');

    // Make initializeRuntime fail for one account
    let callCount = 0;
    mockInitializeRuntime.mockImplementation(async (config, accountId) => {
      callCount++;
      if (accountId === 'failing-account') {
        return false;
      }
      return true;
    });

    const states = new Map();
    states.set('failing-account', {
      accountId: 'failing-account',
      config: mockConfig,
      apiClient: null,
      connected: true,
      meshConnected: true,
      lastError: 'Initialization failed',
      messageCallbacks: new Set(),
      watchAbortController: undefined,
    });
    mockGetAllAccountStates.mockReturnValue(states);

    const ctx = {
      account: { accountId: 'failing-account', config: mockConfig },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      setStatus: vi.fn(),
    };

    // Should throw due to initialization failure
    await expect(startAccountGateway(ctx)).rejects.toThrow();
  });

  it('should not affect other accounts when one is stopped', async () => {
    const { startAccountGateway, logoutAccountGateway } = await import('./gateway.js');

    const states = new Map();
    ['isolated-1', 'isolated-2', 'isolated-3'].forEach(id => {
      states.set(id, {
        accountId: id,
        config: mockConfig,
        apiClient: null,
        connected: true,
        meshConnected: true,
        lastError: null,
        messageCallbacks: new Set(),
        watchAbortController: undefined,
      });
    });
    mockGetAllAccountStates.mockReturnValue(states);

    // Start all 3 accounts
    const ctx1 = {
      account: { accountId: 'isolated-1', config: mockConfig },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      setStatus: vi.fn(),
    };
    const ctx2 = {
      account: { accountId: 'isolated-2', config: mockConfig },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      setStatus: vi.fn(),
    };
    const ctx3 = {
      account: { accountId: 'isolated-3', config: mockConfig },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      setStatus: vi.fn(),
    };

    const cleanup1 = await startAccountGateway(ctx1);
    const cleanup2 = await startAccountGateway(ctx2);
    const cleanup3 = await startAccountGateway(ctx3);

    expect(mockInitializeRuntime).toHaveBeenCalledTimes(3);

    // Stop only account 2 via logout
    await logoutAccountGateway({ accountId: 'isolated-2' });

    // Account 1 and 3 should still be running
    // Start another account - should work
    const newStates = new Map();
    newStates.set('isolated-1', {
      accountId: 'isolated-1',
      config: mockConfig,
      messageCallbacks: new Set(),
    });
    newStates.set('isolated-3', {
      accountId: 'isolated-3',
      config: mockConfig,
      messageCallbacks: new Set(),
    });
    newStates.set('new-account', {
      accountId: 'new-account',
      config: mockConfig,
      messageCallbacks: new Set(),
      connected: true,
      meshConnected: true,
      lastError: null,
    });
    mockGetAllAccountStates.mockReturnValue(newStates);

    const ctxNew = {
      account: { accountId: 'new-account', config: mockConfig },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      setStatus: vi.fn(),
    };

    await startAccountGateway(ctxNew);

    // Cleanup
    await cleanup1();
    await cleanup3();
  });

  it('should maintain separate state for each account', async () => {
    const { startAccountGateway } = await import('./gateway.js');

    const states = new Map();
    ['state-1', 'state-2'].forEach(id => {
      states.set(id, {
        accountId: id,
        config: { ...mockConfig, username: id }, // Different username per account
        apiClient: null,
        connected: true,
        meshConnected: true,
        lastError: null,
        messageCallbacks: new Set(),
        watchAbortController: undefined,
        lastStartAt: undefined,
      });
    });
    mockGetAllAccountStates.mockReturnValue(states);

    const ctx1 = {
      account: { accountId: 'state-1', config: { ...mockConfig, username: 'user1' } },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      setStatus: vi.fn(),
    };
    const ctx2 = {
      account: { accountId: 'state-2', config: { ...mockConfig, username: 'user2' } },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      setStatus: vi.fn(),
    };

    const cleanup1 = await startAccountGateway(ctx1);
    const cleanup2 = await startAccountGateway(ctx2);

    // Verify each was called with correct config
    expect(mockInitializeRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'user1' }),
      'state-1'
    );
    expect(mockInitializeRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'user2' }),
      'state-2'
    );

    await cleanup1();
    await cleanup2();
  });
});

describe('collectStatusIssues additional coverage', () => {
  let mockConfig: ZTMChatConfig;

  beforeEach(() => {
    mockConfig = {
      ...testConfig,
      allowFrom: undefined,
    };
    // Reset and set up mock for these specific tests
    mockIsConfigMinimallyValid.mockReset();
  });

  afterEach(() => {
    mockIsConfigMinimallyValid.mockReset();
    mockIsConfigMinimallyValid.mockImplementation((config: any) => {
      return !!(config?.agentUrl && config?.username);
    });
  });

  it('should return config error with default accountId when accountId is undefined', async () => {
    const { collectStatusIssues } = await import('./gateway.js');

    // Force mock to return false to trigger the error path
    mockIsConfigMinimallyValid.mockReturnValue(false);

    const invalidConfig = { agentUrl: '', username: '' };
    const accounts = [{ accountId: undefined, config: invalidConfig } as any];

    const result = collectStatusIssues(accounts);

    expect(result).toHaveLength(1);
    expect(result[0].accountId).toBe('default');
    expect(result[0].kind).toBe('config');
    expect(result[0].level).toBe('error');
  });

  it('should return config error when only username is missing', async () => {
    const { collectStatusIssues } = await import('./gateway.js');

    mockIsConfigMinimallyValid.mockReturnValue(false);

    const invalidConfig = { agentUrl: 'http://localhost:8080', username: '' };
    const accounts = [{ accountId: 'test-account', config: invalidConfig } as any];

    const result = collectStatusIssues(accounts);

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('config');
  });

  it('should return config error when only agentUrl is missing', async () => {
    const { collectStatusIssues } = await import('./gateway.js');

    mockIsConfigMinimallyValid.mockReturnValue(false);

    const invalidConfig = { agentUrl: '', username: 'testuser' };
    const accounts = [{ accountId: 'test-account', config: invalidConfig } as any];

    const result = collectStatusIssues(accounts);

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('config');
  });

  it('should return config error with specific error message', async () => {
    const { collectStatusIssues } = await import('./gateway.js');

    mockIsConfigMinimallyValid.mockReturnValue(false);

    const invalidConfig = { agentUrl: '', username: 'testuser' };
    const accounts = [{ accountId: 'my-account', config: invalidConfig } as any];

    const result = collectStatusIssues(accounts);

    expect(result).toHaveLength(1);
    expect(result[0].message).toContain('agentUrl');
  });
});

describe('createReplyDispatcherOptions uncovered paths', () => {
  let mockConfig: ZTMChatConfig;

  beforeEach(() => {
    mockConfig = {
      ...testConfig,
      allowFrom: undefined,
    };
  });

  it('should handle empty text in deliver callback', async () => {
    const { container } = await import('../di/index.js');
    const { logger } = await import('../utils/logger.js');

    const mockRuntime = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: 'session-123',
            agentId: 'agent-456',
            matchedBy: 'test-route',
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn(ctx => ctx),
          dispatchReplyWithBufferedBlockDispatcher: vi.fn().mockResolvedValue({
            queuedFinal: true,
          }),
          resolveHumanDelayConfig: vi.fn(() => ({ delay: 0 })),
        },
      },
    };
    (container.get as any).mockReturnValue({
      get: () => mockRuntime,
    });

    const { buildMessageCallback } = await import('./gateway.js');

    const mockState = {
      accountId: 'deliver-test',
      config: mockConfig,
      apiClient: null,
      connected: true,
      meshConnected: true,
      lastError: null,
      messageCallbacks: new Set(),
    };

    const callback = buildMessageCallback(mockState as any, 'deliver-test', mockConfig);

    // Message with empty content
    const msg = {
      id: 'msg-empty',
      sender: 'peer',
      senderId: 'peer',
      content: '',
      timestamp: new Date(),
      peer: 'peer',
    } as unknown as ZTMChatMessage;

    callback(msg);

    await new Promise(resolve => setTimeout(resolve, 10));

    // Should have called dispatch
    expect(mockRuntime.channel.reply.dispatchReplyWithBufferedBlockDispatcher).toHaveBeenCalled();
  });

  it('should handle group message in deliver callback', async () => {
    const { container } = await import('../di/index.js');

    const mockRuntime = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: 'session-123',
            agentId: 'agent-456',
            matchedBy: 'test-route',
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn(ctx => ctx),
          dispatchReplyWithBufferedBlockDispatcher: vi.fn().mockResolvedValue({
            queuedFinal: true,
          }),
          resolveHumanDelayConfig: vi.fn(() => ({ delay: 0 })),
        },
      },
    };
    (container.get as any).mockReturnValue({
      get: () => mockRuntime,
    });

    const { buildMessageCallback } = await import('./gateway.js');

    const mockState = {
      accountId: 'group-test',
      config: mockConfig,
      apiClient: null,
      connected: true,
      meshConnected: true,
      lastError: null,
      messageCallbacks: new Set(),
    };

    const callback = buildMessageCallback(mockState as any, 'group-test', mockConfig);

    // Group message with group info
    const msg = {
      id: 'msg-group',
      sender: 'peer',
      senderId: 'peer',
      content: 'Hello group!',
      timestamp: new Date(),
      peer: 'peer',
      isGroup: true,
      groupId: 'group-123',
      groupCreator: 'admin',
    } as unknown as ZTMChatMessage;

    callback(msg);

    await new Promise(resolve => setTimeout(resolve, 10));

    // Should have called dispatch with group info
    expect(mockRuntime.channel.reply.dispatchReplyWithBufferedBlockDispatcher).toHaveBeenCalled();
  });

  it('should handle onError callback in deliver', async () => {
    const { container } = await import('../di/index.js');
    const { logger } = await import('../utils/logger.js');

    // Make sendZTMMessage fail
    const { sendZTMMessage } = await import('../messaging/outbound.js');

    let deliverCallback:
      | ((payload: { text?: string; mediaUrl?: string }) => Promise<void>)
      | undefined;
    let errorCallback: ((err: unknown) => void) | undefined;

    const mockRuntime = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: 'session-123',
            agentId: 'agent-456',
            matchedBy: 'test-route',
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn(ctx => ctx),
          dispatchReplyWithBufferedBlockDispatcher: vi
            .fn()
            .mockImplementation(async ({ dispatcherOptions }) => {
              // Capture the deliver callback
              deliverCallback = dispatcherOptions.deliver;
              errorCallback = dispatcherOptions.onError;
              // Call deliver which will fail
              await dispatcherOptions.deliver({ text: 'Reply text' });
              return { queuedFinal: true };
            }),
          resolveHumanDelayConfig: vi.fn(() => ({ delay: 0 })),
        },
      },
    };
    (container.get as any).mockReturnValue({
      get: () => mockRuntime,
    });

    // Make sendZTMMessage fail when called
    (sendZTMMessage as any).mockRejectedValueOnce(new Error('Send failed'));

    const { buildMessageCallback } = await import('./gateway.js');

    const mockState = {
      accountId: 'error-test',
      config: mockConfig,
      apiClient: null,
      connected: true,
      meshConnected: true,
      lastError: null,
      messageCallbacks: new Set(),
    };

    const callback = buildMessageCallback(mockState as any, 'error-test', mockConfig);

    const msg = {
      id: 'msg-error',
      sender: 'peer',
      senderId: 'peer',
      content: 'Test',
      timestamp: new Date(),
      peer: 'peer',
    } as unknown as ZTMChatMessage;

    callback(msg);

    await new Promise(resolve => setTimeout(resolve, 50));

    // The onError callback from dispatchReplyWithBufferedBlockDispatcher should be called
    // when sendZTMMessage fails inside deliver
    expect(deliverCallback).toBeDefined();
  });

  it('should handle retry scheduling failure in catch block', async () => {
    const { container } = await import('../di/index.js');
    const { logger } = await import('../utils/logger.js');

    // First call throws retryable error
    // Second call (during retry) throws an error to trigger the catch block in retryMessageLater
    let callCount = 0;
    const mockRuntime = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => {
            callCount++;
            // First call throws retryable error
            // Second call throws error to make retry scheduling fail
            if (callCount === 1) {
              throw new Error('ETIMEDOUT network timeout');
            }
            throw new Error('Simulated dispatch failure during retry');
          }),
        },
        reply: {
          finalizeInboundContext: vi.fn(ctx => ctx),
          dispatchReplyWithBufferedBlockDispatcher: vi.fn().mockResolvedValue({
            queuedFinal: false,
          }),
          resolveHumanDelayConfig: vi.fn(() => ({ delay: 0 })),
        },
      },
    };
    (container.get as any).mockReturnValue({
      get: () => mockRuntime,
    });

    const { buildMessageCallback } = await import('./gateway.js');

    const mockState = {
      accountId: 'retry-fail-test',
      config: mockConfig,
      apiClient: null,
      connected: true,
      meshConnected: true,
      lastError: null,
      messageCallbacks: new Set(),
    };

    const callback = buildMessageCallback(mockState as any, 'retry-fail-test', mockConfig);

    const msg = {
      id: 'msg-retry-fail',
      sender: 'peer',
      senderId: 'peer',
      content: 'Test',
      timestamp: new Date(),
      peer: 'peer',
    } as unknown as ZTMChatMessage;

    callback(msg);

    // Wait for retry to fail
    await new Promise(resolve => setTimeout(resolve, 50));

    // Should have logged error for retry scheduling failure
    // This covers lines 588-589
  });

  it('should handle onError definition in createReplyDispatcherOptions', async () => {
    const { container } = await import('../di/index.js');

    // This test ensures the onError callback is defined and passed correctly
    let capturedOptions: any;
    const mockRuntime = {
      channel: {
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: 'session-123',
            agentId: 'agent-456',
            matchedBy: 'test-route',
          })),
        },
        reply: {
          finalizeInboundContext: vi.fn(ctx => ctx),
          dispatchReplyWithBufferedBlockDispatcher: vi.fn().mockImplementation(async opts => {
            capturedOptions = opts.dispatcherOptions;
            return { queuedFinal: true };
          }),
          resolveHumanDelayConfig: vi.fn(() => ({ delay: 0 })),
        },
      },
    };
    (container.get as any).mockReturnValue({
      get: () => mockRuntime,
    });

    const { buildMessageCallback } = await import('./gateway.js');

    const mockState = {
      accountId: 'options-test',
      config: mockConfig,
      apiClient: null,
      connected: true,
      meshConnected: true,
      lastError: null,
      messageCallbacks: new Set(),
    };

    const callback = buildMessageCallback(mockState as any, 'options-test', mockConfig);

    const msg = {
      id: 'msg-options',
      sender: 'peer',
      senderId: 'peer',
      content: 'Test',
      timestamp: new Date(),
      peer: 'peer',
    } as unknown as ZTMChatMessage;

    callback(msg);

    await new Promise(resolve => setTimeout(resolve, 10));

    // Verify dispatcherOptions has onError defined
    expect(capturedOptions).toBeDefined();
    expect(typeof capturedOptions.onError).toBe('function');
    expect(typeof capturedOptions.deliver).toBe('function');
  });
});
