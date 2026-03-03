/**
 * E2E Tests for Configuration Validation
 *
 * Tests configuration validation:
 * - Invalid agentUrl format
 * - Invalid username
 * - Default values for optional fields
 * - Configuration consistency validation
 */

import { describe, it, expect } from 'vitest';
import { validateZTMChatConfig } from '../validation.js';

describe('E2E: Configuration Validation', () => {
  describe('Invalid agentUrl format', () => {
    it('should reject invalid URL format', () => {
      const invalidConfig = {
        agentUrl: 'not-a-valid-url',
        permitUrl: 'https://permit.example.com:7779/permit',
        permitSource: 'server',
        meshName: 'test-mesh',
        username: 'test-bot',
      };

      const result = validateZTMChatConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'agentUrl')).toBe(true);
    });

    it('should accept valid HTTP URL', () => {
      const validConfig = {
        agentUrl: 'http://localhost:7777',
        permitUrl: 'https://permit.example.com:7779/permit',
        permitSource: 'server',
        meshName: 'test-mesh',
        username: 'test-bot',
      };

      const result = validateZTMChatConfig(validConfig);
      expect(result.valid).toBe(true);
    });

    it('should accept valid HTTPS URL', () => {
      const validConfig = {
        agentUrl: 'https://agent.example.com:7777',
        permitUrl: 'https://permit.example.com:7779/permit',
        permitSource: 'server',
        meshName: 'test-mesh',
        username: 'test-bot',
      };

      const result = validateZTMChatConfig(validConfig);
      expect(result.valid).toBe(true);
    });
  });

  describe('Invalid username', () => {
    it('should reject empty username', () => {
      const invalidConfig = {
        agentUrl: 'http://localhost:7777',
        permitUrl: 'https://permit.example.com:7779/permit',
        permitSource: 'server',
        meshName: 'test-mesh',
        username: '',
      };

      const result = validateZTMChatConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'username')).toBe(true);
    });

    it('should accept valid username', () => {
      const validConfig = {
        agentUrl: 'http://localhost:7777',
        permitUrl: 'https://permit.example.com:7779/permit',
        permitSource: 'server',
        meshName: 'test-mesh',
        username: 'valid-username_123',
      };

      const result = validateZTMChatConfig(validConfig);
      expect(result.valid).toBe(true);
    });
  });

  describe('Default values for optional fields', () => {
    it('should apply defaults to optional group fields', () => {
      const minimalConfig = {
        agentUrl: 'http://localhost:7777',
        permitUrl: 'https://permit.example.com:7779/permit',
        permitSource: 'server',
        meshName: 'test-mesh',
        username: 'test-bot',
      };

      const result = validateZTMChatConfig(minimalConfig);
      expect(result.valid).toBe(true);

      if (result.valid && result.config) {
        // enableGroups defaults to false when not provided (Boolean(undefined) === false)
        expect(result.config.enableGroups).toBe(false);
        expect(result.config.dmPolicy).toBe('pairing');
        expect(result.config.apiTimeout).toBe(30000);
      }
    });

    it('should accept explicit values for optional fields', () => {
      const explicitConfig = {
        agentUrl: 'http://localhost:7777',
        permitUrl: 'https://permit.example.com:7779/permit',
        permitSource: 'server',
        meshName: 'test-mesh',
        username: 'test-bot',
        enableGroups: false,
        dmPolicy: 'deny',
        apiTimeout: 60000,
      };

      const result = validateZTMChatConfig(explicitConfig);
      expect(result.valid).toBe(true);

      if (result.valid && result.config) {
        expect(result.config.enableGroups).toBe(false);
        expect(result.config.dmPolicy).toBe('deny');
        expect(result.config.apiTimeout).toBe(60000);
      }
    });
  });

  describe('Permit source consistency', () => {
    it('should require permitFilePath when source is file', () => {
      const invalidConfig = {
        agentUrl: 'http://localhost:7777',
        permitUrl: 'https://permit.example.com:7779/permit',
        permitSource: 'file',
        meshName: 'test-mesh',
        username: 'test-bot',
      };

      const result = validateZTMChatConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'permitFilePath')).toBe(true);
    });

    it('should accept permitFilePath when source is file', () => {
      const validConfig = {
        agentUrl: 'http://localhost:7777',
        permitUrl: 'https://permit.example.com:7779/permit',
        permitSource: 'file',
        permitFilePath: '/path/to/permit.json',
        meshName: 'test-mesh',
        username: 'test-bot',
      };

      const result = validateZTMChatConfig(validConfig);
      expect(result.valid).toBe(true);
    });
  });

  describe('Mesh name validation', () => {
    it('should reject invalid mesh name characters', () => {
      const invalidConfig = {
        agentUrl: 'http://localhost:7777',
        permitUrl: 'https://permit.example.com:7779/permit',
        permitSource: 'server',
        meshName: 'invalid mesh!',
        username: 'test-bot',
      };

      const result = validateZTMChatConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'meshName')).toBe(true);
    });

    it('should accept valid mesh name', () => {
      const validConfig = {
        agentUrl: 'http://localhost:7777',
        permitUrl: 'https://permit.example.com:7779/permit',
        permitSource: 'server',
        meshName: 'my-valid_mesh-123',
        username: 'test-bot',
      };

      const result = validateZTMChatConfig(validConfig);
      expect(result.valid).toBe(true);
    });
  });
});
