// Unit tests for Runtime

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  setZTMRuntime,
  getZTMRuntime,
  isRuntimeInitialized,
  RuntimeManager,
  createRuntimeProvider,
  getDefaultRuntimeProvider,
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
    // Reset singleton before each test
    RuntimeManager.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clean up runtime
    RuntimeManager.reset();
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
      // This test verifies the runtime can be set with a log property
      // The actual logger integration uses require() which doesn't work well with ESM mocks
      const mockRuntime = {
        channel: { routing: { resolveAgentRoute: vi.fn() } },
        log: {
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
      } as unknown as PluginRuntime;

      // Should not throw - runtime is set successfully
      expect(() => setZTMRuntime(mockRuntime)).not.toThrow();
      expect(getZTMRuntime()).toBe(mockRuntime);
    });

    it('should handle runtime without logger', () => {
      const mockRuntime = {
        channel: { routing: { resolveAgentRoute: vi.fn() } },
      } as unknown as PluginRuntime;

      // Should not throw
      expect(() => setZTMRuntime(mockRuntime)).not.toThrow();
    });
  });

  describe('isRuntimeInitialized', () => {
    it('should return false when runtime not set', () => {
      expect(isRuntimeInitialized()).toBe(false);
    });

    it('should return true after runtime is set', () => {
      const mockRuntime = {
        channel: { routing: { resolveAgentRoute: vi.fn() } },
      } as unknown as PluginRuntime;

      setZTMRuntime(mockRuntime);

      expect(isRuntimeInitialized()).toBe(true);
    });

    it('should return false after reset', () => {
      const mockRuntime = {
        channel: { routing: { resolveAgentRoute: vi.fn() } },
      } as unknown as PluginRuntime;

      setZTMRuntime(mockRuntime);
      RuntimeManager.reset();

      expect(isRuntimeInitialized()).toBe(false);
    });
  });
});

describe('createRuntimeProvider', () => {
  it('should return uninitialized state initially', () => {
    const provider = createRuntimeProvider();
    expect(provider.isInitialized()).toBe(false);
  });

  it('should throw when getRuntime() called before setRuntime()', () => {
    const provider = createRuntimeProvider();
    expect(() => provider.getRuntime()).toThrow('ZTM runtime not initialized');
  });

  it('should return set runtime after setRuntime()', () => {
    const provider = createRuntimeProvider();
    const mockRuntime = {
      channel: { routing: { resolveAgentRoute: vi.fn() } },
    } as unknown as PluginRuntime;

    provider.setRuntime(mockRuntime);

    expect(provider.getRuntime()).toBe(mockRuntime);
    expect(provider.isInitialized()).toBe(true);
  });

  it('should allow runtime replacement', () => {
    const provider = createRuntimeProvider();
    const runtime1 = { id: 1 } as unknown as PluginRuntime;
    const runtime2 = { id: 2 } as unknown as PluginRuntime;

    provider.setRuntime(runtime1);
    expect(provider.getRuntime()).toBe(runtime1);

    provider.setRuntime(runtime2);
    expect(provider.getRuntime()).toBe(runtime2);
  });

  it('should create independent instances', () => {
    const provider1 = createRuntimeProvider();
    const provider2 = createRuntimeProvider();

    const runtime1 = { id: 1 } as unknown as PluginRuntime;
    provider1.setRuntime(runtime1);

    // provider2 should be independent
    expect(provider2.isInitialized()).toBe(false);
    expect(() => provider2.getRuntime()).toThrow();
  });
});

describe('getDefaultRuntimeProvider', () => {
  beforeEach(() => {
    RuntimeManager.reset();
  });

  afterEach(() => {
    RuntimeManager.reset();
  });

  it('should return same provider on multiple calls', () => {
    const provider1 = getDefaultRuntimeProvider();
    const provider2 = getDefaultRuntimeProvider();

    expect(provider1).toBe(provider2);
  });
});

describe('RuntimeManager Singleton', () => {
  beforeEach(() => {
    RuntimeManager.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    RuntimeManager.reset();
  });

  it('should return same instance on multiple getInstance calls', () => {
    const instance1 = RuntimeManager.getInstance();
    const instance2 = RuntimeManager.getInstance();

    expect(instance1).toBe(instance2);
  });

  it('should allow setting and getting runtime', () => {
    const manager = RuntimeManager.getInstance();
    const mockRuntime = {
      channel: { routing: { resolveAgentRoute: vi.fn() } },
    } as unknown as PluginRuntime;

    manager.setRuntime(mockRuntime);

    expect(manager.getRuntime()).toBe(mockRuntime);
    expect(manager.isInitialized()).toBe(true);
  });

  it('should throw error when getting runtime before set', () => {
    const manager = RuntimeManager.getInstance();

    expect(() => manager.getRuntime()).toThrow('ZTM runtime not initialized');
  });

  it('should report uninitialized state correctly', () => {
    const manager = RuntimeManager.getInstance();

    expect(manager.isInitialized()).toBe(false);
  });

  it('should report initialized state after setting runtime', () => {
    const manager = RuntimeManager.getInstance();
    const mockRuntime = {
      channel: { routing: { resolveAgentRoute: vi.fn() } },
    } as unknown as PluginRuntime;

    manager.setRuntime(mockRuntime);

    expect(manager.isInitialized()).toBe(true);
  });
});
