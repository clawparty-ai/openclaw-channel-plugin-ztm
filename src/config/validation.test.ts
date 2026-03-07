// Unit tests for config validation and resolution

import { describe, it, expect } from 'vitest';
import { testConfig } from '../test-utils/fixtures.js';
import { validateZTMChatConfig, resolveZTMChatConfig } from './index.js';

describe('validateZTMChatConfig', () => {
  it('should return valid for complete config', () => {
    const result = validateZTMChatConfig(testConfig);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.config).toBeDefined();
  });

  it('should return errors for missing required fields', () => {
    const result = validateZTMChatConfig({
      agentUrl: '',
      meshName: '',
      username: '',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should return error for invalid URL', () => {
    const result = validateZTMChatConfig({
      agentUrl: 'not-a-valid-url',
      meshName: 'my-mesh',
      username: 'test-bot',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'agentUrl')).toBe(true);
    // Zod returns 'type_mismatch' for invalid URLs
    expect(result.errors.some(e => e.reason === 'type_mismatch')).toBe(true);
  });

  it('should provide user-friendly error messages', () => {
    const result = validateZTMChatConfig({
      agentUrl: 'invalid',
      meshName: '',
      username: '',
    });

    expect(result.errors[0].field).toBe('agentUrl');
    // Zod message format: "Agent URL must be a valid URL"
    expect(result.errors[0].message).toContain('valid URL');
  });

  it('should list all validation errors', () => {
    const result = validateZTMChatConfig({
      agentUrl: 'invalid-url',
      permitUrl: 'invalid-url',
      permitSource: 'server',
      meshName: '',
      username: '',
    });

    expect(result.valid).toBe(false);
    // Zod returns more granular errors - check for presence of key fields
    expect(result.errors.some(e => e.field === 'agentUrl')).toBe(true);
    expect(result.errors.some(e => e.field === 'permitUrl')).toBe(true);
    expect(result.errors.some(e => e.field === 'meshName')).toBe(true);
    expect(result.errors.some(e => e.field === 'username')).toBe(true);
  });

  it('should include error reason types', () => {
    const result = validateZTMChatConfig({
      agentUrl: '',
      meshName: testConfig.meshName,
      permitUrl: testConfig.permitUrl,
      username: testConfig.username,
    });

    const agentUrlError = result.errors.find(e => e.field === 'agentUrl');
    expect(agentUrlError).toBeDefined();
    // Zod returns type_mismatch for empty string (invalid_string) rather than required
    expect(agentUrlError!.reason).toBe('type_mismatch');
  });

  it('should include invalid value in error', () => {
    const result = validateZTMChatConfig({
      agentUrl: 'not-a-url',
      meshName: testConfig.meshName,
      permitUrl: testConfig.permitUrl,
      username: testConfig.username,
    });

    const agentUrlError = result.errors.find(e => e.field === 'agentUrl');
    expect(agentUrlError).toBeDefined();
    // Zod provides the error message which contains the invalid value context
    expect(agentUrlError!.message.toLowerCase()).toContain('url');
  });

  it('should handle root type mismatch', () => {
    const result = validateZTMChatConfig('not-an-object');
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe('root');
    expect(result.errors[0].reason).toBe('type_mismatch');
  });

  it('should handle null input', () => {
    const result = validateZTMChatConfig(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe('root');
  });

  it('should validate dmPolicy type', () => {
    const result = validateZTMChatConfig({
      ...testConfig,
      dmPolicy: 'invalid-policy' as any,
    });

    expect(result.valid).toBe(false);
    const dmPolicyError = result.errors.find(e => e.field === 'dmPolicy');
    expect(dmPolicyError).toBeDefined();
    // Zod returns invalid_format for invalid enum values
    expect(dmPolicyError!.reason).toBe('invalid_format');
  });

  it('should validate apiTimeout range', () => {
    const result = validateZTMChatConfig({
      ...testConfig,
      apiTimeout: 500,
    });

    expect(result.valid).toBe(false);
    const timeoutError = result.errors.find(e => e.field === 'apiTimeout');
    expect(timeoutError).toBeDefined();
    expect(timeoutError!.reason).toBe('out_of_range');
  });

  it('should validate meshName length', () => {
    const result = validateZTMChatConfig({
      ...testConfig,
      meshName: 'a'.repeat(100),
    });

    expect(result.valid).toBe(false);
    const meshError = result.errors.find(e => e.field === 'meshName');
    expect(meshError).toBeDefined();
    expect(meshError!.reason).toBe('out_of_range');
  });

  it('should validate username length', () => {
    const result = validateZTMChatConfig({
      ...testConfig,
      username: 'a'.repeat(100),
    });

    expect(result.valid).toBe(false);
    const userError = result.errors.find(e => e.field === 'username');
    expect(userError).toBeDefined();
    expect(userError!.reason).toBe('out_of_range');
  });
});

describe('resolveZTMChatConfig', () => {
  it('should return default values for empty input', () => {
    const result = resolveZTMChatConfig({});

    expect(result.agentUrl).toBe('http://localhost:7777');
    expect(result.permitUrl).toBe('https://clawparty.flomesh.io:7779/permit');
    expect(result.meshName).toBe('openclaw-mesh');
    expect(result.username).toBe('openclaw-bot');
    expect(result.enableGroups).toBe(false);
  });

  it('should preserve provided values', () => {
    const input = {
      agentUrl: 'https://my-agent.example.com:7777',
      permitUrl: 'https://my-permit.example.com:7779',
      meshName: 'my-mesh',
      username: 'my-bot',
      enableGroups: true,
    };

    const result = resolveZTMChatConfig(input);

    expect(result.agentUrl).toBe('https://my-agent.example.com:7777');
    expect(result.permitUrl).toBe('https://my-permit.example.com:7779');
    expect(result.meshName).toBe('my-mesh');
    expect(result.username).toBe('my-bot');
    expect(result.enableGroups).toBe(true);
  });

  it('should trim whitespace from string values', () => {
    const result = resolveZTMChatConfig({
      agentUrl: `  ${testConfig.agentUrl}  `,
      meshName: `  ${testConfig.meshName}  `,
      username: `  ${testConfig.username}  `,
    });

    expect(result.agentUrl).toBe(testConfig.agentUrl);
    expect(result.meshName).toBe(testConfig.meshName);
    expect(result.username).toBe(testConfig.username);
  });

  it('should handle null/undefined values', () => {
    const result = resolveZTMChatConfig({
      agentUrl: null,
      meshName: undefined,
      username: null,
    });

    expect(result.agentUrl).toBe('http://localhost:7777');
    expect(result.meshName).toBe('openclaw-mesh');
    expect(result.username).toBe('openclaw-bot');
  });
});

describe('permitSource validation', () => {
  it('should fail when permitSource is missing', () => {
    const config = {
      agentUrl: 'http://localhost:7777',
      permitUrl: 'https://clawparty.flomesh.io:7779/permit',
      meshName: 'test-mesh',
      username: 'test-bot',
    };
    const result = validateZTMChatConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ field: 'permitSource' }));
  });

  it('should fail when permitSource is auto but permitUrl is missing', () => {
    const config = {
      agentUrl: 'http://localhost:7777',
      meshName: 'test-mesh',
      username: 'test-bot',
      permitSource: 'server',
    };
    const result = validateZTMChatConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ field: 'permitUrl' }));
  });

  it('should fail when permitSource is file but permitFilePath is missing', () => {
    const config = {
      agentUrl: 'http://localhost:7777',
      meshName: 'test-mesh',
      username: 'test-bot',
      permitSource: 'file',
    };
    const result = validateZTMChatConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ field: 'permitFilePath' }));
  });

  it('should fail when permitFilePath contains path traversal (../)', () => {
    const config = {
      agentUrl: 'http://localhost:7777',
      meshName: 'test-mesh',
      username: 'test-bot',
      permitSource: 'file',
      permitFilePath: '../../../etc/passwd',
    };
    const result = validateZTMChatConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'permitFilePath',
        message: expect.stringContaining('path traversal'),
      })
    );
  });

  it('should fail when permitFilePath contains Windows path traversal (..\\)', () => {
    const config = {
      agentUrl: 'http://localhost:7777',
      meshName: 'test-mesh',
      username: 'test-bot',
      permitSource: 'file',
      permitFilePath: '..\\..\\windows\\system32\\config',
    };
    const result = validateZTMChatConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'permitFilePath',
        message: expect.stringContaining('path traversal'),
      })
    );
  });

  it('should accept valid permitFilePath without path traversal', () => {
    const config = {
      agentUrl: 'http://localhost:7777',
      meshName: 'test-mesh',
      username: 'test-bot',
      permitSource: 'file',
      permitFilePath: '/home/user/ztm/permit.json',
    };
    const result = validateZTMChatConfig(config);
    // Should not have path traversal error
    const pathTraversalErrors = result.errors.filter(
      e => e.field === 'permitFilePath' && e.message.includes('path traversal')
    );
    expect(pathTraversalErrors).toHaveLength(0);
  });
});
