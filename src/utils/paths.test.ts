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
      expect(resolveZTMStateDir()).toBe('/custom/ztm/dir');
    });

    it('should use directory of ZTM_STATE_PATH when set to a file', () => {
      process.env.ZTM_STATE_PATH = '/custom/ztm/state.json';
      expect(resolveZTMStateDir()).toBe('/custom/ztm');
    });

    it('should use OPENCLAW_STATE_DIR/ztm when set', () => {
      process.env.OPENCLAW_STATE_DIR = '/custom/state';
      expect(resolveZTMStateDir()).toBe('/custom/state/ztm');
    });

    it('should use default ~/.openclaw/ztm', () => {
      process.env.HOME = '/home/testuser';
      expect(resolveZTMStateDir()).toBe('/home/testuser/.openclaw/ztm');
    });
  });

  describe('resolveStatePath', () => {
    it('should use ZTM_STATE_PATH when set to a file', () => {
      process.env.ZTM_STATE_PATH = '/custom/ztm/state.json';
      expect(resolveStatePath()).toBe('/custom/ztm/state.json');
    });

    it('should use ZTM_STATE_PATH as directory and append state.json', () => {
      process.env.ZTM_STATE_PATH = '/custom/ztm/dir';
      expect(resolveStatePath()).toBe('/custom/ztm/dir/state.json');
    });

    it('should use default path', () => {
      process.env.HOME = '/home/testuser';
      expect(resolveStatePath()).toBe('/home/testuser/.openclaw/ztm/state.json');
    });
  });

  describe('resolvePermitPath', () => {
    it('should return permit.json in ZTM state directory', () => {
      process.env.HOME = '/home/testuser';
      expect(resolvePermitPath()).toBe('/home/testuser/.openclaw/ztm/permit.json');
    });

    it('should respect ZTM_STATE_PATH', () => {
      process.env.ZTM_STATE_PATH = '/custom/ztm';
      expect(resolvePermitPath()).toBe('/custom/ztm/permit.json');
    });
  });

  describe('resolveZTMStateDirWithOverrides (testing utilities)', () => {
    it('should accept ZTM_STATE_PATH override', () => {
      const result = resolveZTMStateDirWithOverrides({
        ZTM_STATE_PATH: '/test/ztm',
      });
      expect(result).toBe('/test/ztm');
    });

    it('should accept OPENCLAW_STATE_DIR override', () => {
      const result = resolveZTMStateDirWithOverrides({
        OPENCLAW_STATE_DIR: '/test/openclaw',
      });
      expect(result).toBe('/test/openclaw/ztm');
    });

    it('should accept OPENCLAW_HOME override', () => {
      const result = resolveZTMStateDirWithOverrides({
        OPENCLAW_HOME: '/test/home',
      });
      expect(result).toBe('/test/home/.openclaw/ztm');
    });

    it('should accept HOME override', () => {
      const result = resolveZTMStateDirWithOverrides({
        HOME: '/test/home',
      });
      expect(result).toBe('/test/home/.openclaw/ztm');
    });

    it('should accept homedir function override', () => {
      const result = resolveZTMStateDirWithOverrides({
        homedir: () => '/custom/homedir',
      });
      expect(result).toBe('/custom/homedir/.openclaw/ztm');
    });

    it('should handle Windows paths with USERPROFILE override', () => {
      const result = resolveZTMStateDirWithOverrides({
        USERPROFILE: 'C:\\Users\\testuser',
      });
      // path.join normalizes paths, so separators may be mixed on non-Windows
      expect(result).toMatch(/C:\\Users\\testuser[\/\\]\.openclaw[\/\\]ztm/);
    });

    it('should prioritize overrides in correct order', () => {
      const result = resolveZTMStateDirWithOverrides({
        ZTM_STATE_PATH: '/explicit/ztm',
        OPENCLAW_STATE_DIR: '/openclaw/state',
        OPENCLAW_HOME: '/openclaw/home',
        HOME: '/home/user',
      });
      // ZTM_STATE_PATH has highest priority
      expect(result).toBe('/explicit/ztm');
    });
  });

  describe('resolveStatePathWithOverrides (testing utilities)', () => {
    it('should accept ZTM_STATE_PATH override as file', () => {
      const result = resolveStatePathWithOverrides({
        ZTM_STATE_PATH: '/test/state.json',
      });
      expect(result).toBe('/test/state.json');
    });

    it('should accept ZTM_STATE_PATH override as directory', () => {
      const result = resolveStatePathWithOverrides({
        ZTM_STATE_PATH: '/test/dir',
      });
      expect(result).toBe('/test/dir/state.json');
    });

    it('should use default when no overrides', () => {
      const result = resolveStatePathWithOverrides({
        HOME: '/home/testuser',
      });
      expect(result).toBe('/home/testuser/.openclaw/ztm/state.json');
    });
  });

  describe('resolvePermitPathWithOverrides (testing utilities)', () => {
    it('should resolve permit path in ZTM state directory', () => {
      const result = resolvePermitPathWithOverrides({
        HOME: '/home/testuser',
      });
      expect(result).toBe('/home/testuser/.openclaw/ztm/permit.json');
    });

    it('should respect ZTM_STATE_PATH override', () => {
      const result = resolvePermitPathWithOverrides({
        ZTM_STATE_PATH: '/custom/ztm',
      });
      expect(result).toBe('/custom/ztm/permit.json');
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
      const result = resolveZTMStateDirWithOverrides({
        OPENCLAW_HOME: 'C:\\Users\\testuser',
      });
      // Should resolve to absolute path
      expect(result).toContain('.openclaw');
      expect(result).toContain('ztm');
    });

    it('should handle paths with spaces', () => {
      const result = resolveZTMStateDirWithOverrides({
        HOME: '/home/user with spaces',
      });
      expect(result).toBe('/home/user with spaces/.openclaw/ztm');
    });

    it('should handle paths with special characters', () => {
      const result = resolveZTMStateDirWithOverrides({
        HOME: '/home/user-name_123',
      });
      expect(result).toBe('/home/user-name_123/.openclaw/ztm');
    });
  });
});
