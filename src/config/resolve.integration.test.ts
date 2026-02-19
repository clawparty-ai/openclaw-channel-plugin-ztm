// Integration tests for Configuration Resolution
// Tests for full config resolution: defaults + user config + validation

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getDefaultConfig,
  resolveZTMChatConfig,
  createProbeConfig,
  mergeAccountConfig,
} from './defaults.js';

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  defaultLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Config Resolution Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('default configuration', () => {
    it('should provide complete default config', () => {
      const defaults = getDefaultConfig();

      expect(defaults).toEqual({
        agentUrl: 'http://localhost:7777',
        permitUrl: 'https://ztm-portal.flomesh.io:7779/permit',
        permitSource: 'server',
        meshName: 'openclaw-mesh',
        username: 'openclaw-bot',
        enableGroups: true,
        autoReply: true,
        messagePath: '/shared',
        dmPolicy: 'pairing',
        allowFrom: undefined,
        apiTimeout: 30000,
      });
    });

    it('should have all required fields defined', () => {
      const defaults = getDefaultConfig();

      expect(defaults.agentUrl).toBeDefined();
      expect(defaults.permitUrl).toBeDefined();
      expect(defaults.meshName).toBeDefined();
      expect(defaults.username).toBeDefined();
      expect(defaults.dmPolicy).toBeDefined();
      expect(defaults.apiTimeout).toBeDefined();
    });
  });

  describe('config resolution with user config', () => {
    it('should merge user config with defaults', () => {
      const userConfig = {
        agentUrl: 'http://custom-agent:8888',
        username: 'custom-bot',
      };

      const resolved = resolveZTMChatConfig(userConfig);

      expect(resolved.agentUrl).toBe('http://custom-agent:8888');
      expect(resolved.username).toBe('custom-bot');
      expect(resolved.permitUrl).toBe('https://ztm-portal.flomesh.io:7779/permit');
      expect(resolved.meshName).toBe('openclaw-mesh');
    });

    it('should handle partial config with defaults filling gaps', () => {
      const partialConfig = {
        username: 'partial-bot',
        // Missing: agentUrl, permitUrl, etc.
      };

      const resolved = resolveZTMChatConfig(partialConfig);

      expect(resolved.username).toBe('partial-bot');
      expect(resolved.agentUrl).toBe('http://localhost:7777');
      expect(resolved.permitUrl).toBe('https://ztm-portal.flomesh.io:7779/permit');
      expect(resolved.dmPolicy).toBe('pairing');
    });

    it('should trim whitespace from string values', () => {
      const configWithWhitespace = {
        agentUrl: '  http://localhost:7777  ',
        username: '  my-bot  ',
        meshName: '  my-mesh  ',
      };

      const resolved = resolveZTMChatConfig(configWithWhitespace);

      expect(resolved.agentUrl).toBe('http://localhost:7777');
      expect(resolved.username).toBe('my-bot');
      expect(resolved.meshName).toBe('my-mesh');
    });

    it('should use defaults for empty string values', () => {
      const emptyConfig = {
        agentUrl: '   ',
        username: '',
      };

      const resolved = resolveZTMChatConfig(emptyConfig);

      expect(resolved.agentUrl).toBe('http://localhost:7777');
      expect(resolved.username).toBe('openclaw-bot');
    });
  });

  describe('dmPolicy validation and normalization', () => {
    it('should accept valid dmPolicy values', () => {
      const validPolicies: Array<'allow' | 'deny' | 'pairing'> = ['allow', 'deny', 'pairing'];

      validPolicies.forEach(policy => {
        const config = { dmPolicy: policy };
        const resolved = resolveZTMChatConfig(config);
        expect(resolved.dmPolicy).toBe(policy);
      });
    });

    it('should default to "pairing" for invalid dmPolicy', () => {
      const invalidConfigs = [
        { dmPolicy: 'invalid' },
        { dmPolicy: 'unknown' },
        { dmPolicy: '' },
        { dmPolicy: null as unknown as string },
        { dmPolicy: undefined },
      ];

      invalidConfigs.forEach(config => {
        const resolved = resolveZTMChatConfig(config);
        expect(resolved.dmPolicy).toBe('pairing');
      });
    });

    it('should validate allowFrom array', () => {
      const config = {
        dmPolicy: 'deny',
        allowFrom: ['alice', 'bob', '  charlie  ', 'dave'],
      };

      const resolved = resolveZTMChatConfig(config);

      expect(resolved.allowFrom).toEqual(['alice', 'bob', 'charlie', 'dave']);
    });

    it('should filter non-string values from allowFrom', () => {
      const config = {
        allowFrom: ['alice', 123, null, 'bob', undefined, true] as unknown as string[],
      };

      const resolved = resolveZTMChatConfig(config);

      expect(resolved.allowFrom).toEqual(['alice', 'bob']);
    });

    it('should set allowFrom to empty array for empty input', () => {
      const config = {
        allowFrom: [],
      };

      const resolved = resolveZTMChatConfig(config);

      // Empty array is filtered but remains as empty array (not undefined)
      expect(resolved.allowFrom).toEqual([]);
    });
  });

  describe('permitSource validation', () => {
    it('should accept valid permitSource values', () => {
      const validSources = ['server', 'file'];

      validSources.forEach(source => {
        const config = { permitSource: source };
        const resolved = resolveZTMChatConfig(config);
        expect(resolved.permitSource).toBe(source);
      });
    });

    it('should default to "server" for invalid permitSource', () => {
      const invalidConfigs = [
        { permitSource: 'invalid' },
        { permitSource: '' },
        { permitSource: null as unknown as string },
      ];

      invalidConfigs.forEach(config => {
        const resolved = resolveZTMChatConfig(config);
        expect(resolved.permitSource).toBe('server');
      });
    });
  });

  describe('apiTimeout validation', () => {
    it('should clamp apiTimeout between min and max', () => {
      const testCases = [
        { input: 500, expected: 30000 }, // Below minimum
        { input: 1000, expected: 1000 }, // At minimum
        { input: 15000, expected: 15000 }, // In range
        { input: 30000, expected: 30000 }, // In range
        { input: 60000, expected: 60000 }, // In range
        { input: 300000, expected: 300000 }, // At maximum (5 minutes)
        { input: 600000, expected: 300000 }, // Above maximum
        { input: 999999, expected: 300000 }, // Way above maximum
      ];

      testCases.forEach(({ input, expected }) => {
        const config = { apiTimeout: input };
        const resolved = resolveZTMChatConfig(config);
        expect(resolved.apiTimeout).toBe(expected);
      });
    });

    it('should use default for invalid apiTimeout', () => {
      const invalidConfigs = [
        { apiTimeout: -1 },
        { apiTimeout: 0 },
        { apiTimeout: NaN },
        { apiTimeout: null as unknown as number },
        { apiTimeout: undefined },
      ];

      invalidConfigs.forEach(config => {
        const resolved = resolveZTMChatConfig(config);
        expect(resolved.apiTimeout).toBe(30000);
      });
    });
  });

  describe('boolean config options', () => {
    it('should normalize enableGroups correctly', () => {
      const testCases = [
        { input: true, expected: true },
        { input: false, expected: false },
        { input: undefined, expected: false },
        { input: null, expected: false },
        { input: 1, expected: true },
        { input: 0, expected: false },
        { input: 'true', expected: true }, // Non-empty string is truthy
      ];

      testCases.forEach(({ input, expected }) => {
        const config = { enableGroups: input };
        const resolved = resolveZTMChatConfig(config);
        expect(resolved.enableGroups).toBe(expected);
      });
    });

    it('should normalize autoReply correctly (defaults to true)', () => {
      const testCases = [
        { input: true, expected: true },
        { input: false, expected: false },
        { input: undefined, expected: true }, // Default is true
        { input: null, expected: true }, // Default is true
      ];

      testCases.forEach(({ input, expected }) => {
        const config = { autoReply: input };
        const resolved = resolveZTMChatConfig(config);
        expect(resolved.autoReply).toBe(expected);
      });
    });
  });

  describe('invalid config handling', () => {
    it('should return defaults for null config', () => {
      const resolved = resolveZTMChatConfig(null);
      const defaults = getDefaultConfig();

      expect(resolved).toEqual(defaults);
    });

    it('should return defaults for undefined config', () => {
      const resolved = resolveZTMChatConfig(undefined);
      const defaults = getDefaultConfig();

      expect(resolved).toEqual(defaults);
    });

    it('should return defaults for non-object config', () => {
      const invalidInputs = [
        'string',
        123,
        true,
        // Arrays are technically objects in JS, so they're handled differently
        // Array without required properties will use defaults for those properties
      ];

      invalidInputs.forEach(input => {
        const resolved = resolveZTMChatConfig(input);
        const defaults = getDefaultConfig();
        expect(resolved).toEqual(defaults);
      });
    });
  });

  describe('createProbeConfig', () => {
    it('should create valid config for probing', () => {
      const probe = createProbeConfig({
        agentUrl: 'http://probe:9999',
      });

      expect(probe.agentUrl).toBe('http://probe:9999');
      expect(probe.username).toBe('probe');
      expect(probe.meshName).toBe('openclaw-mesh');
    });

    it('should use probe defaults for missing values', () => {
      const probe = createProbeConfig({});

      expect(probe.agentUrl).toBe('http://localhost:7777');
      expect(probe.username).toBe('probe');
      expect(probe.permitUrl).toBe('https://ztm-portal.flomesh.io:7779/permit');
    });
  });

  describe('mergeAccountConfig', () => {
    it('should merge base config with account overrides', () => {
      const baseConfig = {
        agentUrl: 'http://base:7777',
        username: 'base-bot',
        accounts: {
          account1: { username: 'account1-bot' },
        },
      };

      const accountConfig = {
        username: 'account1-bot',
        agentUrl: 'http://account1:7777',
      };

      const merged = mergeAccountConfig(baseConfig, accountConfig);

      expect(merged).toEqual({
        agentUrl: 'http://account1:7777',
        username: 'account1-bot',
      });
      expect(merged).not.toHaveProperty('accounts');
    });

    it('should preserve base config properties not in account config', () => {
      const baseConfig = {
        agentUrl: 'http://base:7777',
        permitUrl: 'https://permit.com',
        username: 'base-bot',
      };

      const accountConfig = {
        username: 'account-bot',
      };

      const merged = mergeAccountConfig(baseConfig, accountConfig);

      expect(merged).toEqual({
        agentUrl: 'http://base:7777',
        permitUrl: 'https://permit.com',
        username: 'account-bot',
      });
    });
  });

  describe('full config resolution flow', () => {
    it('should resolve complete valid config', () => {
      const rawConfig = {
        agentUrl: 'http://my-agent:8888',
        permitUrl: 'https://my-permit.com/permit',
        permitSource: 'file',
        meshName: 'my-mesh',
        username: 'my-bot',
        enableGroups: false,
        autoReply: false,
        messagePath: '/custom/path',
        dmPolicy: 'allow',
        allowFrom: ['alice', 'bob'],
        apiTimeout: 60000,
      };

      const resolved = resolveZTMChatConfig(rawConfig);

      expect(resolved).toEqual({
        agentUrl: 'http://my-agent:8888',
        permitUrl: 'https://my-permit.com/permit',
        permitSource: 'file',
        meshName: 'my-mesh',
        username: 'my-bot',
        enableGroups: false,
        autoReply: false,
        messagePath: '/custom/path',
        dmPolicy: 'allow',
        allowFrom: ['alice', 'bob'],
        apiTimeout: 60000,
      });
    });

    it('should handle config with all optional fields', () => {
      const minimalConfig = {
        username: 'minimal-bot',
      };

      const resolved = resolveZTMChatConfig(minimalConfig);

      expect(resolved.username).toBe('minimal-bot');
      expect(resolved.agentUrl).toBe('http://localhost:7777');
      expect(resolved.dmPolicy).toBe('pairing');
      expect(resolved.enableGroups).toBe(false);
      expect(resolved.autoReply).toBe(true);
    });

    it('should handle mixed valid and invalid fields', () => {
      const mixedConfig = {
        agentUrl: 'http://valid:7777',
        dmPolicy: 'invalid' as const,
        apiTimeout: 999999,
        username: 'valid-bot',
      };

      const resolved = resolveZTMChatConfig(mixedConfig);

      expect(resolved.agentUrl).toBe('http://valid:7777');
      expect(resolved.username).toBe('valid-bot');
      expect(resolved.dmPolicy).toBe('pairing'); // Invalid -> default
      expect(resolved.apiTimeout).toBe(300000); // Clamped to max (5 minutes)
    });
  });

  describe('environment variable integration patterns', () => {
    it('should support config pattern from environment variables', () => {
      // Simulating environment-derived config
      const envConfig = {
        agentUrl: process.env.ZTM_AGENT_URL || 'http://localhost:7777',
        username: process.env.ZTM_USERNAME || 'openclaw-bot',
        apiTimeout: Number(process.env.ZTM_API_TIMEOUT) || 30000,
      };

      const resolved = resolveZTMChatConfig(envConfig);

      expect(resolved.agentUrl).toBeDefined();
      expect(resolved.username).toBeDefined();
      expect(resolved.apiTimeout).toBeGreaterThanOrEqual(1000);
      expect(resolved.apiTimeout).toBeLessThanOrEqual(300000);
    });
  });
});
