// src/channel/plugin.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ztmChatPlugin } from './plugin.js';
import { container, DEPENDENCIES } from '../di/index.js';

// Mock dependencies
vi.mock('../di/index.js', async () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const mockApiClientFactory = vi.fn().mockReturnValue({
    getMeshInfo: vi.fn().mockResolvedValue({ ok: true, value: { connected: true } }),
  });
  const mockSender = {
    sendPeerMessage: vi.fn().mockResolvedValue({ ok: true }),
  };

  return {
    container: {
      get: vi.fn((dep: any) => {
        const depStr = String(dep);
        if (depStr.includes('LOGGER')) return mockLogger;
        if (depStr.includes('FACTORY')) return mockApiClientFactory;
        if (depStr.includes('SENDER')) return mockSender;
        return {};
      }),
      register: vi.fn(),
    },
    DEPENDENCIES: {
      LOGGER: 'LOGGER',
      CONFIG: 'CONFIG',
      API_CLIENT_READER: 'API_CLIENT_READER',
      API_CLIENT_SENDER: 'API_CLIENT_SENDER',
      API_CLIENT_DISCOVERY: 'API_CLIENT_DISCOVERY',
      API_CLIENT_FACTORY: 'API_CLIENT_FACTORY',
      RUNTIME: 'RUNTIME',
      ALLOW_FROM_REPO: 'ALLOW_FROM_REPO',
      MESSAGE_STATE_REPO: 'MESSAGE_STATE_REPO',
      ACCOUNT_STATE_MANAGER: 'ACCOUNT_STATE_MANAGER',
      MESSAGING_CONTEXT: 'MESSAGING_CONTEXT',
    },
    createLogger: vi.fn(() => mockLogger),
    createConfigService: vi.fn(),
    createApiReaderService: vi.fn(),
    createApiSenderService: vi.fn(() => mockSender),
    createApiDiscoveryService: vi.fn(),
    createApiClientFactory: vi.fn(() => mockApiClientFactory),
    createRuntimeService: vi.fn(),
    createAllowFromRepositoryService: vi.fn(),
    createMessageStateRepositoryService: vi.fn(),
    createAccountStateManagerService: vi.fn(),
  };
});

// Mock external modules
vi.mock('./config.js', () => ({
  resolveZTMChatAccount: vi.fn((ctx: any) => ({
    accountId: ctx?.accountId ?? 'default',
    username: 'testuser',
    config: {
      username: 'testuser',
      agentUrl: 'http://localhost:8080',
      meshName: 'testmesh',
      allowFrom: ['user1', 'user2'],
    },
  })),
  listZTMChatAccountIds: vi.fn((_cfg?: any) => ['default', 'account1']),
  buildChannelConfigSchemaWithHints: vi.fn(() => ({})),
}));

vi.mock('../config/index.js', () => ({
  isConfigMinimallyValid: vi.fn((config: any) => {
    return !!(config && config.username && config.agentUrl);
  }),
}));

vi.mock('./gateway.js', () => ({
  collectStatusIssues: vi.fn(() => []),
  probeAccountGateway: vi.fn(),
  startAccountGateway: vi.fn(() => Promise.resolve(vi.fn())),
  logoutAccountGateway: vi.fn(() => Promise.resolve()),
  sendTextGateway: vi.fn(() => Promise.resolve({ ok: true })),
  buildMessageCallback: vi.fn(),
  setupAccountCallbacks: vi.fn(() =>
    Promise.resolve({ messageCallback: vi.fn(), cleanupInterval: null })
  ),
}));

vi.mock('./state.js', () => ({
  buildAccountSnapshot: vi.fn(() => ({})),
}));

vi.mock('./directory.js', () => ({
  directorySelf: vi.fn(),
  directoryListPeers: vi.fn(),
}));

vi.mock('./status.js', () => ({
  buildChannelSummary: vi.fn(() => ({})),
  getDefaultStatus: vi.fn(() => ({ running: false })),
}));

vi.mock('../messaging/context.js', () => ({
  createMessagingContext: vi.fn(() => ({})),
}));

// Use 'p' as alias for ztmChatPlugin to avoid type conflicts
const p = ztmChatPlugin as any;

