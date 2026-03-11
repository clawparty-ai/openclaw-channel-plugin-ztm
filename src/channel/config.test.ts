// Unit tests for Channel Config

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { OpenClawConfig } from 'openclaw/plugin-sdk';
import {
  getEffectiveChannelConfig,
  listZTMChatAccountIds,
  resolveZTMChatAccount,
  resolveDefaultZTMChatAccountId,
  buildChannelConfigSchemaWithHints,
  InvalidAccountIdSecurityError,
} from './config.js';
import { logger } from '../utils/logger.js';

// Mock config functions
vi.mock('../config/index.js', () => ({
  resolveZTMChatConfig: vi.fn(input => ({
    agentUrl: (input?.agentUrl as string) || 'http://localhost:7777',
    permitUrl: (input?.permitUrl as string) || 'https://clawparty.flomesh.io:7779/permit',
    meshName: (input?.meshName as string) || 'openclaw-mesh',
    username: (input?.username as string) || 'openclaw-bot',
    enableGroups: (input?.enableGroups as boolean) ?? false,
    dmPolicy: (input?.dmPolicy as any) || 'pairing',
    allowFrom: input?.allowFrom as string[] | undefined,
  })),
  getDefaultConfig: vi.fn(() => ({
    agentUrl: 'http://localhost:7777',
    permitUrl: 'https://clawparty.flomesh.io:7779/permit',
    meshName: 'openclaw-mesh',
    username: 'openclaw-bot',
    enableGroups: false,
    dmPolicy: 'pairing',
  })),
  mergeAccountConfig: vi.fn((base, account) => ({
    ...base,
    ...account,
  })),
}));

