/**
 * Tests for path resolution utilities
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolveOpenclawHome,
  resolveOpenclawStateDir,
  resolveZTMStateDir,
  resolveStatePath,
  resolvePermitPath,
  resolveZTMStateDirWithOverrides,
  resolveStatePathWithOverrides,
  resolvePermitPathWithOverrides,
  STATE_DIR_ENV_VARS,
  ZTM_SUBDIR,
} from './paths.js';

describe('Path Resolution Utilities', () => {
  // Test account ID
  const testAccountId = 'test-account';

  // Save original environment
  const originalEnv = { ...process.env };
  const originalHomedir = require('os').homedir;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
    delete process.env.OPENCLAW_HOME;
    delete process.env.OPENCLAW_STATE_DIR;
    delete process.env.ZTM_STATE_PATH;
    delete process.env.HOME;
    delete process.env.USERPROFILE;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('resolveOpenclawHome', () => {
    it('should use OPENCLAW_HOME when set', () => {
      process.env.OPENCLAW_HOME = '/custom/openclaw';
      expect(resolveOpenclawHome()).toBe('/custom/openclaw');
    });

    it('should use HOME when OPENCLAW_HOME is not set', () => {
      process.env.HOME = '/home/testuser';
      expect(resolveOpenclawHome()).toBe('/home/testuser');
    });

    it('should use USERPROFILE on Windows fallback', () => {
      process.env.USERPROFILE = 'C:\\Users\\testuser';
      expect(resolveOpenclawHome()).toBe('C:\\Users\\testuser');
    });

    it('should prefer HOME over USERPROFILE', () => {
      process.env.HOME = '/home/testuser';
      process.env.USERPROFILE = 'C:\\Users\\testuser';
      expect(resolveOpenclawHome()).toBe('/home/testuser');
    });

    it('should use os.homedir as last resort', () => {
      // Both HOME and USERPROFILE are not set
      expect(resolveOpenclawHome()).toBe(originalHomedir());
    });

    it('should resolve relative paths to absolute', () => {
      process.env.OPENCLAW_HOME = './relative/path';
      expect(resolveOpenclawHome()).toBe(process.cwd() + '/relative/path');
    });
  });

  describe('resolveOpenclawStateDir', () => {
    it('should use OPENCLAW_STATE_DIR when set', () => {
      process.env.OPENCLAW_STATE_DIR = '/custom/state';
      expect(resolveOpenclawStateDir()).toBe('/custom/state');
    });

    it('should use OPENCLAW_HOME/.openclaw when OPENCLAW_STATE_DIR not set', () => {
      process.env.OPENCLAW_HOME = '/home/testuser';
      expect(resolveOpenclawStateDir()).toBe('/home/testuser/.openclaw');
    });

    it('should fall back to HOME/.openclaw', () => {
      process.env.HOME = '/home/testuser';
      expect(resolveOpenclawStateDir()).toBe('/home/testuser/.openclaw');
    });

    it('should use USERPROFILE/.openclaw on Windows', () => {
      process.env.USERPROFILE = 'C:\\Users\\testuser';
      // path.join normalizes paths, so separators may be mixed on non-Windows
      expect(resolveOpenclawStateDir()).toMatch(/C:\\Users\\testuser[\/\\]\.openclaw/);
    });
  });

  describe('resolveZTMStateDir', () => {
    it('should use ZTM_STATE_PATH when set to a directory', () => {
      process.env.ZTM_STATE_PATH = '/custom/ztm/dir';
      expect(resolveZTMStateDir(testAccountId)).toBe('/custom/ztm/dir/test-account');
    });

    it('should use directory of ZTM_STATE_PATH when set to a file', () => {
      process.env.ZTM_STATE_PATH = '/custom/ztm/state.json';
      expect(resolveZTMStateDir(testAccountId)).toBe('/custom/ztm/test-account');
    });

    it('should use OPENCLAW_STATE_DIR/ztm/accountId when set', () => {
      process.env.OPENCLAW_STATE_DIR = '/custom/state';
      expect(resolveZTMStateDir(testAccountId)).toBe('/custom/state/ztm/test-account');
    });

    it('should use default ~/.openclaw/ztm/accountId', () => {
      process.env.HOME = '/home/testuser';
      expect(resolveZTMStateDir(testAccountId)).toBe('/home/testuser/.openclaw/ztm/test-account');
    });
  });

  describe('resolveStatePath', () => {
    it('should use ZTM_STATE_PATH as directory and append accountId/state.json', () => {
      process.env.ZTM_STATE_PATH = '/custom/ztm/dir';
      expect(resolveStatePath(testAccountId)).toBe('/custom/ztm/dir/test-account/state.json');
    });

    it('should use default path ~/.openclaw/ztm/accountId/state.json', () => {
      process.env.HOME = '/home/testuser';
      expect(resolveStatePath(testAccountId)).toBe(
        '/home/testuser/.openclaw/ztm/test-account/state.json'
      );
    });
  });

  describe('resolvePermitPath', () => {
    it('should return permit.json in account-specific directory', () => {
      process.env.HOME = '/home/testuser';
      expect(resolvePermitPath(testAccountId)).toBe(
        '/home/testuser/.openclaw/ztm/test-account/permit.json'
      );
    });

    it('should respect ZTM_STATE_PATH', () => {
      process.env.ZTM_STATE_PATH = '/custom/ztm';
      expect(resolvePermitPath(testAccountId)).toBe('/custom/ztm/test-account/permit.json');
    });
  });

  describe('resolveZTMStateDirWithOverrides (testing utilities)', () => {
    it('should accept ZTM_STATE_PATH override', () => {
      const result = resolveZTMStateDirWithOverrides(testAccountId, {
        ZTM_STATE_PATH: '/test/ztm',
      });
      expect(result).toBe('/test/ztm/test-account');
    });

    it('should accept OPENCLAW_STATE_DIR override', () => {
      const result = resolveZTMStateDirWithOverrides(testAccountId, {
        OPENCLAW_STATE_DIR: '/test/openclaw',
      });
      expect(result).toBe('/test/openclaw/ztm/test-account');
    });

    it('should accept OPENCLAW_HOME override', () => {
      const result = resolveZTMStateDirWithOverrides(testAccountId, {
        OPENCLAW_HOME: '/test/home',
      });
      expect(result).toBe('/test/home/.openclaw/ztm/test-account');
    });

    it('should accept HOME override', () => {
      const result = resolveZTMStateDirWithOverrides(testAccountId, {
        HOME: '/test/home',
      });
      expect(result).toBe('/test/home/.openclaw/ztm/test-account');
    });

    it('should accept homedir function override', () => {
      const result = resolveZTMStateDirWithOverrides(testAccountId, {
        homedir: () => '/custom/homedir',
      });
      expect(result).toBe('/custom/homedir/.openclaw/ztm/test-account');
    });

    it('should handle Windows paths with USERPROFILE override', () => {
      const result = resolveZTMStateDirWithOverrides(testAccountId, {
        USERPROFILE: 'C:\\Users\\testuser',
      });
      // path.join normalizes paths, so separators may be mixed on non-Windows
      expect(result).toMatch(/C:\\Users\\testuser[\/\\]\.openclaw[\/\\]ztm[\/\\]test-account/);
    });

    it('should prioritize overrides in correct order', () => {
      const result = resolveZTMStateDirWithOverrides(testAccountId, {
        ZTM_STATE_PATH: '/explicit/ztm',
        OPENCLAW_STATE_DIR: '/openclaw/state',
        OPENCLAW_HOME: '/openclaw/home',
        HOME: '/home/user',
      });
      // ZTM_STATE_PATH has highest priority
      expect(result).toBe('/explicit/ztm/test-account');
    });
  });

  describe('resolveStatePathWithOverrides (testing utilities)', () => {
    it('should accept ZTM_STATE_PATH override as directory', () => {
      const result = resolveStatePathWithOverrides(testAccountId, {
        ZTM_STATE_PATH: '/test/dir',
      });
      expect(result).toBe('/test/dir/test-account/state.json');
    });

    it('should use default when no overrides', () => {
      const result = resolveStatePathWithOverrides(testAccountId, {
        HOME: '/home/testuser',
      });
      expect(result).toBe('/home/testuser/.openclaw/ztm/test-account/state.json');
    });
  });

  describe('resolvePermitPathWithOverrides (testing utilities)', () => {
    it('should resolve permit path in account-specific directory', () => {
      const result = resolvePermitPathWithOverrides(testAccountId, {
        HOME: '/home/testuser',
      });
      expect(result).toBe('/home/testuser/.openclaw/ztm/test-account/permit.json');
    });

    it('should respect ZTM_STATE_PATH override', () => {
      const result = resolvePermitPathWithOverrides(testAccountId, {
        ZTM_STATE_PATH: '/custom/ztm',
      });
      expect(result).toBe('/custom/ztm/test-account/permit.json');
    });
  });

  describe('resolvePermitPathWithOverrides - security', () => {
    it('should reject path traversal with ../ sequences', () => {
      expect(() =>
        resolvePermitPathWithOverrides(testAccountId, {
          ZTM_STATE_PATH: '/allowed/../../../etc/passwd',
        })
      ).toThrow('path traversal detected');
    });

    it('should reject path traversal with ..\\ sequences', () => {
      expect(() =>
        resolvePermitPathWithOverrides(testAccountId, {
          ZTM_STATE_PATH: 'C:\\allowed\\..\\..\\windows\\system32',
        })
      ).toThrow('path traversal detected');
    });

    it('should reject URL-encoded path traversal %2e%2e', () => {
      expect(() =>
        resolvePermitPathWithOverrides(testAccountId, {
          ZTM_STATE_PATH: '/allowed/%2e%2e/%2e%2e/etc/passwd',
        })
      ).toThrow('path traversal detected');
    });

    it('should reject mixed encoding path traversal', () => {
      expect(() =>
        resolvePermitPathWithOverrides(testAccountId, {
          ZTM_STATE_PATH: '/allowed/..%2f..%2fetc/passwd',
        })
      ).toThrow('path traversal detected');
    });

    it('should reject null bytes in path', () => {
      expect(() =>
        resolvePermitPathWithOverrides(testAccountId, {
          ZTM_STATE_PATH: '/allowed/../../../etc/passwd\x00',
        })
      ).toThrow('path traversal detected');
    });
  });

  describe('Constants', () => {
    it('should have correct ZTM_SUBDIR', () => {
      expect(ZTM_SUBDIR).toBe('ztm');
    });

    it('should have correct env var names', () => {
      expect(STATE_DIR_ENV_VARS.EXPLICIT).toBe('ZTM_STATE_PATH');
      expect(STATE_DIR_ENV_VARS.OPENCLAW_STATE).toBe('OPENCLAW_STATE_DIR');
      expect(STATE_DIR_ENV_VARS.OPENCLAW_HOME).toBe('OPENCLAW_HOME');
    });
  });

  describe('Cross-platform path handling', () => {
    it('should handle Windows-style paths', () => {
      const result = resolveZTMStateDirWithOverrides(testAccountId, {
        OPENCLAW_HOME: 'C:\\Users\\testuser',
      });
      // Should resolve to absolute path
      expect(result).toContain('.openclaw');
      expect(result).toContain('ztm');
      expect(result).toContain('test-account');
    });

    it('should handle paths with spaces', () => {
      const result = resolveZTMStateDirWithOverrides(testAccountId, {
        HOME: '/home/user with spaces',
      });
      expect(result).toBe('/home/user with spaces/.openclaw/ztm/test-account');
    });

    it('should handle paths with special characters', () => {
      const result = resolveZTMStateDirWithOverrides(testAccountId, {
        HOME: '/home/user-name_123',
      });
      expect(result).toBe('/home/user-name_123/.openclaw/ztm/test-account');
    });
  });

  describe('Multi-account isolation', () => {
    const account1 = 'account-1';
    const account2 = 'account-2';
    const account3 = 'my-bot';

    beforeEach(() => {
      process.env.HOME = '/home/testuser';
    });

    it('should isolate state files for different accounts', () => {
      const path1 = resolveStatePath(account1);
      const path2 = resolveStatePath(account2);
      const path3 = resolveStatePath(account3);

      expect(path1).toBe('/home/testuser/.openclaw/ztm/account-1/state.json');
      expect(path2).toBe('/home/testuser/.openclaw/ztm/account-2/state.json');
      expect(path3).toBe('/home/testuser/.openclaw/ztm/my-bot/state.json');
    });

    it('should isolate permit files for different accounts', () => {
      const path1 = resolvePermitPath(account1);
      const path2 = resolvePermitPath(account2);
      const path3 = resolvePermitPath(account3);

      expect(path1).toBe('/home/testuser/.openclaw/ztm/account-1/permit.json');
      expect(path2).toBe('/home/testuser/.openclaw/ztm/account-2/permit.json');
      expect(path3).toBe('/home/testuser/.openclaw/ztm/my-bot/permit.json');
    });

    it('should isolate state directories for different accounts', () => {
      const dir1 = resolveZTMStateDir(account1);
      const dir2 = resolveZTMStateDir(account2);
      const dir3 = resolveZTMStateDir(account3);

      expect(dir1).toBe('/home/testuser/.openclaw/ztm/account-1');
      expect(dir2).toBe('/home/testuser/.openclaw/ztm/account-2');
      expect(dir3).toBe('/home/testuser/.openclaw/ztm/my-bot');
    });

    it('should return different paths for state and permit of same account', () => {
      const statePath = resolveStatePath(account1);
      const permitPath = resolvePermitPath(account1);

      expect(statePath).toBe('/home/testuser/.openclaw/ztm/account-1/state.json');
      expect(permitPath).toBe('/home/testuser/.openclaw/ztm/account-1/permit.json');
    });

    it('should isolate accounts with WithOverrides', () => {
      const path1 = resolveStatePathWithOverrides(account1, { HOME: '/home/testuser' });
      const path2 = resolveStatePathWithOverrides(account2, { HOME: '/home/testuser' });

      expect(path1).toBe('/home/testuser/.openclaw/ztm/account-1/state.json');
      expect(path2).toBe('/home/testuser/.openclaw/ztm/account-2/state.json');
    });

    it('should handle account IDs with special characters', () => {
      const specialAccount = 'bot@production-01';
      const path = resolveStatePath(specialAccount);

      expect(path).toBe('/home/testuser/.openclaw/ztm/bot@production-01/state.json');
    });
  });
});