describe('plugin', () => {
  describe('meta', () => {
    it('should have correct id', () => {
      expect(p.meta.id).toBe('ztm-chat');
    });

    it('should have correct label', () => {
      expect(p.meta.label).toBe('ZTM Chat');
    });

    it('should have correct selectionLabel', () => {
      expect(p.meta.selectionLabel).toBe('ZTM Chat (P2P)');
    });

    it('should have correct blurb', () => {
      expect(p.meta.blurb).toBe('Decentralized P2P messaging via ZTM (Zero Trust Mesh) network');
    });

    it('should have aliases', () => {
      expect(p.meta.aliases).toContain('ztm');
      expect(p.meta.aliases).toContain('ztmp2p');
    });
  });

  describe('id', () => {
    it('should have correct id', () => {
      expect(p.id).toBe('ztm-chat');
    });
  });

  describe('capabilities', () => {
    it('should support direct and group chat', () => {
      expect(p.capabilities.chatTypes).toContain('direct');
      expect(p.capabilities.chatTypes).toContain('group');
    });

    it('should not support reactions', () => {
      expect(p.capabilities.reactions).toBe(false);
    });

    it('should not support threads', () => {
      expect(p.capabilities.threads).toBe(false);
    });

    it('should block streaming', () => {
      expect(p.capabilities.blockStreaming).toBe(true);
    });
  });

  describe('pairing', () => {
    it('should have correct idLabel', () => {
      expect(p.pairing.idLabel).toBe('username');
    });

    it('should normalize allow entry', () => {
      expect(p.pairing.normalizeAllowEntry('  User123  ')).toBe('user123');
    });

    it('should have notifyApproval function', () => {
      expect(typeof p.pairing.notifyApproval).toBe('function');
    });
  });

  describe('reload', () => {
    it('should have configPrefixes', () => {
      expect(p.reload.configPrefixes).toContain('channels.ztm-chat');
    });
  });

  describe('configSchema', () => {
    it('should have configSchema', () => {
      expect(p.configSchema).toBeDefined();
    });
  });

  describe('config', () => {
    it('should have listAccountIds', () => {
      expect(typeof p.config.listAccountIds).toBe('function');
      const ids = p.config.listAccountIds({});
      expect(ids).toContain('default');
    });

    it('should have resolveAccount', () => {
      expect(typeof p.config.resolveAccount).toBe('function');
    });

    it('should have defaultAccountId', () => {
      expect(typeof p.config.defaultAccountId).toBe('function');
    });

    it('should have isConfigured', () => {
      expect(typeof p.config.isConfigured).toBe('function');
    });

    it('should return true for valid config', () => {
      const validAccount = {
        username: 'test',
        config: { username: 'test', agentUrl: 'http://localhost:8080' },
      };
      expect(p.config.isConfigured(validAccount as any)).toBe(true);
    });

    it('should return false for invalid config', () => {
      const invalidAccount = {
        username: 'test',
        config: {},
      };
      expect(p.config.isConfigured(invalidAccount as any)).toBe(false);
    });

    it('should have describeAccount', () => {
      expect(typeof p.config.describeAccount).toBe('function');
    });

    it('should have resolveAllowFrom', () => {
      expect(typeof p.config.resolveAllowFrom).toBe('function');
    });

    it('should have formatAllowFrom', () => {
      expect(typeof p.config.formatAllowFrom).toBe('function');
    });

    it('should format allowFrom entries', () => {
      const result = p.config.formatAllowFrom({
        allowFrom: ['  User1  ', 'USER2', 'user3'],
      });
      expect(result).toEqual(['user1', 'user2', 'user3']);
    });
  });

  describe('security', () => {
    it('should have resolveDmPolicy', () => {
      expect(typeof p.security.resolveDmPolicy).toBe('function');
    });

    it('should have collectWarnings', () => {
      expect(typeof p.security.collectWarnings).toBe('function');
    });
  });

  describe('groups', () => {
    it('should have resolveRequireMention', () => {
      expect(typeof p.groups.resolveRequireMention).toBe('function');
      expect(p.groups.resolveRequireMention()).toBe(false);
    });

    it('should have resolveToolPolicy', () => {
      expect(typeof p.groups.resolveToolPolicy).toBe('function');
      const policy = p.groups.resolveToolPolicy();
      expect(policy.allow).toContain('ztm-chat');
    });
  });

  describe('messaging', () => {
    it('should have normalizeTarget', () => {
      expect(typeof p.messaging.normalizeTarget).toBe('function');
      expect(p.messaging.normalizeTarget('  User123  ')).toBe('user123');
    });

    it('should have targetResolver', () => {
      expect(p.messaging.targetResolver).toBeDefined();
      expect(p.messaging.targetResolver.looksLikeId('user123')).toBe(true);
      expect(p.messaging.targetResolver.looksLikeId('')).toBe(false);
      expect(p.messaging.targetResolver.looksLikeId(null as any)).toBe(false);
    });
  });

  describe('outbound', () => {
    it('should have sendText', () => {
      expect(typeof p.outbound.sendText).toBe('function');
    });

    it('should use direct delivery mode', () => {
      expect(p.outbound.deliveryMode).toBe('direct');
    });
  });

  describe('status', () => {
    it('should have defaultRuntime', () => {
      expect(p.status.defaultRuntime).toBeDefined();
    });

    it('should have collectStatusIssues', () => {
      expect(typeof p.status.collectStatusIssues).toBe('function');
    });

    it('should have buildChannelSummary', () => {
      expect(typeof p.status.buildChannelSummary).toBe('function');
    });

    it('should have probeAccount', () => {
      expect(typeof p.status.probeAccount).toBe('function');
    });

    it('should have buildAccountSnapshot', () => {
      expect(typeof p.status.buildAccountSnapshot).toBe('function');
    });
  });

  describe('directory', () => {
    it('should have self', () => {
      expect(p.directory.self).toBeDefined();
    });

    it('should have listPeers', () => {
      expect(p.directory.listPeers).toBeDefined();
    });

    it('should have listGroups that returns empty array', async () => {
      const groups = await p.directory.listGroups();
      expect(groups).toEqual([]);
    });
  });

  describe('gateway', () => {
    it('should have startAccount', () => {
      expect(typeof p.gateway.startAccount).toBe('function');
    });

    it('should have logoutAccount', () => {
      expect(typeof p.gateway.logoutAccount).toBe('function');
    });
  });
});

