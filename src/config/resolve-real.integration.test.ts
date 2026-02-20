/**
 * Real File System Integration tests for Config Resolution
 *
 * Tests for configuration resolution using REAL file I/O.
 * These tests verify actual file system operations during config loading.
 *
 * Test categories:
 * 1. Real JSON config file parsing
 * 2. File error handling (missing, corrupted, permissions)
 * 3. Config file discovery and loading
 * 4. Multiple config file scenarios
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  withTempDir,
  writeJSONFile,
  readJSONFile,
  checkFileExists,
  createTestConfigFile,
} from '../test-utils/fs-helpers.js';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';

// Import config functions
import { resolveZTMChatConfig, getDefaultConfig } from './defaults.js';
import type { ZTMChatConfig } from '../types/config.js';

// Mock logger for cleaner test output
const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../utils/logger.js', () => ({
  logger: mockLogger,
  defaultLogger: mockLogger,
}));

describe('Config Resolution Real File System Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Real JSON Config File Parsing', () => {
    it('should parse valid config from real JSON file', async () => {
      await withTempDir(async dir => {
        const configPath = await createTestConfigFile(dir, {
          agentUrl: 'http://real-file-test:7777',
          username: 'file-test-bot',
          meshName: 'file-test-mesh',
          dmPolicy: 'allow',
          apiTimeout: 45000,
        });

        // Verify file exists
        const exists = await checkFileExists(configPath);
        expect(exists).not.toBeNull();

        // Read and parse
        const loadedConfig = await readJSONFile<Partial<ZTMChatConfig>>(configPath);
        expect(loadedConfig.agentUrl).toBe('http://real-file-test:7777');
        expect(loadedConfig.username).toBe('file-test-bot');

        // Resolve config
        const resolved = resolveZTMChatConfig(loadedConfig);
        expect(resolved.agentUrl).toBe('http://real-file-test:7777');
        expect(resolved.username).toBe('file-test-bot');
        expect(resolved.meshName).toBe('file-test-mesh');
        expect(resolved.dmPolicy).toBe('allow');
        expect(resolved.apiTimeout).toBe(45000);
      });
    });

    it('should handle empty config file', async () => {
      await withTempDir(async dir => {
        const configPath = join(dir, 'config.json');
        await writeJSONFile(configPath, {});

        const loadedConfig = await readJSONFile<Partial<ZTMChatConfig>>(configPath);
        const resolved = resolveZTMChatConfig(loadedConfig);

        // Should use all defaults (except Boolean(undefined) quirks)
        expect(resolved.agentUrl).toBe('http://localhost:7777');
        expect(resolved.username).toBe('openclaw-bot');
        expect(resolved.meshName).toBe('openclaw-mesh');
      });
    });

    it('should handle config file with only some fields', async () => {
      await withTempDir(async dir => {
        const configPath = await createTestConfigFile(dir, {
          username: 'partial-config-bot',
          // Other fields will use defaults
        });

        const loadedConfig = await readJSONFile<Partial<ZTMChatConfig>>(configPath);
        const resolved = resolveZTMChatConfig(loadedConfig);

        expect(resolved.username).toBe('partial-config-bot');
        expect(resolved.agentUrl).toBe('http://localhost:7777'); // Default
        expect(resolved.meshName).toBe('openclaw-mesh'); // Default
      });
    });

    it('should preserve numeric values from config file', async () => {
      await withTempDir(async dir => {
        const configPath = await createTestConfigFile(dir, {
          apiTimeout: 120000,
          // Test various numeric values
        });

        const loadedConfig = await readJSONFile<Partial<ZTMChatConfig>>(configPath);
        const resolved = resolveZTMChatConfig(loadedConfig);

        expect(resolved.apiTimeout).toBe(120000);
        expect(typeof resolved.apiTimeout).toBe('number');
      });
    });

    it('should preserve boolean values from config file', async () => {
      await withTempDir(async dir => {
        const configPath = await createTestConfigFile(dir, {
          enableGroups: false,
          autoReply: false,
        });

        const loadedConfig = await readJSONFile<Partial<ZTMChatConfig>>(configPath);
        const resolved = resolveZTMChatConfig(loadedConfig);

        expect(resolved.enableGroups).toBe(false);
        expect(resolved.autoReply).toBe(false);
      });
    });

    it('should preserve array values from config file', async () => {
      await withTempDir(async dir => {
        const configPath = await createTestConfigFile(dir, {
          allowFrom: ['alice', 'bob', 'charlie'],
        });

        const loadedConfig = await readJSONFile<Partial<ZTMChatConfig>>(configPath);
        const resolved = resolveZTMChatConfig(loadedConfig);

        expect(resolved.allowFrom).toEqual(['alice', 'bob', 'charlie']);
        expect(Array.isArray(resolved.allowFrom)).toBe(true);
      });
    });
  });

  describe('File Error Handling', () => {
    it('should handle missing config file gracefully', async () => {
      await withTempDir(async dir => {
        const configPath = join(dir, 'nonexistent-config.json');

        const exists = await checkFileExists(configPath);
        expect(exists).toBeNull();

        // When file doesn't exist, use defaults
        const resolved = resolveZTMChatConfig(null);
        const defaults = getDefaultConfig();
        // Note: resolveZTMChatConfig has slightly different defaults than getDefaultConfig
        // due to Boolean(undefined) behavior for enableGroups
        expect(resolved.agentUrl).toBe(defaults.agentUrl);
        expect(resolved.username).toBe(defaults.username);
        expect(resolved.meshName).toBe(defaults.meshName);
      });
    });

    it('should handle corrupted JSON file', async () => {
      await withTempDir(async dir => {
        const configPath = join(dir, 'corrupted-config.json');
        await writeFile(configPath, '{ invalid json content }');

        // Should throw when trying to parse
        await expect(readJSONFile(configPath)).rejects.toThrow();
      });
    });

    it('should handle malformed JSON structure', async () => {
      await withTempDir(async dir => {
        const configPath = join(dir, 'malformed-config.json');
        await writeFile(configPath, JSON.stringify(['array', 'instead', 'of', 'object']));

        // Read succeeds (valid JSON) but structure is wrong
        const loadedConfig = await readJSONFile(configPath);

        // resolveZTMChatConfig should handle this and use defaults
        const resolved = resolveZTMChatConfig(loadedConfig as any);
        // Verify key fields have expected values
        expect(resolved.agentUrl).toBe('http://localhost:7777');
        expect(resolved.username).toBe('openclaw-bot');
      });
    });

    it('should handle config file with invalid data types', async () => {
      await withTempDir(async dir => {
        const configPath = await createTestConfigFile(dir, {
          agentUrl: 12345 as any, // Should be string
          username: true as any, // Should be string
          apiTimeout: 'not-a-number' as any, // Should be number
        });

        const loadedConfig = await readJSONFile<Partial<ZTMChatConfig>>(configPath);
        const resolved = resolveZTMChatConfig(loadedConfig);

        // Should use defaults for invalid types
        expect(resolved.agentUrl).toBe('http://localhost:7777');
        expect(resolved.username).toBe('openclaw-bot');
        expect(resolved.apiTimeout).toBe(30000); // Default for invalid
      });
    });

    it('should handle empty JSON file', async () => {
      await withTempDir(async dir => {
        const configPath = join(dir, 'empty.json');
        await writeFile(configPath, '');

        // Should throw on empty file (empty string is not valid JSON)
        await expect(readJSONFile(configPath)).rejects.toThrow();
      });
    });

    it('should handle JSON file with only whitespace', async () => {
      await withTempDir(async dir => {
        const configPath = join(dir, 'whitespace.json');
        await writeFile(configPath, '   \n\t  ');

        // Should throw on whitespace-only file
        await expect(readJSONFile(configPath)).rejects.toThrow();
      });
    });
  });

  describe('Config File Discovery', () => {
    it('should find config file in standard location', async () => {
      await withTempDir(async dir => {
        const configPath = join(dir, 'config.json');
        await writeJSONFile(configPath, {
          username: 'discovery-bot',
        });

        const exists = await checkFileExists(configPath);
        expect(exists).not.toBeNull();

        const loadedConfig = await readJSONFile<Partial<ZTMChatConfig>>(configPath);
        expect(loadedConfig.username).toBe('discovery-bot');
      });
    });

    it('should search multiple potential config locations', async () => {
      await withTempDir(async dir => {
        // Create config in subdirectory
        const subdir = join(dir, 'subdir');
        const { mkdir } = await import('node:fs/promises');
        await mkdir(subdir, { recursive: true });

        const configPath = join(subdir, 'ztm-config.json');
        await writeJSONFile(configPath, {
          username: 'subdir-bot',
        });

        // Verify it exists
        const exists = await checkFileExists(configPath);
        expect(exists).not.toBeNull();
      });
    });

    it('should handle multiple config files in directory', async () => {
      await withTempDir(async dir => {
        // Create multiple config files
        await createTestConfigFile(dir, { username: 'config1-bot' }, 'config1.json');
        await createTestConfigFile(dir, { username: 'config2-bot' }, 'config2.json');
        await createTestConfigFile(dir, { username: 'config3-bot' }, 'config3.json');

        // All should exist
        const exists1 = await checkFileExists(join(dir, 'config1.json'));
        const exists2 = await checkFileExists(join(dir, 'config2.json'));
        const exists3 = await checkFileExists(join(dir, 'config3.json'));

        expect(exists1).not.toBeNull();
        expect(exists2).not.toBeNull();
        expect(exists3).not.toBeNull();

        // Each should have correct content
        const config1 = await readJSONFile<{ username: string }>(join(dir, 'config1.json'));
        const config2 = await readJSONFile<{ username: string }>(join(dir, 'config2.json'));
        const config3 = await readJSONFile<{ username: string }>(join(dir, 'config3.json'));

        expect(config1.username).toBe('config1-bot');
        expect(config2.username).toBe('config2-bot');
        expect(config3.username).toBe('config3-bot');
      });
    });
  });

  describe('Config Persistence', () => {
    it('should write and read config consistently', async () => {
      await withTempDir(async dir => {
        const originalConfig = {
          agentUrl: 'http://persistence-test:7777',
          username: 'persistence-bot',
          meshName: 'persistence-mesh',
          dmPolicy: 'deny' as const,
          allowFrom: ['user1', 'user2'],
          enableGroups: true,
          autoReply: false,
          apiTimeout: 90000,
        };

        const configPath = await createTestConfigFile(dir, originalConfig);

        // Read back
        const loadedConfig = await readJSONFile<Partial<ZTMChatConfig>>(configPath);

        // Should match original
        expect(loadedConfig.agentUrl).toBe(originalConfig.agentUrl);
        expect(loadedConfig.username).toBe(originalConfig.username);
        expect(loadedConfig.meshName).toBe(originalConfig.meshName);
        expect(loadedConfig.dmPolicy).toBe(originalConfig.dmPolicy);
        expect(loadedConfig.allowFrom).toEqual(originalConfig.allowFrom);
        expect(loadedConfig.enableGroups).toBe(originalConfig.enableGroups);
        expect(loadedConfig.autoReply).toBe(originalConfig.autoReply);
        expect(loadedConfig.apiTimeout).toBe(originalConfig.apiTimeout);
      });
    });

    it('should handle multiple write-read cycles', async () => {
      await withTempDir(async dir => {
        const configPath = join(dir, 'cycle-config.json');

        const configs = [
          { username: 'cycle1-bot', agentUrl: 'http://cycle1:7777' },
          { username: 'cycle2-bot', agentUrl: 'http://cycle2:7777' },
          { username: 'cycle3-bot', agentUrl: 'http://cycle3:7777' },
        ];

        for (const config of configs) {
          // Write
          await writeJSONFile(configPath, config);

          // Read
          const loaded = await readJSONFile<typeof config>(configPath);
          expect(loaded.username).toBe(config.username);
          expect(loaded.agentUrl).toBe(config.agentUrl);
        }
      });
    });

    it('should preserve special characters in strings', async () => {
      await withTempDir(async dir => {
        const configPath = await createTestConfigFile(dir, {
          username: 'bot-with-special-chars-测试-🚀',
          agentUrl: 'http://example.com:7777?param=value&other=123',
        });

        const loadedConfig = await readJSONFile<Partial<ZTMChatConfig>>(configPath);
        const resolved = resolveZTMChatConfig(loadedConfig);

        expect(resolved.username).toBe('bot-with-special-chars-测试-🚀');
        expect(resolved.agentUrl).toBe('http://example.com:7777?param=value&other=123');
      });
    });
  });

  describe('Complex Config Scenarios', () => {
    it('should handle complete production-like config', async () => {
      await withTempDir(async dir => {
        const productionConfig = {
          agentUrl: 'https://ztm-agent.production.example.com:7777',
          permitUrl: 'https://permit.production.example.com/api/permit',
          permitSource: 'server' as const,
          meshName: 'production-mesh',
          username: 'production-bot',
          enableGroups: true,
          autoReply: true,
          messagePath: '/shared/production',
          dmPolicy: 'pairing' as const,
          allowFrom: ['trusted-user-1', 'trusted-user-2', 'admin-bot'],
          apiTimeout: 45000,
          pollingInterval: 3000,
        };

        const configPath = await createTestConfigFile(dir, productionConfig);
        const loadedConfig = await readJSONFile<Partial<ZTMChatConfig>>(configPath);
        const resolved = resolveZTMChatConfig(loadedConfig);

        expect(resolved.agentUrl).toBe(productionConfig.agentUrl);
        expect(resolved.permitUrl).toBe(productionConfig.permitUrl);
        expect(resolved.meshName).toBe(productionConfig.meshName);
        expect(resolved.username).toBe(productionConfig.username);
        expect(resolved.dmPolicy).toBe(productionConfig.dmPolicy);
      });
    });

    it('should handle minimal viable config', async () => {
      await withTempDir(async dir => {
        const minimalConfig = {
          username: 'minimal-bot',
        };

        const configPath = await createTestConfigFile(dir, minimalConfig);
        const loadedConfig = await readJSONFile<Partial<ZTMChatConfig>>(configPath);
        const resolved = resolveZTMChatConfig(loadedConfig);

        expect(resolved.username).toBe('minimal-bot');
        // All other fields should have defaults
        expect(resolved.agentUrl).toBeDefined();
        expect(resolved.meshName).toBeDefined();
        expect(resolved.dmPolicy).toBeDefined();
      });
    });

    it('should handle config with all policy combinations', async () => {
      await withTempDir(async dir => {
        const policies: Array<'allow' | 'deny' | 'pairing'> = ['allow', 'deny', 'pairing'];

        for (const policy of policies) {
          const configPath = await createTestConfigFile(
            dir,
            {
              username: `policy-${policy}-bot`,
              dmPolicy: policy,
            },
            `config-${policy}.json`
          );

          const loadedConfig = await readJSONFile<Partial<ZTMChatConfig>>(configPath);
          const resolved = resolveZTMChatConfig(loadedConfig);

          expect(resolved.dmPolicy).toBe(policy);
        }
      });
    });
  });

  describe('Config Validation with Real Files', () => {
    it('should validate and clamp apiTimeout from file', async () => {
      await withTempDir(async dir => {
        const testCases = [
          { input: 100, expected: 30000 }, // Below min -> default
          { input: 500000, expected: 300000 }, // Above max -> clamped
          { input: 60000, expected: 60000 }, // Valid -> unchanged
        ];

        for (const testCase of testCases) {
          const configPath = await createTestConfigFile(
            dir,
            {
              apiTimeout: testCase.input,
            },
            `timeout-${testCase.input}.json`
          );

          const loadedConfig = await readJSONFile<Partial<ZTMChatConfig>>(configPath);
          const resolved = resolveZTMChatConfig(loadedConfig);

          expect(resolved.apiTimeout).toBe(testCase.expected);
        }
      });
    });

    it('should validate dmPolicy values from file', async () => {
      await withTempDir(async dir => {
        const testCases = [
          { input: 'allow' as const, expected: 'allow' },
          { input: 'deny' as const, expected: 'deny' },
          { input: 'pairing' as const, expected: 'pairing' },
          { input: 'invalid' as string, expected: 'pairing' }, // Invalid -> default
        ];

        for (const testCase of testCases) {
          const configPath = await createTestConfigFile(
            dir,
            {
              dmPolicy: testCase.input,
            },
            `policy-${testCase.input}.json`
          );

          const loadedConfig = await readJSONFile<Partial<ZTMChatConfig>>(configPath);
          const resolved = resolveZTMChatConfig(loadedConfig);

          expect(resolved.dmPolicy).toBe(testCase.expected);
        }
      });
    });

    it('should validate permitSource values from file', async () => {
      await withTempDir(async dir => {
        const testCases = [
          { input: 'server' as const, expected: 'server' },
          { input: 'file' as const, expected: 'file' },
          { input: 'invalid' as string, expected: 'server' }, // Invalid -> default
        ];

        for (const testCase of testCases) {
          const configPath = await createTestConfigFile(
            dir,
            {
              permitSource: testCase.input,
            },
            `source-${testCase.input}.json`
          );

          const loadedConfig = await readJSONFile<Partial<ZTMChatConfig>>(configPath);
          const resolved = resolveZTMChatConfig(loadedConfig);

          expect(resolved.permitSource).toBe(testCase.expected);
        }
      });
    });
  });

  describe('Concurrent Config Operations', () => {
    it('should handle concurrent reads of same config file', async () => {
      await withTempDir(async dir => {
        const configPath = await createTestConfigFile(dir, {
          username: 'concurrent-bot',
        });

        // Read same file multiple times concurrently
        const promises = Array.from({ length: 10 }, () =>
          readJSONFile<Partial<ZTMChatConfig>>(configPath)
        );

        const results = await Promise.all(promises);

        // All should have the same content
        results.forEach((result: Partial<ZTMChatConfig>) => {
          expect(result.username).toBe('concurrent-bot');
        });
      });
    });

    it('should handle concurrent writes to different config files', async () => {
      await withTempDir(async dir => {
        const configs = Array.from({ length: 5 }, (_, i) => ({
          username: `concurrent-${i}-bot`,
        }));

        // Write to different files concurrently
        const writePromises = configs.map((config, i) =>
          createTestConfigFile(dir, config, `concurrent-${i}.json`)
        );

        const paths = await Promise.all(writePromises);

        // Verify all files were written correctly
        const readPromises = paths.map(path => readJSONFile<Partial<ZTMChatConfig>>(path));

        const results = await Promise.all(readPromises);

        results.forEach((result: Partial<ZTMChatConfig>, i: number) => {
          expect(result.username).toBe(`concurrent-${i}-bot`);
        });
      });
    });
  });
});
