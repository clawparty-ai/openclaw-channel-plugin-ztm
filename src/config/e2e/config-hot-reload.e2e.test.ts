/**
 * E2E Tests for Configuration Runtime Behavior
 *
 * Tests configuration at runtime:
 * - Configuration with different policies
 * - Configuration state changes
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateZTMChatConfig } from '../validation.js';
import { getDefaultConfig } from '../defaults.js';

describe('E2E: Configuration Runtime Behavior', () => {
  describe('Apply config changes with different policies', () => {
    it('should allow dmPolicy: allow', () => {
      const config = {
        agentUrl: 'http://localhost:7777',
        permitUrl: 'https://permit.example.com:7779/permit',
        permitSource: 'server',
        meshName: 'test-mesh',
        username: 'test-bot',
        dmPolicy: 'allow',
      };

      const result = validateZTMChatConfig(config);
      expect(result.valid).toBe(true);
      if (result.valid && result.config) {
        expect(result.config.dmPolicy).toBe('allow');
      }
    });

    it('should allow dmPolicy: deny', () => {
      const config = {
        agentUrl: 'http://localhost:7777',
        permitUrl: 'https://permit.example.com:7779/permit',
        permitSource: 'server',
        meshName: 'test-mesh',
        username: 'test-bot',
        dmPolicy: 'deny',
      };

      const result = validateZTMChatConfig(config);
      expect(result.valid).toBe(true);
      if (result.valid && result.config) {
        expect(result.config.dmPolicy).toBe('deny');
      }
    });

    it('should allow dmPolicy: pairing', () => {
      const config = {
        agentUrl: 'http://localhost:7777',
        permitUrl: 'https://permit.example.com:7779/permit',
        permitSource: 'server',
        meshName: 'test-mesh',
        username: 'test-bot',
        dmPolicy: 'pairing',
      };

      const result = validateZTMChatConfig(config);
      expect(result.valid).toBe(true);
      if (result.valid && result.config) {
        expect(result.config.dmPolicy).toBe('pairing');
      }
    });
  });

  describe('Default config values', () => {
    it('should provide default configuration', () => {
      const defaults = getDefaultConfig();

      expect(defaults.agentUrl).toBeDefined();
      expect(defaults.meshName).toBeDefined();
      expect(defaults.username).toBeDefined();
    });
  });

  describe('Reject invalid config updates', () => {
    it('should reject null config', () => {
      const result = validateZTMChatConfig(null);
      expect(result.valid).toBe(false);
    });

    it('should reject non-object config', () => {
      const result = validateZTMChatConfig('not-an-object');
      expect(result.valid).toBe(false);
    });

    it('should reject array config', () => {
      const result = validateZTMChatConfig([]);
      expect(result.valid).toBe(false);
    });
  });
});
