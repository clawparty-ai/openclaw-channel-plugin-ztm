// Integration tests for DM Policy
// Tests for full permission check flow with real configurations

import { describe, it, expect } from 'vitest';
import { checkDmPolicy, isUserWhitelisted, isPairingMode } from './dm-policy.js';
import type { ZTMChatConfig } from '../types/config.js';
import { testConfig } from '../test-utils/fixtures.js';

// Helper to create a minimal config
function createMockConfig(overrides: Partial<ZTMChatConfig> = {}): ZTMChatConfig {
  return {
    ...testConfig,
    username: 'chatbot',
    dmPolicy: 'pairing',
    allowFrom: [],
    ...overrides,
  };
}

describe('DM Policy Integration', () => {
  describe('full permission check flow - allow policy', () => {
    it('should allow all messages when dmPolicy is allow', () => {
      const config = createMockConfig({
        dmPolicy: 'allow',
        allowFrom: [],
      });

      const result = checkDmPolicy('alice', config, []);

      expect(result.allowed).toBe(true);
      expect(result.action).toBe('process');
      expect(result.reason).toBe('allowed');
    });

    it('should allow whitelisted users even with allow policy', () => {
      const config = createMockConfig({
        dmPolicy: 'allow',
        allowFrom: ['alice', 'bob'],
      });

      const result = checkDmPolicy('alice', config, []);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('whitelisted');
    });

    it('should handle allow policy with empty allowFrom', () => {
      const config = createMockConfig({
        dmPolicy: 'allow',
        allowFrom: [],
      });

      const result = checkDmPolicy('charlie', config, []);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('allowed');
    });
  });

  describe('full permission check flow - deny policy', () => {
    it('should deny all messages when dmPolicy is deny', () => {
      const config = createMockConfig({
        dmPolicy: 'deny',
        allowFrom: [],
      });

      const result = checkDmPolicy('alice', config, []);

      expect(result.allowed).toBe(false);
      expect(result.action).toBe('ignore');
      expect(result.reason).toBe('denied');
    });

    it('should allow whitelisted users in deny policy', () => {
      const config = createMockConfig({
        dmPolicy: 'deny',
        allowFrom: ['alice'],
      });

      const result = checkDmPolicy('alice', config, []);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('whitelisted');
    });

    it('should allow store-approved users in deny policy', () => {
      const config = createMockConfig({
        dmPolicy: 'deny',
        allowFrom: [],
      });

      const result = checkDmPolicy('alice', config, ['alice']);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('whitelisted');
    });

    it('should prioritize whitelist over deny policy', () => {
      const config = createMockConfig({
        dmPolicy: 'deny',
        allowFrom: ['alice'],
      });

      const result = checkDmPolicy('alice', config, ['bob']);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('whitelisted');
    });
  });

  describe('full permission check flow - pairing policy', () => {
    it('should request pairing for unknown users in pairing mode', () => {
      const config = createMockConfig({
        dmPolicy: 'pairing',
        allowFrom: [],
      });

      const result = checkDmPolicy('alice', config, []);

      expect(result.allowed).toBe(false);
      expect(result.action).toBe('request_pairing');
      expect(result.reason).toBe('pending');
    });

    it('should allow whitelisted users in pairing mode', () => {
      const config = createMockConfig({
        dmPolicy: 'pairing',
        allowFrom: ['alice'],
      });

      const result = checkDmPolicy('alice', config, []);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('whitelisted');
    });

    it('should allow store-approved users in pairing mode', () => {
      const config = createMockConfig({
        dmPolicy: 'pairing',
        allowFrom: [],
      });

      const result = checkDmPolicy('alice', config, ['alice']);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('whitelisted');
    });

    it('should be default policy when not specified', () => {
      const config = createMockConfig({
        dmPolicy: undefined,
        allowFrom: [],
      });

      const result = checkDmPolicy('alice', config, []);

      // Default is pairing mode
      expect(result.allowed).toBe(false);
      expect(result.action).toBe('request_pairing');
    });
  });

  describe('whitelist integration', () => {
    it('should check config allowFrom list', () => {
      const config = createMockConfig({
        allowFrom: ['Alice', 'Bob'],
      });

      expect(isUserWhitelisted('alice', config, [])).toBe(true);
      expect(isUserWhitelisted('bob', config, [])).toBe(true);
      expect(isUserWhitelisted('charlie', config, [])).toBe(false);
    });

    it('should check store allowFrom list', () => {
      const config = createMockConfig({
        allowFrom: [],
      });

      expect(isUserWhitelisted('alice', config, ['alice'])).toBe(true);
      expect(isUserWhitelisted('charlie', config, ['alice', 'bob'])).toBe(false);
    });

    it('should check both config and store allowFrom', () => {
      const config = createMockConfig({
        allowFrom: ['alice'],
      });

      expect(isUserWhitelisted('bob', config, ['bob'])).toBe(true);
      expect(isUserWhitelisted('alice', config, ['bob'])).toBe(true);
    });

    it('should be case-insensitive', () => {
      const config = createMockConfig({
        allowFrom: ['Alice'],
      });

      expect(isUserWhitelisted('ALICE', config, [])).toBe(true);
      expect(isUserWhitelisted('alice', config, [])).toBe(true);
      expect(isUserWhitelisted('AlIcE', config, [])).toBe(true);
    });

    it('should handle whitespace in usernames', () => {
      const config = createMockConfig({
        allowFrom: [' alice '],
      });

      expect(isUserWhitelisted('alice', config, [])).toBe(true);
    });
  });

  describe('isPairingMode', () => {
    it('should return true when dmPolicy is pairing', () => {
      const config = createMockConfig({ dmPolicy: 'pairing' });
      expect(isPairingMode(config)).toBe(true);
    });

    it('should return false when dmPolicy is allow', () => {
      const config = createMockConfig({ dmPolicy: 'allow' });
      expect(isPairingMode(config)).toBe(false);
    });

    it('should return false when dmPolicy is deny', () => {
      const config = createMockConfig({ dmPolicy: 'deny' });
      expect(isPairingMode(config)).toBe(false);
    });

    it('should return false when dmPolicy is undefined', () => {
      const config = createMockConfig({ dmPolicy: undefined });
      expect(isPairingMode(config)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle empty sender', () => {
      const config = createMockConfig({ dmPolicy: 'allow' });

      const result1 = checkDmPolicy('', config, []);
      expect(result1.allowed).toBe(false);
      expect(result1.reason).toBe('denied');

      const result2 = checkDmPolicy('   ', config, []);
      expect(result2.allowed).toBe(false);
    });

    it('should handle whitespace-only sender', () => {
      const config = createMockConfig({ dmPolicy: 'allow' });

      const result = checkDmPolicy('  \n\t  ', config, []);
      expect(result.allowed).toBe(false);
    });

    it('should handle null/undefined allowFrom in config', () => {
      const config = createMockConfig({
        dmPolicy: 'allow',
        allowFrom: undefined as any,
      });

      const result = checkDmPolicy('alice', config, []);
      expect(result.allowed).toBe(true);
    });

    it('should handle unknown dmPolicy as allow', () => {
      const config = createMockConfig({
        dmPolicy: 'unknown' as any,
        allowFrom: [],
      });

      // Unknown policy defaults to allow
      const result = checkDmPolicy('alice', config, []);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('allowed');
    });

    it('should prioritize config whitelist over store whitelist', () => {
      const config = createMockConfig({
        dmPolicy: 'deny',
        allowFrom: ['alice'],
      });

      // Even if store has bob, config alice should take priority
      const result = checkDmPolicy('alice', config, ['bob']);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('whitelisted');
    });

    it('should handle special characters in username', () => {
      const config = createMockConfig({
        dmPolicy: 'allow',
        allowFrom: [],
      });

      // Should handle without crashing
      const result = checkDmPolicy('user@domain.com', config, []);
      expect(result.allowed).toBe(true);
    });

    it('should normalize sender before checking', () => {
      const config = createMockConfig({
        dmPolicy: 'deny',
        allowFrom: ['alice'],
      });

      // Whitespace should be trimmed and lowercased
      const result = checkDmPolicy('  ALICE  ', config, []);
      expect(result.allowed).toBe(true);
    });

    it('should handle very long allowFrom list', () => {
      const longList = Array.from({ length: 100 }, (_, i) => `user${i}`);
      const config = createMockConfig({
        dmPolicy: 'deny',
        allowFrom: longList,
      });

      const result = checkDmPolicy('user50', config, []);
      expect(result.allowed).toBe(true);
    });
  });
});
