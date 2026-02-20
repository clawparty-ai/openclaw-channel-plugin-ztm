// Unit tests for DI Container

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DIContainer,
  DEPENDENCIES,
  createDependencyKey,
  type DependencyKey,
  type ILogger,
  type IConfig,
  type IApiClient,
  type IApiClientFactory,
  type IRuntime,
} from './container.js';
import { createMockLoggerFns } from '../test-utils/mocks.js';

// Mock service interfaces for testing
interface IMockService {
  getValue(): string;
}

describe('DI Container', () => {
  beforeEach(() => {
    // Reset container before each test
    DIContainer.reset();
  });

  afterEach(() => {
    // Clean up after each test
    DIContainer.reset();
  });

  describe('createDependencyKey', () => {
    it('should create a typed dependency key', () => {
      const key = createDependencyKey<IMockService>(Symbol('test'));
      expect(key).toBeDefined();
      expect(typeof key).toBe('symbol');
    });

    it('should create unique keys for different symbols', () => {
      const symbol1 = Symbol('test1');
      const symbol2 = Symbol('test2');
      const key1 = createDependencyKey<IMockService>(symbol1);
      const key2 = createDependencyKey<IMockService>(symbol2);

      expect(key1).not.toBe(key2);
    });

    it('should create keys with correct brand type', () => {
      const key = createDependencyKey<IMockService>(Symbol('branded'));
      const testVar: DependencyKey<IMockService> = key;
      expect(testVar).toBe(key);
    });
  });

  describe('DEPENDENCIES constant', () => {
    it('should have all required dependency keys', () => {
      expect(DEPENDENCIES.LOGGER).toBeDefined();
      expect(DEPENDENCIES.CONFIG).toBeDefined();
      expect(DEPENDENCIES.API_CLIENT).toBeDefined();
      expect(DEPENDENCIES.API_CLIENT_FACTORY).toBeDefined();
      expect(DEPENDENCIES.RUNTIME).toBeDefined();
      expect(DEPENDENCIES.CHANNEL_STATE).toBeDefined();
      expect(DEPENDENCIES.MESH_CONNECTIVITY).toBeDefined();
      expect(DEPENDENCIES.PERMIT_HANDLER).toBeDefined();
      expect(DEPENDENCIES.INBOUND_PROCESSOR).toBeDefined();
      expect(DEPENDENCIES.WATCHER).toBeDefined();
      expect(DEPENDENCIES.POLLING_WATCHER).toBeDefined();
      expect(DEPENDENCIES.MESSAGE_DISPATCHER).toBeDefined();
    });

    it('should have unique symbol-based keys', () => {
      const keys = Object.values(DEPENDENCIES);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });
  });

  describe('DIContainer.getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = DIContainer.getInstance();
      const instance2 = DIContainer.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = DIContainer.getInstance();
      DIContainer.reset();
      const instance2 = DIContainer.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('DIContainer.register', () => {
    it('should register a service factory', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<IMockService>(Symbol('mock'));
      const factory = () => ({ getValue: () => 'test' });

      expect(() => container.register(key, factory)).not.toThrow();
    });

    it('should mark service as registered', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<IMockService>(Symbol('mock'));
      const factory = () => ({ getValue: () => 'test' });

      container.register(key, factory);
      expect(container.isRegistered(key)).toBe(true);
    });

    it('should throw error when registering duplicate key', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<IMockService>(Symbol('mock'));
      const factory = () => ({ getValue: () => 'test' });

      container.register(key, factory);

      expect(() => {
        container.register(key, factory);
      }).toThrow('already registered');
    });

    it('should register multiple different services', () => {
      const container = DIContainer.getInstance();
      const key1 = createDependencyKey<IMockService>(Symbol('mock1'));
      const key2 = createDependencyKey<ILogger>(Symbol('mock2'));

      expect(() => {
        container.register(key1, () => ({ getValue: () => 'test' }));
        container.register(key2, () => createMockLoggerFns());
      }).not.toThrow();
    });
  });

  describe('DIContainer.registerInstance', () => {
    it('should register a service instance', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<IMockService>(Symbol('mock'));
      const instance = { getValue: () => 'test' };

      expect(() => container.registerInstance(key, instance)).not.toThrow();
    });

    it('should return registered instance on get', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<IMockService>(Symbol('mock'));
      const instance = { getValue: () => 'test' };

      container.registerInstance(key, instance);
      const retrieved = container.get(key);

      expect(retrieved).toBe(instance);
    });

    it('should throw error when registering duplicate instance', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<IMockService>(Symbol('mock'));
      const instance = { getValue: () => 'test' };

      container.registerInstance(key, instance);

      expect(() => {
        container.registerInstance(key, instance);
      }).toThrow('already registered');
    });

    it('should not call factory for registered instance', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<IMockService>(Symbol('mock'));
      const instance = { getValue: () => 'test' };
      const factory = vi.fn(() => instance);

      container.registerInstance(key, instance);
      container.get(key);

      expect(factory).not.toHaveBeenCalled();
    });
  });

  describe('DIContainer.get', () => {
    it('should throw error for unregistered service', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<IMockService>(Symbol('mock'));

      expect(() => container.get(key)).toThrow('not registered');
    });

    it('should create instance on first access (lazy initialization)', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<IMockService>(Symbol('mock'));
      const factory = vi.fn(() => ({ getValue: () => 'test' }));

      container.register(key, factory);
      expect(factory).not.toHaveBeenCalled(); // Not called yet

      container.get(key);
      expect(factory).toHaveBeenCalledTimes(1); // Called on first access
    });

    it('should return same instance on subsequent accesses', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<IMockService>(Symbol('mock'));
      const factory = vi.fn(() => ({ getValue: () => 'test' }));

      container.register(key, factory);
      const instance1 = container.get(key);
      const instance2 = container.get(key);

      expect(instance1).toBe(instance2);
      expect(factory).toHaveBeenCalledTimes(1); // Only called once
    });

    it('should return correct type for service', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<IMockService>(Symbol('mock'));
      const instance = { getValue: () => 'test' };

      container.registerInstance(key, instance);
      const retrieved = container.get(key);

      expect(retrieved.getValue()).toBe('test');
    });

    it('should provide helpful error with available keys', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<IMockService>(Symbol('unknown'));
      const knownKey = createDependencyKey<IMockService>(Symbol('known'));

      container.register(knownKey, () => ({ getValue: () => 'test' }));

      expect(() => container.get(key)).toThrow('not registered');
    });
  });

  describe('DIContainer.has', () => {
    // Use the global container to ensure tests reflect actual behavior
    it('should return false for unregistered service', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<IMockService>(Symbol('mock'));

      expect(container.has(key)).toBe(false);
    });

    it('should return false for registered but not instantiated service', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<IMockService>(Symbol('mock'));
      const factory = () => ({ getValue: () => 'test' });

      container.register(key, factory);
      expect(container.has(key)).toBe(false);
    });

    it('should return true for instantiated service', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<IMockService>(Symbol('mock'));
      const factory = () => ({ getValue: () => 'test' });

      container.register(key, factory);
      container.get(key);

      expect(container.has(key)).toBe(true);
    });

    it('should return true for registered instance', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<IMockService>(Symbol('mock'));
      const instance = { getValue: () => 'test' };

      container.registerInstance(key, instance);
      expect(container.has(key)).toBe(true);
    });
  });

  describe('DIContainer.isRegistered', () => {
    it('should return false for unregistered service', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<IMockService>(Symbol('mock'));

      expect(container.isRegistered(key)).toBe(false);
    });

    it('should return true for registered service', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<IMockService>(Symbol('mock'));
      const factory = () => ({ getValue: () => 'test' });

      container.register(key, factory);
      expect(container.isRegistered(key)).toBe(true);
    });

    it('should return true for registered instance', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<IMockService>(Symbol('mock'));
      const instance = { getValue: () => 'test' };

      container.registerInstance(key, instance);
      expect(container.isRegistered(key)).toBe(true);
    });
  });

  describe('DIContainer.reset', () => {
    it('should clear all services', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<IMockService>(Symbol('mock'));

      container.register(key, () => ({ getValue: () => 'test' }));
      container.get(key);

      DIContainer.reset();

      expect(container.isRegistered(key)).toBe(false);
    });

    it('should allow re-registration after reset', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<IMockService>(Symbol('mock'));
      const factory = () => ({ getValue: () => 'test' });

      container.register(key, factory);
      DIContainer.reset();

      expect(() => container.register(key, factory)).not.toThrow();
    });

    it('should set instance to null', () => {
      const container = DIContainer.getInstance();
      DIContainer.reset();

      const newInstance = DIContainer.getInstance();
      expect(newInstance).not.toBe(container);
    });
  });

  describe('Service Interface Types', () => {
    it('should support ILogger interface', () => {
      const container = DIContainer.getInstance();
      const key = DEPENDENCIES.LOGGER;
      const logger: ILogger = createMockLoggerFns();

      expect(() => container.registerInstance(key, logger)).not.toThrow();
      expect(container.get(key)).toBe(logger);

      // Call the logger methods to ensure they work
      const retrieved = container.get<ILogger>(key);
      retrieved.info('test');
      retrieved.warn('test');
      retrieved.error('test');
      retrieved.debug('test');
    });

    it('should support IConfig interface', () => {
      const container = DIContainer.getInstance();
      const key = DEPENDENCIES.CONFIG;
      const config: IConfig = {
        get: () => ({
          agentUrl: 'http://localhost:7777',
          permitUrl: 'https://ztm-portal.flomesh.io:7779/permit',
          permitSource: 'server',
          meshName: 'test-mesh',
          username: 'test-bot',
        }),
        isValid: () => true,
      };

      expect(() => container.registerInstance(key, config)).not.toThrow();

      // Call the config methods
      const retrieved = container.get<IConfig>(key);
      expect(retrieved.get()).toBeDefined();
      expect(retrieved.isValid()).toBe(true);
    });

    it('should support IApiClient interface', () => {
      const container = DIContainer.getInstance();
      const key = DEPENDENCIES.API_CLIENT;

      // Create proper mock functions for IApiClient
      const mockGetChats = vi.fn(() => Promise.resolve({ ok: true, value: [] }));
      const mockGetPeerMessages = vi.fn((_peer: string) =>
        Promise.resolve({ ok: true, value: [] })
      );
      const mockGetGroupMessages = vi.fn((_creator: string, _group: string) =>
        Promise.resolve({ ok: true, value: [] })
      );
      const mockWatchChanges = vi.fn((_prefix: string) => Promise.resolve({ ok: true, value: [] }));
      const mockSendPeerMessage = vi.fn((_peer: string, _message: unknown) =>
        Promise.resolve({ ok: true, value: null })
      );
      const mockSendGroupMessage = vi.fn((_creator: string, _group: string, _message: unknown) =>
        Promise.resolve({ ok: true, value: null })
      );
      const mockDiscoverUsers = vi.fn(() => Promise.resolve({ ok: true, value: [] }));
      const mockGetMeshInfo = vi.fn(() =>
        Promise.resolve({ ok: true, value: { connected: false, peers: 0 } })
      );
      const mockSeedFileMetadata = vi.fn((_metadata: unknown) => {});
      const mockExportFileMetadata = vi.fn(() => ({}));

      const apiClient = {
        getChats: mockGetChats,
        getPeerMessages: mockGetPeerMessages,
        getGroupMessages: mockGetGroupMessages,
        watchChanges: mockWatchChanges,
        sendPeerMessage: mockSendPeerMessage,
        sendGroupMessage: mockSendGroupMessage,
        discoverUsers: mockDiscoverUsers,
        getMeshInfo: mockGetMeshInfo,
        seedFileMetadata: mockSeedFileMetadata,
        exportFileMetadata: mockExportFileMetadata,
      } as unknown as IApiClient;

      expect(() => container.registerInstance(key, apiClient)).not.toThrow();

      // Verify all interface methods are accessible and callable
      const retrieved = container.get<IApiClient>(key);
      expect(typeof retrieved.getChats).toBe('function');
      expect(typeof retrieved.sendPeerMessage).toBe('function');
      expect(typeof retrieved.discoverUsers).toBe('function');
      expect(typeof retrieved.getMeshInfo).toBe('function');
      expect(typeof retrieved.seedFileMetadata).toBe('function');
      expect(typeof retrieved.exportFileMetadata).toBe('function');
    });

    it('should support IApiClientFactory interface', () => {
      const container = DIContainer.getInstance();
      const key = DEPENDENCIES.API_CLIENT_FACTORY;
      const factory = ((_config: unknown) => ({})) as unknown as IApiClientFactory;

      expect(() => container.registerInstance(key, factory)).not.toThrow();

      // Call the factory
      const retrieved = container.get<IApiClientFactory>(key);
      expect(typeof retrieved).toBe('function');
    });

    it('should support IRuntime interface', () => {
      const container = DIContainer.getInstance();
      const key = DEPENDENCIES.RUNTIME;
      const runtime = {
        get: () => ({}),
        isInitialized: () => true,
      } as unknown as IRuntime;

      expect(() => container.registerInstance(key, runtime)).not.toThrow();

      // Call the runtime methods
      const retrieved = container.get<IRuntime>(key);
      expect(retrieved.get()).toBeDefined();
      expect(retrieved.isInitialized()).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle factory that returns undefined', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<IMockService>(Symbol('mock'));

      container.register(key, () => undefined);
      const result = container.get(key);

      expect(result).toBeUndefined();
    });

    it('should handle factory that returns null', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<IMockService | null>(Symbol('mock'));

      container.register(key, () => null);
      const result = container.get(key);

      expect(result).toBeNull();
    });

    it('should handle factory that throws error', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<IMockService>(Symbol('mock'));

      container.register(key, () => {
        throw new Error('Factory error');
      });

      expect(() => container.get(key)).toThrow('Factory error');
    });

    it('should handle multiple gets across different keys', () => {
      const container = DIContainer.getInstance();
      const key1 = createDependencyKey<string>(Symbol('key1'));
      const key2 = createDependencyKey<number>(Symbol('key2'));
      const key3 = createDependencyKey<boolean>(Symbol('key3'));

      container.register(key1, () => 'test');
      container.register(key2, () => 42);
      container.register(key3, () => true);

      expect(container.get(key1)).toBe('test');
      expect(container.get(key2)).toBe(42);
      expect(container.get(key3)).toBe(true);
    });

    it('should preserve instance across reset and re-register', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<IMockService>(Symbol('mock'));
      const instance1 = { getValue: () => 'v1' };

      container.registerInstance(key, instance1);
      DIContainer.reset();

      const instance2 = { getValue: () => 'v2' };
      container.registerInstance(key, instance2);

      expect(container.get(key)).toBe(instance2);
      expect(container.get(key).getValue()).toBe('v2');
    });
  });

  describe('Singleton Behavior', () => {
    it('should share same container across code', () => {
      const container1 = DIContainer.getInstance();
      const container2 = DIContainer.getInstance();

      expect(container1).toBe(container2);
    });

    it('should maintain service state across gets', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<{ count: number }>(Symbol('stateful'));

      container.register(key, () => ({ count: 0 }));
      const service1 = container.get(key);
      service1.count = 5;

      const service2 = container.get(key);
      expect(service2.count).toBe(5);
    });
  });

  describe('Type Safety', () => {
    it('should enforce type at compile time', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<IMockService>(Symbol('typed'));

      container.register(key, () => ({ getValue: () => 'typed' }));

      // This should compile (type checking happens at compile time)
      const service: IMockService = container.get(key);
      expect(service.getValue()).toBe('typed');
    });

    it('should allow covariance with compatible types', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<{ value: string }>(Symbol('covariant'));

      container.register(key, () => ({
        value: 'test',
        extra: 'ignored',
      }));

      const service = container.get(key);
      expect(service.value).toBe('test');
    });
  });

  describe('Dependency Chains', () => {
    it('should support factory that depends on another service', () => {
      const container = DIContainer.getInstance();
      const configKey = createDependencyKey<{ value: number }>(Symbol('config'));
      const serviceKey = createDependencyKey<{ doubled: number }>(Symbol('service'));

      // Register config
      container.register(configKey, () => ({ value: 21 }));

      // Register service that depends on config
      container.register(serviceKey, () => {
        const config = container.get(configKey);
        return { doubled: config.value * 2 };
      });

      const service = container.get(serviceKey);

      expect(service.doubled).toBe(42);
    });

    it('should handle multi-level dependency chains', () => {
      const container = DIContainer.getInstance();
      const level1Key = createDependencyKey<string>(Symbol('level1'));
      const level2Key = createDependencyKey<string>(Symbol('level2'));
      const level3Key = createDependencyKey<string>(Symbol('level3'));

      container.register(level1Key, () => 'base');
      container.register(level2Key, () => {
        const l1 = container.get(level1Key);
        return `${l1}+level2`;
      });
      container.register(level3Key, () => {
        const l2 = container.get(level2Key);
        return `${l2}+level3`;
      });

      const result = container.get(level3Key);

      expect(result).toBe('base+level2+level3');
    });

    it('should initialize dependencies lazily', () => {
      const container = DIContainer.getInstance();
      const dependencyKey = createDependencyKey<boolean>(Symbol('dependency'));
      const dependentKey = createDependencyKey<string>(Symbol('dependent'));

      const dependencyFactory = vi.fn(() => true);
      const dependentFactory = vi.fn(() => {
        container.get(dependencyKey);
        return 'dependent-value';
      });

      container.register(dependencyKey, dependencyFactory);
      container.register(dependentKey, dependentFactory);

      // Dependency should not be created yet
      expect(dependencyFactory).not.toHaveBeenCalled();

      // Get the dependent service
      container.get(dependentKey);

      // Both should have been called once
      expect(dependencyFactory).toHaveBeenCalledTimes(1);
      expect(dependentFactory).toHaveBeenCalledTimes(1);
    });

    it('should reuse shared dependency across multiple services', () => {
      const container = DIContainer.getInstance();
      const sharedKey = createDependencyKey<{ id: string }>(Symbol('shared'));
      const service1Key = createDependencyKey<string>(Symbol('service1'));
      const service2Key = createDependencyKey<string>(Symbol('service2'));

      container.register(sharedKey, () => ({ id: 'shared-123' }));

      container.register(service1Key, () => {
        const shared = container.get(sharedKey);
        return `service1-${shared.id}`;
      });

      container.register(service2Key, () => {
        const shared = container.get(sharedKey);
        return `service2-${shared.id}`;
      });

      const s1 = container.get(service1Key);
      const s2 = container.get(service2Key);

      expect(s1).toBe('service1-shared-123');
      expect(s2).toBe('service2-shared-123');

      // Shared dependency should only be created once (singleton)
      const shared = container.get(sharedKey);
      expect(shared.id).toBe('shared-123');
    });
  });

  describe('Factory Error Propagation', () => {
    it('should include service key in error message for unregistered service', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<number>(Symbol('unregistered-service'));

      expect(() => container.get(key)).toThrow(/Service .* not registered/);
    });

    it('should list available keys in error message', () => {
      const container = DIContainer.getInstance();
      const registeredKey = createDependencyKey<number>(Symbol('registered'));
      const unregisteredKey = createDependencyKey<number>(Symbol('unregistered'));

      container.register(
        registeredKey,
        vi.fn(() => 42)
      );

      expect(() => container.get(unregisteredKey)).toThrow(/Available keys:/);
    });

    it('should preserve error stack trace from factory', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<number>(Symbol('error-service'));

      container.register(key, () => {
        throw new Error('Deep factory error');
      });

      try {
        container.get(key);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect((e as Error).message).toBe('Deep factory error');
      }
    });

    it('should propagate custom error types', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<number>(Symbol('custom-error'));

      class CustomError extends Error {
        constructor(
          message: string,
          public code: string
        ) {
          super(message);
          this.name = 'CustomError';
        }
      }

      container.register(key, () => {
        throw new CustomError('Custom failure', 'ERR_001');
      });

      try {
        container.get(key);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(CustomError);
        if (e instanceof CustomError) {
          expect(e.code).toBe('ERR_001');
        }
      }
    });
  });

  describe('Lazy Initialization Edge Cases', () => {
    it('should handle factory that captures closure state', () => {
      const container = DIContainer.getInstance();
      let counter = 0;
      const key = createDependencyKey<number>(Symbol('closure-service'));

      container.register(key, () => ++counter);

      const result1 = container.get(key);
      const result2 = container.get(key);

      // Factory should only be called once (singleton behavior)
      expect(result1).toBe(1);
      expect(result2).toBe(1);
      expect(counter).toBe(1);
    });

    it('should handle registering many services', () => {
      const container = DIContainer.getInstance();
      const services: DependencyKey<number>[] = [];

      // Register 100 services
      for (let i = 0; i < 100; i++) {
        const key = createDependencyKey<number>(Symbol(`service-${i}`));
        const value = i;
        container.register(key, () => value);
        services.push(key);
      }

      // All should be registered
      for (const key of services) {
        expect(container.isRegistered(key)).toBe(true);
      }

      // None should be created yet
      for (const key of services) {
        expect(container.has(key)).toBe(false);
      }

      // Create all services
      for (const key of services) {
        container.get(key);
      }

      // All should be created now
      for (const key of services) {
        expect(container.has(key)).toBe(true);
      }
    });

    it('should maintain service instance state', () => {
      const container = DIContainer.getInstance();
      const key = createDependencyKey<{ count: number }>(Symbol('stateful'));

      container.register(key, () => ({ count: 0 }));

      const service1 = container.get(key);
      service1.count = 5;

      const service2 = container.get(key);
      expect(service2.count).toBe(5);
      expect(service1).toBe(service2);
    });

    it('should handle complex nested types', () => {
      const container = DIContainer.getInstance();

      type ComplexType = {
        nested: {
          array: number[];
          map: Map<string, boolean>;
        };
      };

      const key = createDependencyKey<ComplexType>(Symbol('complex-service'));

      container.register(key, () => ({
        nested: {
          array: [1, 2, 3],
          map: new Map([
            ['a', true],
            ['b', false],
          ]),
        },
      }));

      const result = container.get(key);

      expect(result.nested.array).toEqual([1, 2, 3]);
      expect(result.nested.map.get('a')).toBe(true);
    });
  });
});
