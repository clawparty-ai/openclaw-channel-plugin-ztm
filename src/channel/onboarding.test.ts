/**
 * Onboarding Adapter Tests
 * @module channel/onboarding.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OpenClawConfig } from 'openclaw/plugin-sdk';
import type { ChannelSetupInput } from 'openclaw/plugin-sdk';

// Mock the dependencies
const mockContainerGet = vi.fn();
const mockContainer = {
  get: mockContainerGet,
  register: vi.fn(),
};

vi.mock('../di/index.js', () => ({
  container: mockContainer,
  DEPENDENCIES: {
    CONFIG: 'config',
    API_CLIENT_FACTORY: 'apiClientFactory',
    LOGGER: 'logger',
    ACCOUNT_STATE_MANAGER: 'accountStateManager',
  },
}));

// Mock runtime state module
vi.mock('../runtime/state.js', () => ({
  getOrCreateAccountState: vi.fn(() => ({
    accountId: 'test-account',
    started: false,
    lastError: null,
    config: {},
    chatReader: null,
    chatSender: null,
    discovery: null,
  })),
}));

// Mock ZTMChatWizard and validateUsername using hoisted variables
const { mockWizardRun } = vi.hoisted(() => {
  const mockWizardRun = vi.fn();
  return { mockWizardRun };
});

vi.mock('../onboarding/onboarding.js', () => ({
  ZTMChatWizard: vi.fn().mockImplementation(() => ({
    run: mockWizardRun,
  })),
}));

vi.mock('../utils/validation.js', () => ({
  validateUsername: vi.fn().mockReturnValue({ valid: true, value: 'test-bot' }),
}));

describe('ztmChatOnboardingAdapter', () => {
   
  let adapter: any;

  beforeEach(async () => {
    // Dynamic import to ensure mocks are applied
    const module = await import('./onboarding.js');
    adapter = module.ztmChatOnboardingAdapter;
  });

  describe('channel', () => {
    it('should have correct channel id', () => {
      expect(adapter.channel).toBe('ztm-chat');
    });
  });

  describe('getStatus', () => {
    it('should return configured when account is valid', async () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            enabled: true,
            accounts: {
              default: {
                agentUrl: 'http://localhost:8080',
                username: 'test-bot',
                meshName: 'test-mesh',
              },
            },
          },
        },
      } as unknown as OpenClawConfig;

      const result = await adapter.getStatus({ cfg, accountOverrides: {}, options: {} });

      expect(result.channel).toBe('ztm-chat');
      expect(result.configured).toBe(true);
      expect(result.statusLines).toContain('Agent: http://localhost:8080');
      expect(result.statusLines).toContain('Username: test-bot');
      expect(result.statusLines).toContain('Mesh: test-mesh');
    });

    it('should return unconfigured when no accounts', async () => {
      const cfg: OpenClawConfig = {
        channels: {},
      } as unknown as OpenClawConfig;

      const result = await adapter.getStatus({ cfg, accountOverrides: {}, options: {} });

      expect(result.channel).toBe('ztm-chat');
      expect(result.configured).toBe(false);
      expect(result.statusLines).toContain('Not configured');
    });
  });


  describe('configure', () => {
    it('should return cfg with accountId when config is valid', async () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            enabled: true,
            accounts: {
              'test-bot': {
                agentUrl: 'http://localhost:8080',
                username: 'test-bot',
                meshName: 'test-mesh',
              },
            },
          },
        },
      } as unknown as OpenClawConfig;

      const result = await adapter.configure!({
        cfg,
        runtime: {} as never,
        prompter: {} as never,
        accountOverrides: {},
        shouldPromptAccountIds: false,
        forceAllowFrom: false,
      });

      expect(result.accountId).toBe('test-bot');
      expect(result.cfg).toBe(cfg);
    });

    it('should return cfg without accountId when no account', async () => {
      const cfg: OpenClawConfig = {
        channels: {},
      } as unknown as OpenClawConfig;

      const result = await adapter.configure!({
        cfg,
        runtime: {} as never,
        prompter: {} as never,
        accountOverrides: {},
        shouldPromptAccountIds: false,
        forceAllowFrom: false,
      });

      expect(result.accountId).toBeUndefined();
    });

    it('should return cfg without accountId when config invalid', async () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            accounts: {
              'test-bot': {
                agentUrl: 'http://localhost:8080',
                // missing username
              },
            },
          },
        },
      } as unknown as OpenClawConfig;

      const result = await adapter.configure!({
        cfg,
        runtime: {} as never,
        prompter: {} as never,
        accountOverrides: {},
        shouldPromptAccountIds: false,
        forceAllowFrom: false,
      });

      expect(result.accountId).toBeUndefined();
    });

    it('should return cfg without accountId when accounts object is empty', async () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            accounts: {},
          },
        },
      } as unknown as OpenClawConfig;

      const result = await adapter.configure!({
        cfg,
        runtime: {} as never,
        prompter: {} as never,
        accountOverrides: {},
        shouldPromptAccountIds: false,
        forceAllowFrom: false,
      });

      expect(result.accountId).toBeUndefined();
    });
  });

  describe('configureInteractive', () => {
    const mockPrompter = {
      select: vi.fn(),
      text: vi.fn(),
      confirm: vi.fn(),
      note: vi.fn(),
    };

    // Mock validateUsername
    vi.doMock('../utils/validation.js', () => ({
      validateUsername: vi.fn().mockReturnValue({ valid: true, value: 'test-bot' }),
    }));

    beforeEach(() => {
      vi.clearAllMocks();
      // Set default return values for prompter methods
      mockPrompter.text.mockResolvedValue('test-bot');
      mockPrompter.confirm.mockResolvedValue(true);
      mockPrompter.note.mockResolvedValue(undefined);
    });

    it('should return skip when user chooses to keep existing config', async () => {
      mockPrompter.select.mockResolvedValue('keep');

      const result = await adapter.configureInteractive!({
        cfg: {} as OpenClawConfig,
        runtime: {} as never,
        prompter: mockPrompter as never,
        label: 'ZTM Chat',
        configured: true,
        accountOverrides: {},
        shouldPromptAccountIds: false,
        forceAllowFrom: false,
      });

      expect(result).toBe('skip');
    });

    it('should return skip when configured and user selects keep', async () => {
      mockPrompter.select.mockResolvedValue('keep');

      const result = await adapter.configureInteractive!({
        cfg: {} as OpenClawConfig,
        runtime: {} as never,
        prompter: mockPrompter as never,
        label: 'ZTM Chat',
        configured: true,
        accountOverrides: {},
        shouldPromptAccountIds: false,
        forceAllowFrom: false,
      });

      expect(result).toBe('skip');
      expect(mockPrompter.select).toHaveBeenCalled();
    });
  });

  describe('configureWhenConfigured', () => {
    const mockPrompter = {
      select: vi.fn(),
      note: vi.fn(),
    };

    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    const mockApiClient = {
      getMeshInfo: vi.fn(),
    };

    const mockApiClientFactory = vi.fn();

    beforeEach(() => {
      vi.clearAllMocks();
      // Setup default mock return values
      mockApiClientFactory.mockReturnValue(mockApiClient);
      // Mock DI container
      mockContainerGet.mockImplementation((key: string) => {
        if (key === 'apiClientFactory') return mockApiClientFactory;
        if (key === 'logger') return mockLogger;
        return null;
      });
    });

    it('should test connection when user selects test', async () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            enabled: true,
            accounts: {
              'test-bot': {
                agentUrl: 'http://localhost:8080',
                username: 'test-bot',
                meshName: 'test-mesh',
              },
            },
          },
        },
      } as unknown as OpenClawConfig;

      mockPrompter.select.mockResolvedValue('test');
      mockApiClient.getMeshInfo.mockResolvedValue({ ok: true, value: { connected: true } });

      const result = await adapter.configureWhenConfigured!({
        cfg,
        runtime: {} as never,
        prompter: mockPrompter as never,
        label: 'ZTM Chat',
        configured: true,
        accountOverrides: {},
        shouldPromptAccountIds: false,
        forceAllowFrom: false,
      });

      expect(result).toEqual({ cfg, accountId: 'test-bot' });
      expect(mockPrompter.note).toHaveBeenCalledWith('Connection successful!');
    });

    it('should skip when user selects update', async () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            enabled: true,
            accounts: {
              'test-bot': {
                agentUrl: 'http://localhost:8080',
                username: 'test-bot',
              },
            },
          },
        },
      } as unknown as OpenClawConfig;

      mockPrompter.select.mockResolvedValue('update');

      const result = await adapter.configureWhenConfigured!({
        cfg,
        runtime: {} as never,
        prompter: mockPrompter as never,
        label: 'ZTM Chat',
        configured: true,
        accountOverrides: {},
        shouldPromptAccountIds: false,
        forceAllowFrom: false,
      });

      expect(result).toBe('skip');
    });

    it('should show remove instructions when user selects remove', async () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            enabled: true,
            accounts: {
              'test-bot': {
                agentUrl: 'http://localhost:8080',
                username: 'test-bot',
              },
            },
          },
        },
      } as unknown as OpenClawConfig;

      mockPrompter.select.mockResolvedValue('remove');

      const result = await adapter.configureWhenConfigured!({
        cfg,
        runtime: {} as never,
        prompter: mockPrompter as never,
        label: 'ZTM Chat',
        configured: true,
        accountOverrides: {},
        shouldPromptAccountIds: false,
        forceAllowFrom: false,
      });

      expect(result).toBe('skip');
      expect(mockPrompter.note).toHaveBeenCalledWith(
        expect.stringContaining('openclaw channels remove')
      );
    });

    it('should handle connection test failure with sanitized error', async () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            enabled: true,
            accounts: {
              'test-bot': {
                agentUrl: 'http://localhost:8080',
                username: 'test-bot',
              },
            },
          },
        },
      } as unknown as OpenClawConfig;

      mockPrompter.select.mockResolvedValue('test');
      mockApiClient.getMeshInfo.mockResolvedValue({
        ok: false,
        error: new Error('Network error - internal details'),
      });

      const result = await adapter.configureWhenConfigured!({
        cfg,
        runtime: {} as never,
        prompter: mockPrompter as never,
        label: 'ZTM Chat',
        configured: true,
        accountOverrides: {},
        shouldPromptAccountIds: false,
        forceAllowFrom: false,
      });

      expect(result).toEqual({ cfg, accountId: 'test-bot' });
      expect(mockPrompter.note).toHaveBeenCalledWith(expect.stringContaining('Connection failed'));
      // Should not include internal error details
      expect(mockPrompter.note).not.toHaveBeenCalledWith(
        expect.stringContaining('Network error - internal details')
      );
    });

    it('should log error details server-side when connection fails', async () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            enabled: true,
            accounts: {
              'test-bot': {
                agentUrl: 'http://localhost:8080',
                username: 'test-bot',
              },
            },
          },
        },
      } as unknown as OpenClawConfig;

      mockPrompter.select.mockResolvedValue('test');
      mockApiClient.getMeshInfo.mockResolvedValue({
        ok: false,
        error: new Error('Network error'),
      });

      await adapter.configureWhenConfigured!({
        cfg,
        runtime: {} as never,
        prompter: mockPrompter as never,
        label: 'ZTM Chat',
        configured: true,
        accountOverrides: {},
        shouldPromptAccountIds: false,
        forceAllowFrom: false,
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Connection failed',
        expect.objectContaining({
          name: 'Error',
          message: 'Network error',
        })
      );
    });

    it('should handle missing DI dependencies gracefully', async () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            enabled: true,
            accounts: {
              'test-bot': {
                agentUrl: 'http://localhost:8080',
                username: 'test-bot',
              },
            },
          },
        },
      } as unknown as OpenClawConfig;

      // Mock DI container to return null for dependencies
      mockContainerGet.mockReturnValue(null);

      mockPrompter.select.mockResolvedValue('test');

      const result = await adapter.configureWhenConfigured!({
        cfg,
        runtime: {} as never,
        prompter: mockPrompter as never,
        label: 'ZTM Chat',
        configured: true,
        accountOverrides: {},
        shouldPromptAccountIds: false,
        forceAllowFrom: false,
      });

      expect(result).toEqual({ cfg, accountId: 'test-bot' });
      expect(mockPrompter.note).toHaveBeenCalledWith(
        expect.stringContaining('Service not initialized')
      );
    });

    it('should handle unexpected error in connection test', async () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            enabled: true,
            accounts: {
              'test-bot': {
                agentUrl: 'http://localhost:8080',
                username: 'test-bot',
              },
            },
          },
        },
      } as unknown as OpenClawConfig;

      mockPrompter.select.mockResolvedValue('test');
      // Mock getMeshInfo to throw
      mockApiClient.getMeshInfo.mockImplementation(() => {
        throw new Error('Unexpected connection error');
      });

      const result = await adapter.configureWhenConfigured!({
        cfg,
        runtime: {} as never,
        prompter: mockPrompter as never,
        label: 'ZTM Chat',
        configured: true,
        accountOverrides: {},
        shouldPromptAccountIds: false,
        forceAllowFrom: false,
      });

      expect(result).toEqual({ cfg, accountId: 'test-bot' });
      expect(mockPrompter.note).toHaveBeenCalledWith(expect.stringContaining('Connection failed'));
    });

    it('should handle invalid select option (exhaustive check)', async () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            enabled: true,
            accounts: {
              'test-bot': {
                agentUrl: 'http://localhost:8080',
                username: 'test-bot',
              },
            },
          },
        },
      } as unknown as OpenClawConfig;

      // Mock select to return an invalid option
      mockPrompter.select.mockResolvedValue('invalid' as never);

      const result = await adapter.configureWhenConfigured!({
        cfg,
        runtime: {} as never,
        prompter: mockPrompter as never,
        label: 'ZTM Chat',
        configured: true,
        accountOverrides: {},
        shouldPromptAccountIds: false,
        forceAllowFrom: false,
      });

      // Should return 'skip' for invalid option (exhaustive check)
      expect(result).toBe('skip');
    });

    it('should handle DI container throwing error', async () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            enabled: true,
            accounts: {
              'test-bot': {
                agentUrl: 'http://localhost:8080',
                username: 'test-bot',
              },
            },
          },
        },
      } as unknown as OpenClawConfig;

      // Mock container.get to throw
      mockContainerGet.mockImplementation(() => {
        throw new Error('Container error');
      });

      mockPrompter.select.mockResolvedValue('test');

      const result = await adapter.configureWhenConfigured!({
        cfg,
        runtime: {} as never,
        prompter: mockPrompter as never,
        label: 'ZTM Chat',
        configured: true,
        accountOverrides: {},
        shouldPromptAccountIds: false,
        forceAllowFrom: false,
      });

      // Should handle gracefully and return accountId
      expect(result).toEqual({ cfg, accountId: 'test-bot' });
    });

    it('should return skip when no account found', async () => {
      const cfg: OpenClawConfig = {
        channels: {},
      } as unknown as OpenClawConfig;

      const result = await adapter.configureWhenConfigured!({
        cfg,
        runtime: {} as never,
        prompter: mockPrompter as never,
        label: 'ZTM Chat',
        configured: true,
        accountOverrides: {},
        shouldPromptAccountIds: false,
        forceAllowFrom: false,
      });

      expect(result).toBe('skip');
    });
  });

  describe('onAccountRecorded', () => {
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should initialize runtime state and log audit', () => {
      mockContainerGet.mockReturnValue(mockLogger);

      adapter.onAccountRecorded!('test-account', {});

      expect(mockLogger.info).toHaveBeenCalledWith(
        'ZTM Chat account recorded',
        expect.objectContaining({
          accountId: 'test-account',
        })
      );
    });

    it('should use noop logger when DI container returns undefined', () => {
      mockContainerGet.mockReturnValue(null);

      // Should not throw
      expect(() => adapter.onAccountRecorded!('test-account', {})).not.toThrow();
    });

    it('should include options in audit log', () => {
      mockContainerGet.mockReturnValue(mockLogger);

      const options = { accountIds: { ztmChat: 'custom-id' } };
      adapter.onAccountRecorded!('test-account', options);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'ZTM Chat account recorded',
        expect.objectContaining({
          options,
        })
      );
    });
  });

  describe('channel ID consistency', () => {
    it('should use ztm-chat (with hyphen) as channel ID', async () => {
      // This test ensures the channel ID matches what OpenClaw expects
      expect(adapter.channel).toBe('ztm-chat');
    });

    it('should read config using ztm-chat key', async () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            enabled: true,
            accounts: {
              'test-bot': {
                agentUrl: 'http://localhost:8080',
                username: 'test-bot',
                meshName: 'test-mesh',
              },
            },
          },
        },
      } as unknown as OpenClawConfig;

      const result = await adapter.getStatus({ cfg });
      expect(result.configured).toBe(true);
    });
  });
});