describe('security functions behavior', () => {
  it('should have security configuration defined', () => {
    expect(p.security).toBeDefined();
  });

  it('should have resolveDmPolicy function', () => {
    expect(typeof p.security.resolveDmPolicy).toBe('function');
  });

  it('should have collectWarnings function', () => {
    expect(typeof p.security.collectWarnings).toBe('function');
  });
});

// Step 6: Config validation edge cases
describe('config validation edge cases', () => {
  describe('allowFrom array with null/undefined', () => {
    it('should handle allowFrom with null entries', () => {
      const result = p.config.formatAllowFrom({
        allowFrom: ['alice', null as any, 'bob'],
      });
      // null entries are converted to empty strings then filtered
      expect(result).toContain('alice');
      expect(result).toContain('bob');
    });

    it('should handle allowFrom with undefined entries', () => {
      const result = p.config.formatAllowFrom({
        allowFrom: ['alice', undefined as any, 'bob'],
      });
      expect(result).toContain('alice');
      expect(result).toContain('bob');
    });

    it('should handle allowFrom with mixed null/undefined entries', () => {
      const result = p.config.formatAllowFrom({
        allowFrom: [null as any, 'alice', undefined as any, 'bob', null as any],
      });
      // Should filter and normalize properly
      expect(result).toContain('alice');
      expect(result).toContain('bob');
    });

    it('should handle allowFrom with all null/undefined entries', () => {
      const result = p.config.formatAllowFrom({
        allowFrom: [null as any, undefined as any],
      });
      // String(null) = 'null', String(undefined) = 'undefined'
      expect(result).toEqual(['null', 'undefined']);
    });

    it('should handle undefined allowFrom', () => {
      const result = p.config.formatAllowFrom({
        allowFrom: undefined,
      });
      expect(result).toEqual([]);
    });

    it('should handle null allowFrom', () => {
      const result = p.config.formatAllowFrom({
        allowFrom: null as any,
      });
      expect(result).toEqual([]);
    });
  });

  describe('duplicate usernames in allowFrom', () => {
    it('should handle duplicate usernames (case-sensitive)', () => {
      const result = p.config.formatAllowFrom({
        allowFrom: ['alice', 'alice', 'bob'],
      });
      // Duplicates are preserved (formatAllowFrom doesn't deduplicate)
      expect(result).toEqual(['alice', 'alice', 'bob']);
    });

    it('should handle duplicate usernames (case-insensitive)', () => {
      const result = p.config.formatAllowFrom({
        allowFrom: ['Alice', 'ALICE', 'alice', 'bob'],
      });
      // Case variations are considered different after normalization
      expect(result).toEqual(['alice', 'alice', 'alice', 'bob']);
    });

    it('should handle whitespace variations', () => {
      const result = p.config.formatAllowFrom({
        allowFrom: ['  alice  ', 'alice', 'ALICE'],
      });
      // All normalize to 'alice'
      expect(result).toEqual(['alice', 'alice', 'alice']);
    });
  });

  describe('AccountId conflicts', () => {
    it('should list default account ID when no accounts configured', () => {
      const ids = p.config.listAccountIds({});
      // Mock returns ['default', 'account1'] regardless of input
      expect(ids).toContain('default');
    });

    it('should return mocked account IDs', () => {
      // The mock returns fixed values regardless of input
      const ids = p.config.listAccountIds({});
      expect(ids).toEqual(['default', 'account1']);
    });

    it('should return default when no accounts configured', () => {
      const defaultId = p.config.defaultAccountId({});
      expect(defaultId).toBe('default');
    });
  });

  describe('resolveAllowFrom edge cases', () => {
    it('should return mocked allowFrom values', () => {
      // The mock returns fixed values from resolveZTMChatAccount
      const result = p.config.resolveAllowFrom({
        accountId: 'test',
      });
      // Mock returns ['user1', 'user2'] from resolveZTMChatAccount mock
      expect(result).toEqual(['user1', 'user2']);
    });
  });
});
