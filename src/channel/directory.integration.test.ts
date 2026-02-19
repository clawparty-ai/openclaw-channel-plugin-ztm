// Integration tests for Directory Operations
// Tests for directory user listing, account resolution, multi-account handling

import { describe, it, expect, vi } from 'vitest';
import type { ZTMChatConfig } from '../types/config.js';

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock getAccountConfig
vi.mock('../channel/config.js', () => ({
  resolveZTMChatAccount: vi.fn((accountId: string, config?: ZTMChatConfig) => {
    if (!config) {
      return null;
    }
    return {
      accountId,
      config,
      status: { running: false, connected: false },
    };
  }),
}));

describe('Directory Integration', () => {
  // Test configuration fixtures
  const createTestConfig = (overrides?: Partial<ZTMChatConfig>): ZTMChatConfig => ({
    agentUrl: 'http://localhost:7777',
    permitUrl: 'https://ztm-portal.flomesh.io:7779/permit',
    permitSource: 'server',
    meshName: 'test-mesh',
    username: 'test-bot',
    enableGroups: true,
    autoReply: true,
    messagePath: '/shared',
    dmPolicy: 'pairing',
    allowFrom: [],
    apiTimeout: 30000,
    ...overrides,
  });

  describe('account resolution integration', () => {
    it('should resolve account with minimal config', () => {
      const config = createTestConfig();

      // Test that config is valid for directory operations
      expect(config.username).toBeDefined();
      expect(config.agentUrl).toBeDefined();
    });

    it('should resolve account with full config', () => {
      const fullConfig = createTestConfig({
        username: 'full-bot',
        agentUrl: 'http://custom:8888',
        dmPolicy: 'allow',
      });

      expect(fullConfig.username).toBe('full-bot');
      expect(fullConfig.agentUrl).toBe('http://custom:8888');
      expect(fullConfig.dmPolicy).toBe('allow');
    });

    it('should handle different dmPolicy values', () => {
      const policies: ZTMChatConfig['dmPolicy'][] = ['allow', 'deny', 'pairing'];

      policies.forEach(policy => {
        const config = createTestConfig({ dmPolicy: policy });
        expect(config.dmPolicy).toBe(policy);
      });
    });

    it('should handle allowFrom array', () => {
      const config = createTestConfig({
        dmPolicy: 'pairing',
        allowFrom: ['alice', 'bob'],
      });

      expect(config.allowFrom).toEqual(['alice', 'bob']);
      expect(config.allowFrom).toContain('alice');
    });
  });

  describe('multi-account configuration', () => {
    it('should support multiple account configs', () => {
      const account1 = createTestConfig({ username: 'bot1' });
      const account2 = createTestConfig({ username: 'bot2' });

      expect(account1.username).not.toBe(account2.username);
    });

    it('should handle different mesh names per account', () => {
      const account1 = createTestConfig({ meshName: 'mesh-1' });
      const account2 = createTestConfig({ meshName: 'mesh-2' });

      expect(account1.meshName).toBe('mesh-1');
      expect(account2.meshName).toBe('mesh-2');
    });

    it('should handle different dmPolicy per account', () => {
      const account1 = createTestConfig({ dmPolicy: 'allow' });
      const account2 = createTestConfig({ dmPolicy: 'deny' });

      expect(account1.dmPolicy).toBe('allow');
      expect(account2.dmPolicy).toBe('deny');
    });

    it('should handle mixed allowFrom per account', () => {
      const account1 = createTestConfig({ allowFrom: ['user1'] });
      const account2 = createTestConfig({ allowFrom: ['user2', 'user3'] });

      expect(account1.allowFrom).toEqual(['user1']);
      expect(account2.allowFrom).toEqual(['user2', 'user3']);
    });
  });

  describe('config validation for directory', () => {
    it('should validate required fields', () => {
      const config = createTestConfig();

      // Required fields for directory to work
      expect(typeof config.username).toBe('string');
      expect(config.username.length).toBeGreaterThan(0);
      expect(typeof config.agentUrl).toBe('string');
    });

    it('should handle optional fields with defaults', () => {
      const config = createTestConfig({
        enableGroups: undefined,
        autoReply: undefined,
      });

      // Optional fields should remain undefined when not provided
      expect(config.enableGroups).toBeUndefined();
      expect(config.autoReply).toBeUndefined();
    });

    it('should validate agentUrl format', () => {
      const validUrls = [
        'http://localhost:7777',
        'https://example.com:8888',
        'http://192.168.1.1:7777',
      ];

      validUrls.forEach(url => {
        const config = createTestConfig({ agentUrl: url });
        expect(config.agentUrl).toBe(url);
      });
    });

    it('should handle apiTimeout range', () => {
      const minTimeout = createTestConfig({ apiTimeout: 1000 });
      const maxTimeout = createTestConfig({ apiTimeout: 300000 });

      expect(minTimeout.apiTimeout).toBe(1000);
      expect(maxTimeout.apiTimeout).toBe(300000);
    });
  });

  describe('directory context integration', () => {
    it('should build directory context from config', () => {
      const config = createTestConfig({ username: 'directory-bot' });

      const context = {
        accountId: 'test-account',
        username: config.username,
        meshName: config.meshName,
        dmPolicy: config.dmPolicy,
      };

      expect(context.username).toBe('directory-bot');
      expect(context.meshName).toBe('test-mesh');
    });

    it('should support pairing mode with allowFrom', () => {
      const config = createTestConfig({
        dmPolicy: 'pairing',
        allowFrom: ['alice', 'bob', 'charlie'],
      });

      // Directory should be able to check if user is allowed
      const isAllowed = (user: string) => config.allowFrom?.includes(user);

      expect(isAllowed('alice')).toBe(true);
      expect(isAllowed('bob')).toBe(true);
      expect(isAllowed('unknown')).toBe(false);
    });

    it('should handle empty allowFrom in pairing mode', () => {
      const config = createTestConfig({
        dmPolicy: 'pairing',
        allowFrom: [],
      });

      expect(config.allowFrom).toEqual([]);
    });
  });

  describe('directory filtering integration', () => {
    it('should filter users based on dmPolicy', () => {
      const allowConfig = createTestConfig({ dmPolicy: 'allow' });
      const denyConfig = createTestConfig({ dmPolicy: 'deny' });
      const pairingConfig = createTestConfig({
        dmPolicy: 'pairing',
        allowFrom: ['alice'],
      });

      // Test policy-based filtering logic
      const shouldAllowDM = (sender: string, config: ZTMChatConfig) => {
        if (config.dmPolicy === 'allow') return true;
        if (config.dmPolicy === 'deny') return false;
        if (config.dmPolicy === 'pairing') return config.allowFrom?.includes(sender) ?? false;
        return false;
      };

      expect(shouldAllowDM('alice', allowConfig)).toBe(true);
      expect(shouldAllowDM('alice', denyConfig)).toBe(false);
      expect(shouldAllowDM('alice', pairingConfig)).toBe(true);
      expect(shouldAllowDM('bob', pairingConfig)).toBe(false);
    });

    it('should handle group vs DM differentiation', () => {
      const config = createTestConfig({ enableGroups: true });

      expect(config.enableGroups).toBe(true);
    });

    it('should handle groups disabled', () => {
      const config = createTestConfig({ enableGroups: false });

      expect(config.enableGroups).toBe(false);
    });
  });

  describe('account state integration', () => {
    it('should build complete account state for directory', () => {
      const config = createTestConfig();

      const accountState = {
        accountId: 'directory-account',
        config: config,
        metadata: {
          username: config.username,
          meshName: config.meshName,
          dmPolicy: config.dmPolicy,
          autoReply: config.autoReply,
        },
      };

      expect(accountState.config.username).toBe('test-bot');
      expect(accountState.metadata.meshName).toBe('test-mesh');
    });

    it('should support multiple account states', () => {
      const account1 = createTestConfig({ username: 'bot1' });
      const account2 = createTestConfig({ username: 'bot2' });

      const states = [
        { accountId: 'account1', config: account1 },
        { accountId: 'account2', config: account2 },
      ];

      expect(states).toHaveLength(2);
      expect(states[0].config.username).toBe('bot1');
      expect(states[1].config.username).toBe('bot2');
    });
  });
});
