/**
 * Onboarding Adapter Tests
 * @module channel/onboarding.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OpenClawConfig } from 'openclaw/plugin-sdk';
import type { ChannelOnboardingAdapter } from 'openclaw/plugin-sdk';

// Mock the dependencies
vi.mock('../di/index.js', () => ({
  container: {
    get: vi.fn(),
    register: vi.fn(),
  },
  DEPENDENCIES: {
    CONFIG: 'config',
    API_CLIENT_FACTORY: 'apiClientFactory',
    LOGGER: 'logger',
  },
}));

describe('ztmChatOnboardingAdapter', () => {
  let adapter: ChannelOnboardingAdapter;

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
          ztmChat: {
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
    });

    it('should return unconfigured when no accounts', async () => {
      const cfg: OpenClawConfig = {
        channels: {},
      } as unknown as OpenClawConfig;

      const result = await adapter.getStatus({ cfg, accountOverrides: {}, options: {} });

      expect(result.channel).toBe('ztm-chat');
      expect(result.configured).toBe(false);
    });
  });

  describe('dmPolicy', () => {
    it('getCurrent should return correct policy', () => {
      const cfg: OpenClawConfig = {
        channels: {
          ztmChat: {
            dmPolicy: 'allow',
          },
        },
      } as unknown as OpenClawConfig;

      const result = adapter.dmPolicy!.getCurrent(cfg);
      expect(result).toBe('allow');
    });

    it('getCurrent should return pairing as default', () => {
      const cfg: OpenClawConfig = {} as unknown as OpenClawConfig;

      const result = adapter.dmPolicy!.getCurrent(cfg);
      expect(result).toBe('pairing');
    });

    it('setPolicy should update config correctly', () => {
      const cfg: OpenClawConfig = {
        channels: {
          ztmChat: {
            dmPolicy: 'pairing',
          },
        },
      } as unknown as OpenClawConfig;

      const result = adapter.dmPolicy!.setPolicy(cfg, 'open');

      expect(result.channels?.ztmChat?.dmPolicy).toBe('open');
    });
  });

  describe('disable', () => {
    it('should remove channel config', () => {
      const cfg: OpenClawConfig = {
        channels: {
          ztmChat: {
            enabled: true,
            accounts: {
              default: {
                agentUrl: 'http://localhost:8080',
              },
            },
          },
        },
      } as unknown as OpenClawConfig;

      const result = adapter.disable!(cfg);

      expect(result.channels?.ztmChat).toBeUndefined();
    });
  });
});
