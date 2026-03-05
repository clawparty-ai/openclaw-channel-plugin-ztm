/**
 * Bindings Logic Tests
 * @module channel/onboarding.bindings.test
 * Tests for the bindings handling logic in configureInteractive
 */

import { describe, it, expect } from 'vitest';
import type { OpenClawConfig } from 'openclaw/plugin-sdk';

describe('configureInteractive bindings handling (ADR-024)', () => {
  /**
   * Simulates the bindings logic from configureInteractive
   * This is the core logic being tested
   */
  function processBindings(
    cfg: OpenClawConfig,
    accountId: string
  ): OpenClawConfig {
    // Build/update bindings (required for OpenClaw 2026.2.26+)
    const rawBindings = (cfg as Record<string, unknown>).bindings as
      | Array<Record<string, unknown>>
      | undefined;
    const existingBindings = Array.isArray(rawBindings) ? rawBindings : [];

    // Separate ztm-chat bindings from other channel bindings
    const otherBindings = existingBindings.filter((b: unknown) => {
      const binding = b as Record<string, unknown> | undefined;
      const match = binding?.match as Record<string, unknown> | undefined;
      return match?.channel !== 'ztm-chat';
    });
    const ztmChatBindings = existingBindings.filter((b: unknown) => {
      const binding = b as Record<string, unknown> | undefined;
      const match = binding?.match as Record<string, unknown> | undefined;
      return match?.channel === 'ztm-chat';
    });

    // Create new binding (with accountId)
    const newBinding = {
      agentId: 'main',
      match: {
        channel: 'ztm-chat',
        accountId: accountId,
      },
    };

    // If no ztm-chat binding exists, add new one
    const updatedBindings = [...otherBindings];
    if (ztmChatBindings.length === 0) {
      updatedBindings.push(newBinding);
    } else {
      // Keep existing ztm-chat bindings
      updatedBindings.push(...ztmChatBindings);
    }

    // Build new config with bindings
    const newCfg: OpenClawConfig = {
      ...cfg,
      bindings: updatedBindings as unknown as Array<{
        agentId: string;
        match: { channel: string; accountId: string };
      }>,
    };

    return newCfg;
  }

  it('should create ztm-chat binding when none exists', () => {
    const cfg: OpenClawConfig = {
      channels: {},
    } as unknown as OpenClawConfig;

    const result = processBindings(cfg, 'test-bot');

    const bindings = (result as Record<string, unknown>).bindings as Array<unknown>;
    expect(bindings).toBeDefined();
    expect(bindings.length).toBe(1);
    expect(bindings[0]).toEqual({
      agentId: 'main',
      match: {
        channel: 'ztm-chat',
        accountId: 'test-bot',
      },
    });
  });

  it('should add ztm-chat binding while preserving other channel bindings', () => {
    const cfg: OpenClawConfig = {
      channels: {},
      bindings: [
        {
          agentId: 'main',
          match: { channel: 'slack', accountId: 'slack-team' },
        },
        {
          agentId: 'secondary',
          match: { channel: 'discord', accountId: 'discord-guild' },
        },
      ] as unknown as Array<{ agentId: string; match: { channel: string; accountId: string } }>,
    };

    const result = processBindings(cfg, 'test-bot');

    const bindings = (result as Record<string, unknown>).bindings as Array<unknown>;
    expect(bindings.length).toBe(3); // 2 existing + 1 new ztm-chat

    // Check that other bindings are preserved
    expect(bindings[0]).toEqual({
      agentId: 'main',
      match: { channel: 'slack', accountId: 'slack-team' },
    });
    expect(bindings[1]).toEqual({
      agentId: 'secondary',
      match: { channel: 'discord', accountId: 'discord-guild' },
    });

    // Check new ztm-chat binding
    expect(bindings[2]).toEqual({
      agentId: 'main',
      match: { channel: 'ztm-chat', accountId: 'test-bot' },
    });
  });

  it('should preserve existing ztm-chat bindings', () => {
    const cfg: OpenClawConfig = {
      channels: {},
      bindings: [
        {
          agentId: 'main',
          match: { channel: 'slack', accountId: 'slack-team' },
        },
        {
          agentId: 'secondary',
          match: { channel: 'ztm-chat', accountId: 'existing-bot' },
        },
      ] as unknown as Array<{ agentId: string; match: { channel: string; accountId: string } }>,
    };

    const result = processBindings(cfg, 'test-bot');

    const bindings = (result as Record<string, unknown>).bindings as Array<unknown>;
    expect(bindings.length).toBe(2); // 1 other + 1 existing ztm-chat (no new binding added)

    // Verify existing bindings are preserved
    expect(bindings[0]).toEqual({
      agentId: 'main',
      match: { channel: 'slack', accountId: 'slack-team' },
    });
    expect(bindings[1]).toEqual({
      agentId: 'secondary',
      match: { channel: 'ztm-chat', accountId: 'existing-bot' },
    });
  });

  it('should handle multiple existing ztm-chat bindings', () => {
    const cfg: OpenClawConfig = {
      channels: {},
      bindings: [
        {
          agentId: 'main',
          match: { channel: 'ztm-chat', accountId: 'bot-1' },
        },
        {
          agentId: 'secondary',
          match: { channel: 'ztm-chat', accountId: 'bot-2' },
        },
        {
          agentId: 'main',
          match: { channel: 'slack', accountId: 'slack-team' },
        },
      ] as unknown as Array<{ agentId: string; match: { channel: string; accountId: string } }>,
    };

    const result = processBindings(cfg, 'test-bot');

    const bindings = (result as Record<string, unknown>).bindings as Array<unknown>;
    expect(bindings.length).toBe(3); // All 3 existing bindings preserved

    // Verify all bindings are preserved (no new binding added)
    expect(bindings).toEqual([
      { agentId: 'main', match: { channel: 'slack', accountId: 'slack-team' } },
      { agentId: 'main', match: { channel: 'ztm-chat', accountId: 'bot-1' } },
      { agentId: 'secondary', match: { channel: 'ztm-chat', accountId: 'bot-2' } },
    ]);
  });

  it('should create binding with correct structure for OpenClaw 2026.2.26+', () => {
    const cfg: OpenClawConfig = {
      channels: {},
    } as unknown as OpenClawConfig;

    const result = processBindings(cfg, 'test-bot');

    const bindings = (result as Record<string, unknown>).bindings as Array<
      Record<string, unknown>
    >;
    const binding = bindings[0];

    // Verify structure matches OpenClaw requirements
    expect(binding).toHaveProperty('agentId');
    expect(binding).toHaveProperty('match');
    expect(typeof binding.agentId).toBe('string');
    expect(typeof binding.match).toBe('object');
    expect(binding.match).toHaveProperty('channel');
    expect(binding.match).toHaveProperty('accountId');
    expect(binding.match?.channel).toBe('ztm-chat');
    expect(binding.match?.accountId).toBe('test-bot');
  });

  it('should handle empty bindings array', () => {
    const cfg: OpenClawConfig = {
      channels: {},
      bindings: [] as unknown as Array<{
        agentId: string;
        match: { channel: string; accountId: string };
      }>,
    };

    const result = processBindings(cfg, 'test-bot');

    const bindings = (result as Record<string, unknown>).bindings as Array<unknown>;
    expect(bindings.length).toBe(1);
    expect(bindings[0]).toEqual({
      agentId: 'main',
      match: { channel: 'ztm-chat', accountId: 'test-bot' },
    });
  });

  it('should use provided accountId in binding match', () => {
    const customAccountId = 'custom-bot-name';
    const cfg: OpenClawConfig = {
      channels: {},
    } as unknown as OpenClawConfig;

    const result = processBindings(cfg, customAccountId);

    const bindings = (result as Record<string, unknown>).bindings as Array<
      Record<string, unknown>
    >;
    expect(bindings[0]?.match?.accountId).toBe(customAccountId);
  });
});