// Mock logger for security tests
vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Channel Config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set default HOME environment variable
    process.env.HOME = '/test/home';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getEffectiveChannelConfig', () => {
    it('should return inline config when present', () => {
      const inlineConfig = {
        agentUrl: 'https://inline.example.com',
        username: 'inline-bot',
      };
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': inlineConfig,
        },
      };

      const result = getEffectiveChannelConfig(cfg);

      expect(result).toBe(inlineConfig);
    });

    it('should return inline config when it has keys', () => {
      const inlineConfig = { enabled: true };
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': inlineConfig,
        },
      };

      const result = getEffectiveChannelConfig(cfg);

      expect(result).toBe(inlineConfig);
    });

    it('should return null for empty inline config', () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {},
        },
      };

      const result = getEffectiveChannelConfig(cfg);

      expect(result).toBeNull();
    });

    it('should return null when inline config is not object', () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': 'not-an-object',
        },
      };

      const result = getEffectiveChannelConfig(cfg);

      expect(result).toBeNull();
    });

    it('should return null when no config available', () => {
      const cfg: OpenClawConfig = {
        channels: {},
      };

      const result = getEffectiveChannelConfig(cfg);

      expect(result).toBeNull();
    });

    it('should return null when cfg is undefined', () => {
      const result = getEffectiveChannelConfig(undefined);

      expect(result).toBeNull();
    });
  });

  describe('listZTMChatAccountIds', () => {
    it('should return default when no accounts config', () => {
      const cfg: OpenClawConfig = {};

      const result = listZTMChatAccountIds(cfg);

      expect(result).toEqual(['default']);
    });

    it('should return account IDs from config', () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            accounts: {
              account1: { username: 'bot1' },
              account2: { username: 'bot2' },
            },
          },
        },
      };

      const result = listZTMChatAccountIds(cfg);

      expect(result).toEqual(['account1', 'account2']);
    });

    it('should return single account ID', () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            accounts: {
              single: { username: 'bot' },
            },
          },
        },
      };

      const result = listZTMChatAccountIds(cfg);

      expect(result).toEqual(['single']);
    });

    it('should return default when accounts object is empty', () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            accounts: {},
          },
        },
      };

      const result = listZTMChatAccountIds(cfg);

      expect(result).toEqual(['default']);
    });

    it('should return default when accounts is not an object', () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            accounts: 'not-an-object',
          },
        },
      };

      const result = listZTMChatAccountIds(cfg);

      expect(result).toEqual(['default']);
    });

    it('should handle multiple accounts with various keys', () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            accounts: {
              primary: { username: 'bot1' },
              secondary: { username: 'bot2' },
              tertiary: { username: 'bot3' },
              backup: { username: 'bot4' },
            },
          },
        },
      };

      const result = listZTMChatAccountIds(cfg);

      expect(result).toHaveLength(4);
      expect(result).toContain('primary');
      expect(result).toContain('secondary');
      expect(result).toContain('tertiary');
      expect(result).toContain('backup');
    });
  });

  describe('resolveDefaultZTMChatAccountId', () => {
    it('should return "default" when no accounts config', () => {
      const cfg: OpenClawConfig = {};

      const result = resolveDefaultZTMChatAccountId(cfg);

      expect(result).toBe('default');
    });

    it('should return first account ID when accounts exist', () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            accounts: {
              account1: { username: 'bot1' },
              account2: { username: 'bot2' },
            },
          },
        },
      };

      const result = resolveDefaultZTMChatAccountId(cfg);

      expect(result).toBe('account1');
    });

    it('should return single account ID', () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            accounts: {
              primary: { username: 'bot' },
            },
          },
        },
      };

      const result = resolveDefaultZTMChatAccountId(cfg);

      expect(result).toBe('primary');
    });

    it('should return "default" when accounts object is empty', () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            accounts: {},
          },
        },
      };

      const result = resolveDefaultZTMChatAccountId(cfg);

      expect(result).toBe('default');
    });

    it('should return "default" when accounts is not an object', () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            accounts: 'not-an-object',
          },
        },
      };

      const result = resolveDefaultZTMChatAccountId(cfg);

      expect(result).toBe('default');
    });

    it('should return "default" when cfg is undefined', () => {
      const result = resolveDefaultZTMChatAccountId(undefined as any);

      expect(result).toBe('default');
    });
  });

  describe('resolveZTMChatAccount', () => {
    it('should resolve default account with no config', () => {
      const result = resolveZTMChatAccount({ cfg: undefined, accountId: undefined });

      expect(result.accountId).toBe('default');
      expect(result.username).toBe('default');
      expect(result.enabled).toBe(true);
      expect(result.config).toBeDefined();
    });

    it('should use provided accountId', () => {
      const result = resolveZTMChatAccount({ cfg: undefined, accountId: 'my-account' });

      expect(result.accountId).toBe('my-account');
      expect(result.username).toBe('my-account');
    });

    it('should resolve account from config', () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            accounts: {
              test: {
                username: 'test-bot',
                enabled: true,
                agentUrl: 'https://example.com',
              },
            },
          },
        },
      };

      const result = resolveZTMChatAccount({ cfg, accountId: 'test' });

      expect(result.accountId).toBe('test');
      expect(result.username).toBe('test-bot');
      expect(result.enabled).toBe(true);
    });

    it('should fall back to default account when specified not found', () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            accounts: {
              default: {
                username: 'default-bot',
                enabled: true,
              },
            },
          },
        },
      };

      const result = resolveZTMChatAccount({ cfg, accountId: 'nonexistent' });

      expect(result.accountId).toBe('nonexistent');
      // When account not found, falls back to default account's username
      expect(result.username).toBe('default-bot');
    });

    it('should handle account-level enabled flag', () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            enabled: false,
            accounts: {
              test: {
                username: 'test-bot',
              },
            },
          },
        },
      };

      const result = resolveZTMChatAccount({ cfg, accountId: 'test' });

      expect(result.enabled).toBe(false);
    });

    it('should handle channel-level enabled flag', () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            enabled: true,
            accounts: {
              test: {
                username: 'test-bot',
              },
            },
          },
        },
      };

      const result = resolveZTMChatAccount({ cfg, accountId: 'test' });

      expect(result.enabled).toBe(true);
    });

    it('should default enabled to true when not specified', () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            accounts: {
              test: {
                username: 'test-bot',
              },
            },
          },
        },
      };

      const result = resolveZTMChatAccount({ cfg, accountId: 'test' });

      expect(result.enabled).toBe(true);
    });

    it('should merge account config with base config', async () => {
      const { mergeAccountConfig } = await import('../config/index.js');
      const baseConfig = {
        agentUrl: 'https://base.com',
        username: 'base-user',
      };
      const accountConfig = {
        username: 'account-user',
        meshName: 'account-mesh',
      };
      (mergeAccountConfig as any).mockReturnValueOnce({
        ...baseConfig,
        ...accountConfig,
      });

      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': baseConfig,
          accounts: {
            test: accountConfig,
          },
        } as any,
      };

      void resolveZTMChatAccount({ cfg, accountId: 'test' });

      expect(mergeAccountConfig).toHaveBeenCalled();
    });

    it('should use default account when accounts not defined', () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            username: 'channel-bot',
          },
        },
      };

      const result = resolveZTMChatAccount({ cfg, accountId: 'test' });

      expect(result.username).toBeDefined();
      expect(result.config).toBeDefined();
    });

    it('should handle enabled: false at account level', () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            accounts: {
              test: {
                username: 'test-bot',
                enabled: false,
              },
            },
          },
        },
      };

      const result = resolveZTMChatAccount({ cfg, accountId: 'test' });

      expect(result.enabled).toBe(false);
    });

    it('should handle enabled: true at channel level', () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            enabled: true,
            accounts: {
              test: {
                username: 'test-bot',
              },
            },
          },
        },
      };

      const result = resolveZTMChatAccount({ cfg, accountId: 'test' });

      expect(result.enabled).toBe(true);
    });

    it('should prioritize account enabled over channel enabled', () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            enabled: true,
            accounts: {
              test: {
                username: 'test-bot',
                enabled: false,
              },
            },
          },
        },
      };

      const result = resolveZTMChatAccount({ cfg, accountId: 'test' });

      expect(result.enabled).toBe(false);
    });
  });

  describe('buildChannelConfigSchemaWithHints', () => {
    it('should return ChannelConfigSchema with schema property', () => {
      const result = buildChannelConfigSchemaWithHints();

      expect(result).toHaveProperty('schema');
      expect(result.schema).toBeDefined();
    });

    it('should return non-empty schema from buildChannelConfigSchema', () => {
      const result = buildChannelConfigSchemaWithHints();

      // SDK's buildChannelConfigSchema returns JSON schema
      expect(result.schema).toBeDefined();
      // Should have type: 'object' for object schemas
      const jsonSchema = result.schema as Record<string, unknown>;
      expect(jsonSchema.type).toBe('object');
    });
  });

  describe('ResolvedZTMChatAccount interface', () => {
    it('should have required properties', () => {
      const result = resolveZTMChatAccount({ cfg: undefined, accountId: undefined });

      expect(result).toHaveProperty('accountId');
      expect(result).toHaveProperty('username');
      expect(result).toHaveProperty('enabled');
      expect(result).toHaveProperty('config');
    });

    it('should have correct types for properties', () => {
      const result = resolveZTMChatAccount({ cfg: undefined, accountId: undefined });

      expect(typeof result.accountId).toBe('string');
      expect(typeof result.username).toBe('string');
      expect(typeof result.enabled).toBe('boolean');
      expect(typeof result.config).toBe('object');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null cfg', () => {
      const result = resolveZTMChatAccount({ cfg: undefined, accountId: 'test' });

      expect(result).toBeDefined();
      expect(result.accountId).toBe('test');
    });

    it('should handle undefined accounts', () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            accounts: undefined,
          },
        },
      };

      const result = listZTMChatAccountIds(cfg);

      expect(result).toEqual(['default']);
    });

    it('should handle special characters in account IDs', () => {
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            accounts: {
              'account_123-test.dev': { username: 'bot' },
            },
          },
        },
      };

      const result = listZTMChatAccountIds(cfg);

      expect(result).toContain('account_123-test.dev');
    });

    it('should handle very long account IDs', () => {
      const longId = 'a'.repeat(100);
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            accounts: {
              [longId]: { username: 'bot' },
            },
          },
        },
      };

      const result = listZTMChatAccountIds(cfg);

      expect(result).toContain(longId);
    });

    it('should handle unicode in account IDs', () => {
      const unicodeId = '用户-пользователь';
      const cfg: OpenClawConfig = {
        channels: {
          'ztm-chat': {
            accounts: {
              [unicodeId]: { username: 'bot' },
            },
          },
        },
      };

      const result = listZTMChatAccountIds(cfg);

      expect(result).toContain(unicodeId);
    });
  });

  // ============================================================================
  // Security Tests
  // ============================================================================

  describe('Security - InvalidAccountIdSecurityError', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    describe('Path Traversal Protection', () => {
      it('should reject accountId containing double-dot (..) path traversal', () => {
        expect(() => {
          resolveZTMChatAccount({ cfg: undefined, accountId: '../etc/passwd' });
        }).toThrow(InvalidAccountIdSecurityError);
      });

      it('should reject accountId containing forward slash (/)', () => {
        expect(() => {
          resolveZTMChatAccount({ cfg: undefined, accountId: 'path/to/file' });
        }).toThrow(InvalidAccountIdSecurityError);
      });

      it('should reject accountId containing backslash (\\)', () => {
        expect(() => {
          resolveZTMChatAccount({ cfg: undefined, accountId: 'path\\to\\file' });
        }).toThrow(InvalidAccountIdSecurityError);
      });

      it('should reject accountId with Windows path traversal', () => {
        expect(() => {
          resolveZTMChatAccount({ cfg: undefined, accountId: '..\\..\\windows\\system32' });
        }).toThrow(InvalidAccountIdSecurityError);
      });

      it('should reject accountId with mixed path separators', () => {
        expect(() => {
          resolveZTMChatAccount({ cfg: undefined, accountId: '../path\\to/file' });
        }).toThrow(InvalidAccountIdSecurityError);
      });
    });

    describe('Prototype Pollution Protection', () => {
      it('should reject accountId "__proto__"', () => {
        expect(() => {
          resolveZTMChatAccount({ cfg: undefined, accountId: '__proto__' });
        }).toThrow(InvalidAccountIdSecurityError);
      });

      it('should reject accountId "constructor"', () => {
        expect(() => {
          resolveZTMChatAccount({ cfg: undefined, accountId: 'constructor' });
        }).toThrow(InvalidAccountIdSecurityError);
      });

      it('should reject accountId "prototype"', () => {
        expect(() => {
          resolveZTMChatAccount({ cfg: undefined, accountId: 'prototype' });
        }).toThrow(InvalidAccountIdSecurityError);
      });
    });

    describe('Empty/Whitespace accountId Protection', () => {
      it('should reject empty accountId', () => {
        expect(() => {
          resolveZTMChatAccount({ cfg: undefined, accountId: '' });
        }).toThrow(InvalidAccountIdSecurityError);
      });

      it('should reject whitespace-only accountId', () => {
        expect(() => {
          resolveZTMChatAccount({ cfg: undefined, accountId: '   ' });
        }).toThrow(InvalidAccountIdSecurityError);
      });

      it('should reject tab-only accountId', () => {
        expect(() => {
          resolveZTMChatAccount({ cfg: undefined, accountId: '\t\t' });
        }).toThrow(InvalidAccountIdSecurityError);
      });

      it('should reject accountId with only newlines', () => {
        expect(() => {
          resolveZTMChatAccount({ cfg: undefined, accountId: '\n\n' });
        }).toThrow(InvalidAccountIdSecurityError);
      });
    });

    describe('Security Event Logging', () => {
      it('should log security event when accountId is rejected', () => {
        try {
          resolveZTMChatAccount({ cfg: undefined, accountId: '../../../etc/passwd' });
        } catch (error) {
          // Expected error
        }

        expect(logger.error).toHaveBeenCalledWith(
          'Security: accountId validation rejected',
          expect.objectContaining({
            accountId: '../../../etc/passwd',
            reason: expect.stringContaining('path traversal'),
            timestamp: expect.any(String),
          })
        );
      });

      it('should log security event for prototype pollution attempt', () => {
        try {
          resolveZTMChatAccount({ cfg: undefined, accountId: '__proto__' });
        } catch (error) {
          // Expected error
        }

        expect(logger.error).toHaveBeenCalledWith(
          'Security: accountId validation rejected',
          expect.objectContaining({
            accountId: '__proto__',
            reason: expect.stringContaining('dangerous property name'),
          })
        );
      });

      it('should include timestamp in security log', () => {
        try {
          resolveZTMChatAccount({ cfg: undefined, accountId: '../attack' });
        } catch (error) {
          // Expected error
        }

        const logCall = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0];
        const context = logCall[1] as Record<string, unknown>;
        expect(context).toHaveProperty('timestamp');
        expect(typeof context.timestamp).toBe('string');
        expect(context.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601 format
      });
    });

    describe('Error Properties', () => {
      it('should include accountId in error', () => {
        try {
          resolveZTMChatAccount({ cfg: undefined, accountId: '../etc/passwd' });
        } catch (error) {
          expect(error).toBeInstanceOf(InvalidAccountIdSecurityError);
          if (error instanceof InvalidAccountIdSecurityError) {
            expect(error.accountId).toBe('../etc/passwd');
          }
        }
      });

      it('should include reason in error', () => {
        try {
          resolveZTMChatAccount({ cfg: undefined, accountId: '__proto__' });
        } catch (error) {
          expect(error).toBeInstanceOf(InvalidAccountIdSecurityError);
          if (error instanceof InvalidAccountIdSecurityError) {
            expect(error.reason).toContain('dangerous property name');
          }
        }
      });

      it('should have correct error name', () => {
        try {
          resolveZTMChatAccount({ cfg: undefined, accountId: '/etc/passwd' });
        } catch (error) {
          expect(error).toBeInstanceOf(InvalidAccountIdSecurityError);
          if (error instanceof InvalidAccountIdSecurityError) {
            expect(error.name).toBe('InvalidAccountIdSecurityError');
          }
        }
      });
    });
  });
});
