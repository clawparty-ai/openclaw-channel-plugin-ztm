// Unit tests for directory operations

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testConfig, testAccountId } from '../test-utils/fixtures.js';

// Mock dependencies
vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../di/index.js', () => ({
  container: {
    get: vi.fn((dep: string) => {
      if (dep === 'ILogger') {
        return { warn: vi.fn(), debug: vi.fn() };
      }
      if (dep === 'IApiClientFactory') {
        return vi.fn().mockReturnValue({
          discoverUsers: vi.fn().mockResolvedValue({ ok: true, value: [] }),
        });
      }
      return {};
    }),
  },
  DEPENDENCIES: {
    LOGGER: 'ILogger',
    API_CLIENT_FACTORY: 'IApiClientFactory',
  },
}));

vi.mock('./config.js', () => ({
  resolveZTMChatAccount: vi.fn(),
}));

vi.mock('../utils/guards.js', () => ({
  getOrDefault: vi.fn((value: unknown, defaultValue: unknown) => value ?? defaultValue),
}));

import { directorySelf, directoryListPeers } from './directory.js';
import { resolveZTMChatAccount } from './config.js';
import type { ZTMChatConfig } from '../types/config.js';

describe('directory', () => {
  describe('directorySelf', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return directory user when config is valid', async () => {
      const mockConfig: ZTMChatConfig = {
        ...testConfig,
        username: 'botuser',
        agentUrl: 'http://localhost:3000',
        meshName: 'testmesh',
      };

      (resolveZTMChatAccount as ReturnType<typeof vi.fn>).mockReturnValue({
        username: 'botuser',
        config: mockConfig,
      });

      const result = await directorySelf({ accountId: testAccountId });

      expect(result).not.toBeNull();
      expect(result?.kind).toBe('user');
      expect(result?.id).toBe('botuser');
      expect(result?.name).toBe('botuser');
      expect(result?.raw).toEqual({
        username: 'botuser',
        meshName: 'testmesh',
      });
    });

    it('should return null when account has no config', async () => {
      (resolveZTMChatAccount as ReturnType<typeof vi.fn>).mockReturnValue({
        username: 'botuser',
        config: null,
      });

      const result = await directorySelf({ accountId: testAccountId });

      expect(result).toBeNull();
    });

    it('should return null when account config is invalid', async () => {
      (resolveZTMChatAccount as ReturnType<typeof vi.fn>).mockReturnValue({
        username: 'botuser',
        config: { invalid: 'config' },
      });

      const result = await directorySelf({ accountId: testAccountId });

      expect(result).toBeNull();
    });

    it('should handle missing username gracefully', async () => {
      (resolveZTMChatAccount as ReturnType<typeof vi.fn>).mockReturnValue({
        username: null,
        config: null,
      });

      const result = await directorySelf({ accountId: testAccountId });

      expect(result).toBeNull();
    });

    it('should use default account when no accountId provided', async () => {
      const mockConfig: ZTMChatConfig = {
        ...testConfig,
        username: 'botuser',
        agentUrl: 'http://localhost:3000',
      };

      (resolveZTMChatAccount as ReturnType<typeof vi.fn>).mockReturnValue({
        username: 'botuser',
        config: mockConfig,
      });

      const result = await directorySelf({});

      expect(result).not.toBeNull();
      expect(result?.id).toBe('botuser');
    });
  });

  describe('directoryListPeers', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return empty array when config is invalid', async () => {
      (resolveZTMChatAccount as ReturnType<typeof vi.fn>).mockReturnValue({
        username: 'botuser',
        config: null,
      });

      const result = await directoryListPeers({ accountId: testAccountId });

      expect(result).toEqual([]);
    });

    it('should return empty array when discoverUsers returns error', async () => {
      const mockConfig: ZTMChatConfig = {
        ...testConfig,
        username: 'botuser',
        agentUrl: 'http://localhost:3000',
      };

      (resolveZTMChatAccount as ReturnType<typeof vi.fn>).mockReturnValue({
        username: 'botuser',
        config: mockConfig,
      });

      const { container } = await import('../di/index.js');
      (container.get as ReturnType<typeof vi.fn>).mockImplementation((dep: string) => {
        if (dep === 'ILogger') {
          return { warn: vi.fn(), debug: vi.fn() };
        }
        if (dep === 'IApiClientFactory') {
          return vi.fn().mockReturnValue({
            discoverUsers: vi
              .fn()
              .mockResolvedValue({ ok: false, error: new Error('Network error') }),
          });
        }
        return {};
      });

      const result = await directoryListPeers({ accountId: testAccountId });

      expect(result).toEqual([]);
    });

    it('should return empty array when discoverUsers returns null', async () => {
      const mockConfig: ZTMChatConfig = {
        ...testConfig,
        username: 'botuser',
        agentUrl: 'http://localhost:3000',
      };

      (resolveZTMChatAccount as ReturnType<typeof vi.fn>).mockReturnValue({
        username: 'botuser',
        config: mockConfig,
      });

      const { container } = await import('../di/index.js');
      (container.get as ReturnType<typeof vi.fn>).mockImplementation((dep: string) => {
        if (dep === 'ILogger') {
          return { warn: vi.fn(), debug: vi.fn() };
        }
        if (dep === 'IApiClientFactory') {
          return vi.fn().mockReturnValue({
            discoverUsers: vi.fn().mockResolvedValue({ ok: true, value: null }),
          });
        }
        return {};
      });

      const result = await directoryListPeers({ accountId: testAccountId });

      expect(result).toEqual([]);
    });

    it('should return mapped users when discoverUsers succeeds', async () => {
      const mockConfig: ZTMChatConfig = {
        ...testConfig,
        username: 'botuser',
        agentUrl: 'http://localhost:3000',
      };

      const mockUsers = [
        { username: 'alice', meshName: 'mesh1' },
        { username: 'bob', meshName: 'mesh2' },
      ];

      (resolveZTMChatAccount as ReturnType<typeof vi.fn>).mockReturnValue({
        username: 'botuser',
        config: mockConfig,
      });

      const { container } = await import('../di/index.js');
      (container.get as ReturnType<typeof vi.fn>).mockImplementation((dep: string) => {
        if (dep === 'ILogger') {
          return { warn: vi.fn(), debug: vi.fn() };
        }
        if (dep === 'IApiClientFactory') {
          return vi.fn().mockReturnValue({
            discoverUsers: vi.fn().mockResolvedValue({ ok: true, value: mockUsers }),
          });
        }
        return {};
      });

      const result = await directoryListPeers({ accountId: testAccountId });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        kind: 'user',
        id: 'alice',
        name: 'alice',
        raw: mockUsers[0],
      });
      expect(result[1]).toEqual({
        kind: 'user',
        id: 'bob',
        name: 'bob',
        raw: mockUsers[1],
      });
    });

    it('should use getOrDefault for null users array', async () => {
      const mockConfig: ZTMChatConfig = {
        ...testConfig,
        username: 'botuser',
        agentUrl: 'http://localhost:3000',
      };

      (resolveZTMChatAccount as ReturnType<typeof vi.fn>).mockReturnValue({
        username: 'botuser',
        config: mockConfig,
      });

      const { container } = await import('../di/index.js');
      (container.get as ReturnType<typeof vi.fn>).mockImplementation((dep: string) => {
        if (dep === 'ILogger') {
          return { warn: vi.fn(), debug: vi.fn() };
        }
        if (dep === 'IApiClientFactory') {
          return vi.fn().mockReturnValue({
            discoverUsers: vi.fn().mockResolvedValue({ ok: true, value: null }),
          });
        }
        return {};
      });

      const result = await directoryListPeers({ accountId: testAccountId });

      expect(result).toEqual([]);
    });

    it('should use default account when no accountId provided', async () => {
      const mockConfig: ZTMChatConfig = {
        ...testConfig,
        username: 'botuser',
        agentUrl: 'http://localhost:3000',
      };

      (resolveZTMChatAccount as ReturnType<typeof vi.fn>).mockReturnValue({
        username: 'botuser',
        config: mockConfig,
      });

      const result = await directoryListPeers({});

      expect(result).toBeDefined();
    });
  });
});
