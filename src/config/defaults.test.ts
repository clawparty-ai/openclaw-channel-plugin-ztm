// Unit tests for default config and probe config

import { describe, it, expect } from 'vitest';
import { testConfig } from '../test-utils/fixtures.js';
import {
  getDefaultConfig,
  isConfigMinimallyValid,
  createProbeConfig,
  type ZTMChatConfig,
} from './index.js';

describe('getDefaultConfig', () => {
  it('should return default configuration', () => {
    const result = getDefaultConfig();

    expect(result.agentUrl).toBe('http://localhost:7777');
    expect(result.permitUrl).toBe('https://clawparty.flomesh.io:7779/permit');
    expect(result.meshName).toBe('openclaw-mesh');
    expect(result.username).toBe('openclaw-bot');
    expect(result.enableGroups).toBe(true);
    expect(result.dmPolicy).toBe('pairing');
    expect(result.allowFrom).toBeUndefined();
  });
});

describe('isConfigMinimallyValid', () => {
  // Valid configs
  it('should return true for valid config with permitSource=server', () => {
    const config = {
      agentUrl: 'http://localhost:7777',
      meshName: 'my-mesh',
      username: 'test-bot',
      permitSource: 'server' as const,
      permitUrl: 'https://permit.example.com',
    } as Partial<ZTMChatConfig>;

    expect(isConfigMinimallyValid(config)).toBe(true);
  });

  it('should return true for valid config with permitSource=file', () => {
    const config = {
      agentUrl: 'http://localhost:7777',
      meshName: 'my-mesh',
      username: 'test-bot',
      permitSource: 'file' as const,
      permitFilePath: '/path/to/permit.json',
    } as Partial<ZTMChatConfig>;

    expect(isConfigMinimallyValid(config)).toBe(true);
  });

  // Missing required fields
  it('should return false for missing agentUrl', () => {
    const config = {
      agentUrl: '',
      meshName: 'my-mesh',
      username: 'test-bot',
      permitSource: 'server' as const,
      permitUrl: 'https://permit.example.com',
    } as Partial<ZTMChatConfig>;

    expect(isConfigMinimallyValid(config)).toBe(false);
  });

  it('should return false for missing username', () => {
    const config = {
      agentUrl: 'https://example.com',
      meshName: 'my-mesh',
      username: '',
      permitSource: 'server' as const,
      permitUrl: 'https://permit.example.com',
    } as Partial<ZTMChatConfig>;

    expect(isConfigMinimallyValid(config)).toBe(false);
  });

  it('should return false for missing meshName', () => {
    const config = {
      agentUrl: 'https://example.com',
      meshName: '',
      username: 'test-bot',
      permitSource: 'server' as const,
      permitUrl: 'https://permit.example.com',
    } as Partial<ZTMChatConfig>;

    expect(isConfigMinimallyValid(config)).toBe(false);
  });

  it('should return false for missing permitSource', () => {
    const config = {
      agentUrl: 'https://example.com',
      meshName: 'my-mesh',
      username: 'test-bot',
    } as Partial<ZTMChatConfig>;

    expect(isConfigMinimallyValid(config)).toBe(false);
  });

  // permitSource-dependent fields
  it('should return false for permitSource=server without permitUrl', () => {
    const config = {
      agentUrl: 'https://example.com',
      meshName: 'my-mesh',
      username: 'test-bot',
      permitSource: 'server' as const,
    } as Partial<ZTMChatConfig>;

    expect(isConfigMinimallyValid(config)).toBe(false);
  });

  it('should return false for permitSource=file without permitFilePath', () => {
    const config = {
      agentUrl: 'https://example.com',
      meshName: 'my-mesh',
      username: 'test-bot',
      permitSource: 'file' as const,
    } as Partial<ZTMChatConfig>;

    expect(isConfigMinimallyValid(config)).toBe(false);
  });
});

describe('createProbeConfig', () => {
  it('should create a valid probe config', () => {
    const result = createProbeConfig({
      agentUrl: 'https://example.com:7777',
    });

    expect(result.agentUrl).toBe('https://example.com:7777');
    expect(result.permitUrl).toBe('https://clawparty.flomesh.io:7779/permit');
    expect(result.meshName).toBe('openclaw-mesh');
    expect(result.username).toBe('probe');
  });

  it('should use defaults for missing fields', () => {
    const result = createProbeConfig({});

    expect(result.agentUrl).toBe('http://localhost:7777');
    expect(result.permitUrl).toBe('https://clawparty.flomesh.io:7779/permit');
    expect(result.meshName).toBe('openclaw-mesh');
    expect(result.username).toBe('probe');
    expect(result.dmPolicy).toBe('pairing');
  });

  it('should preserve provided values', () => {
    const result = createProbeConfig({
      agentUrl: 'https://custom.example.com',
      permitUrl: 'https://custom-permit.example.com:7779/permit',
      meshName: 'custom-mesh',
      username: 'custom-user',
      enableGroups: true,
      dmPolicy: 'allow',
    });

    expect(result.agentUrl).toBe('https://custom.example.com');
    expect(result.permitUrl).toBe('https://custom-permit.example.com:7779/permit');
    expect(result.meshName).toBe('custom-mesh');
    expect(result.username).toBe('custom-user');
    expect(result.enableGroups).toBe(true);
    expect(result.dmPolicy).toBe('allow');
  });

  it('should preserve allowFrom from config', () => {
    const result = createProbeConfig({
      agentUrl: 'https://example.com',
      allowFrom: ['alice', 'bob'],
    });

    expect(result.allowFrom).toEqual(['alice', 'bob']);
  });
});
