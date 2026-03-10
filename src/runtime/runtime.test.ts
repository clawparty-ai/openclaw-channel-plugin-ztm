// Unit tests for Runtime

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  setZTMRuntime,
  getZTMRuntime,
  isZTMRuntimeInitialized,
  clearZTMRuntime,
} from './runtime.js';
import type { PluginRuntime } from 'openclaw/plugin-sdk';

// Mock logger - must be hoisted
vi.mock('../utils/logger.js', () => ({
  setRuntimeLogger: vi.fn(() => undefined),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Runtime Management', () => {
  beforeEach(() => {
    clearZTMRuntime();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearZTMRuntime();
  });

  describe('getZTMRuntime', () => {
    it('should throw error when runtime not initialized', () => {
      expect(() => getZTMRuntime()).toThrow('ZTM runtime not initialized');
    });

    it('should return runtime after initialization', () => {
      const mockRuntime = {
        channel: { routing: { resolveAgentRoute: vi.fn() } },
      } as unknown as PluginRuntime;

      setZTMRuntime(mockRuntime);

      expect(getZTMRuntime()).toBeDefined();
      expect(getZTMRuntime()).toBe(mockRuntime);
    });

    it('should return same instance on multiple calls', () => {
      const mockRuntime = {
        channel: { routing: { resolveAgentRoute: vi.fn() } },
      } as unknown as PluginRuntime;

      setZTMRuntime(mockRuntime);

      const rt1 = getZTMRuntime();
      const rt2 = getZTMRuntime();

      expect(rt1).toBe(rt2);
    });
  });

  describe('setZTMRuntime', () => {
    it('should set runtime instance', () => {
      const mockRuntime = {
        channel: { routing: { resolveAgentRoute: vi.fn() } },
      } as unknown as PluginRuntime;

      setZTMRuntime(mockRuntime);

      expect(getZTMRuntime()).toBe(mockRuntime);
    });

    it('should replace existing runtime', () => {
      const mockRuntime1 = {
        id: 1,
        channel: { routing: { resolveAgentRoute: vi.fn() } },
      } as unknown as PluginRuntime;

      const mockRuntime2 = {
        id: 2,
        channel: { routing: { resolveAgentRoute: vi.fn() } },
      } as unknown as PluginRuntime;

      setZTMRuntime(mockRuntime1);
      setZTMRuntime(mockRuntime2);

      expect(getZTMRuntime()).toBe(mockRuntime2);
    });

    it('should call setRuntimeLogger when runtime has log property', () => {
      const mockRuntime = {
        channel: { routing: { resolveAgentRoute: vi.fn() } },
        log: {
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
      } as unknown as PluginRuntime;

      expect(() => setZTMRuntime(mockRuntime)).not.toThrow();
      expect(getZTMRuntime()).toBe(mockRuntime);
    });

    it('should handle runtime without logger', () => {
      const mockRuntime = {
        channel: { routing: { resolveAgentRoute: vi.fn() } },
      } as unknown as PluginRuntime;

      expect(() => setZTMRuntime(mockRuntime)).not.toThrow();
    });
  });

  describe('isZTMRuntimeInitialized', () => {
    it('should return false when runtime not set', () => {
      expect(isZTMRuntimeInitialized()).toBe(false);
    });

    it('should return true after runtime is set', () => {
      const mockRuntime = {
        channel: { routing: { resolveAgentRoute: vi.fn() } },
      } as unknown as PluginRuntime;

      setZTMRuntime(mockRuntime);

      expect(isZTMRuntimeInitialized()).toBe(true);
    });

    it('should return false after clearZTMRuntime', () => {
      const mockRuntime = {
        channel: { routing: { resolveAgentRoute: vi.fn() } },
      } as unknown as PluginRuntime;

      setZTMRuntime(mockRuntime);
      clearZTMRuntime();

      expect(isZTMRuntimeInitialized()).toBe(false);
    });
  });
});
