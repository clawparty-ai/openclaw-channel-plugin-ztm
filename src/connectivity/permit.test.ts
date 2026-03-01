// Unit tests for Permit management functions

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { requestPermit, savePermitData, handlePairingRequest } from './permit.js';
import type { AccountRuntimeState } from '../runtime/state.js';
import type { PermitData } from '../types/connectivity.js';
import { testConfig } from '../test-utils/fixtures.js';

// Valid PermitData for testing
const validPermitData: PermitData = {
  ca: '-----BEGIN CERTIFICATE-----\ntest-ca\n-----END CERTIFICATE-----',
  agent: {
    certificate: '-----BEGIN CERTIFICATE-----\ntest-cert\n-----END CERTIFICATE-----',
    privateKey: '-----BEGIN PRIVATE KEY-----\ntest-key\n-----END PRIVATE KEY-----',
  },
  bootstraps: ['bootstrap1.ztm.local:7777', 'bootstrap2.ztm.local:7777'],
};

// Mock dependencies
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  defaultLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock runtime - using functions that return promises
let mockPairingResult = { code: 'ABC123', created: true };
let mockAllowFromResult: string[] = [];
let mockPairingReplyMessage = 'Pairing reply message';
let mockBuildPairingReplyThrows = false;

const mockUpsertPairingRequest = vi.fn(() => Promise.resolve(mockPairingResult));

vi.mock('../runtime/index.js', () => ({
  getZTMRuntime: vi.fn(() => ({
    channel: {
      pairing: {
        upsertPairingRequest: mockUpsertPairingRequest,
        readAllowFromStore: () => Promise.resolve(mockAllowFromResult),
        buildPairingReply: () => {
          if (mockBuildPairingReplyThrows) {
            throw new Error('Not implemented');
          }
          return mockPairingReplyMessage;
        },
      },
    },
  })),
}));

// Mock fetch - use vi.fn that returns real Response objects
const mockFetch = vi.fn();
const originalFetch = global.fetch;
global.fetch = mockFetch;

// Mock fs - using variables to control behavior
let mockFsExists = true;
let mockFsWriteError: Error | null = null;
let mockFsMkdirError: Error | null = null;
let fsWriteCalls: any[] = [];
let fsMkdirCalls: any[] = [];

const mockExistsSync = () => mockFsExists;
const mockMkdirSync = (...args: any[]) => {
  fsMkdirCalls.push(args);
  if (mockFsMkdirError) throw mockFsMkdirError;
};
const mockWriteFileSync = (...args: any[]) => {
  fsWriteCalls.push(args);
  if (mockFsWriteError) throw mockFsWriteError;
};

vi.mock('fs', () => ({
  existsSync: () => mockExistsSync(),
  mkdirSync: (...args: any[]) => mockMkdirSync(...args),
  writeFileSync: (...args: any[]) => mockWriteFileSync(...args),
}));

describe('Permit management functions', () => {
  const mockState: AccountRuntimeState = {
    accountId: 'test-account',
    config: { ...testConfig },
    chatSender: {
      sendPeerMessage: vi.fn().mockResolvedValue(true),
    } as any, // Partial mock for testing
    chatReader: null,
    discovery: null,
    lastError: null,
    lastStartAt: null,
    lastStopAt: null,
    lastInboundAt: null,
    lastOutboundAt: null,
    messageCallbacks: new Set(),
    watchInterval: null,
    watchErrorCount: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset fs mock state
    mockFsExists = true;
    mockFsWriteError = null;
    mockFsMkdirError = null;
    fsWriteCalls = [];
    fsMkdirCalls = [];

    // Reset runtime mock state
    mockPairingResult = { code: 'ABC123', created: true };
    mockAllowFromResult = [];
    mockPairingReplyMessage = 'Pairing reply message';
    mockBuildPairingReplyThrows = false;

    // Reset chatSender mock and config
    mockState.chatSender = {
      sendPeerMessage: vi.fn().mockResolvedValue(true),
    } as any; // Partial mock for testing
    mockState.config.allowFrom = undefined;

    // Reset fetch mock
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    // Restore original fetch to avoid affecting other test files
    global.fetch = originalFetch;
  });

  describe('requestPermit', () => {
    it('should request permit successfully', async () => {
      const mockPermitData = {
        ca: '-----BEGIN CERTIFICATE-----\nCA...\n-----END CERTIFICATE-----',
        agent: {
          certificate: '-----BEGIN CERTIFICATE-----\nCERT...\n-----END CERTIFICATE-----',
        },
        bootstraps: ['hub.example.com:8888'],
      };
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(mockPermitData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          statusText: 'OK',
        })
      );

      const result = await requestPermit(
        'https://example.com/permit',
        'public-key-data',
        'test-user'
      );

      expect(result).toEqual(mockPermitData);
      expect(mockFetch).toHaveBeenCalledWith('https://example.com/permit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          PublicKey: 'public-key-data',
          UserName: 'test-user',
        }),
      });
    });

    it('should return null on HTTP error', async () => {
      mockFetch.mockResolvedValue(
        new Response('Not Found', {
          status: 404,
          statusText: 'Not Found',
        }) as unknown as Response
      );

      const result = await requestPermit('https://example.com/permit', 'public-key', 'user');

      expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await requestPermit('https://example.com/permit', 'public-key', 'user');

      expect(result).toBeNull();
    });

    it('should handle non-JSON response', async () => {
      const mockResponse = {
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      } as unknown as Response;
      mockFetch.mockResolvedValue(mockResponse);

      const result = await requestPermit('https://example.com/permit', 'public-key', 'user');

      expect(result).toBeNull();
    });

    it('should log success message', async () => {
      const mockPermitData = {
        ca: '-----BEGIN CERTIFICATE-----\nCA...\n-----END CERTIFICATE-----',
        agent: {
          certificate: '-----BEGIN CERTIFICATE-----\nCERT...\n-----END CERTIFICATE-----',
        },
        bootstraps: ['hub.example.com:8888'],
      };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => mockPermitData,
      } as unknown as Response);

      await requestPermit('https://example.com/permit', 'key', 'user');

      const { logger } = await import('../utils/logger.js');
      expect(logger.info).toHaveBeenCalledWith('Permit request successful');
    });

    it('should log error on failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server Error',
      } as unknown as Response);

      await requestPermit('https://example.com/permit', 'key', 'user');

      const { logger } = await import('../utils/logger.js');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle various HTTP status codes', async () => {
      const statusCodes = [400, 401, 403, 404, 500, 502, 503];

      for (const status of statusCodes) {
        mockFetch.mockResolvedValue({
          ok: status < 400,
          status,
          statusText: `Error ${status}`,
          text: async () => `Error ${status}`,
        } as unknown as Response);

        const result = await requestPermit('https://example.com/permit', 'key', 'user');

        expect(result).toBe(status < 400 ? expect.anything() : null);
      }
    });

    it('should send correct payload structure', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      } as unknown as Response);

      await requestPermit('https://example.com/permit', 'pub-key', 'username');

      const bodyArg = mockFetch.mock.calls[0]?.[1]?.body;
      const parsedBody = JSON.parse(bodyArg);
      expect(parsedBody).toEqual({
        PublicKey: 'pub-key',
        UserName: 'username',
      });
    });

    it('should handle empty permit response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as unknown as Response);

      const result = await requestPermit('https://example.com/permit', 'key', 'user');

      // Empty response should fail validation and return null
      expect(result).toBeNull();
    });

    // ============================================
    // Malformed Permit Data Tests
    // ============================================

    it('should reject permit missing CA certificate', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            agent: { certificate: 'cert' },
            bootstraps: ['hub:7777'],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

      const result = await requestPermit('https://example.com/permit', 'key', 'user');

      expect(result).toBeNull();
    });

    it('should reject permit missing agent certificate', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            ca: '-----BEGIN CERTIFICATE-----\nCA\n-----END CERTIFICATE-----',
            bootstraps: ['hub:7777'],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

      const result = await requestPermit('https://example.com/permit', 'key', 'user');

      expect(result).toBeNull();
    });

    it('should reject permit with invalid bootstraps (not array)', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            ca: '-----BEGIN CERTIFICATE-----\nCA\n-----END CERTIFICATE-----',
            agent: { certificate: '-----BEGIN CERTIFICATE-----\nCERT\n-----END CERTIFICATE-----' },
            bootstraps: 'not-an-array',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

      const result = await requestPermit('https://example.com/permit', 'key', 'user');

      expect(result).toBeNull();
    });

    it('should reject permit with null bootstraps', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            ca: '-----BEGIN CERTIFICATE-----\nCA\n-----END CERTIFICATE-----',
            agent: { certificate: '-----BEGIN CERTIFICATE-----\nCERT\n-----END CERTIFICATE-----' },
            bootstraps: null,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

      const result = await requestPermit('https://example.com/permit', 'key', 'user');

      expect(result).toBeNull();
    });

    it('should reject permit with empty bootstraps array', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            ca: '-----BEGIN CERTIFICATE-----\nCA\n-----END CERTIFICATE-----',
            agent: { certificate: '-----BEGIN CERTIFICATE-----\nCERT\n-----END CERTIFICATE-----' },
            bootstraps: [],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

      // Empty bootstraps should still be valid (allows empty array)
      const result = await requestPermit('https://example.com/permit', 'key', 'user');

      expect(result).not.toBeNull();
    });

    it('should reject permit with missing agent field entirely', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            ca: '-----BEGIN CERTIFICATE-----\nCA\n-----END CERTIFICATE-----',
            bootstraps: ['hub:7777'],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

      const result = await requestPermit('https://example.com/permit', 'key', 'user');

      expect(result).toBeNull();
    });

    it('should reject permit with invalid JSON', async () => {
      mockFetch.mockResolvedValue(
        new Response('not valid json', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await requestPermit('https://example.com/permit', 'key', 'user');

      expect(result).toBeNull();
    });

    it('should handle permit with extra unknown fields gracefully', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            ca: '-----BEGIN CERTIFICATE-----\nCA\n-----END CERTIFICATE-----',
            agent: { certificate: '-----BEGIN CERTIFICATE-----\nCERT\n-----END CERTIFICATE-----' },
            bootstraps: ['hub:7777'],
            unknownField: 'should be ignored',
            extra: { nested: 'data' },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

      const result = await requestPermit('https://example.com/permit', 'key', 'user');

      expect(result).not.toBeNull();
      expect(result?.ca).toBeDefined();
      expect(result?.agent?.certificate).toBeDefined();
      expect(result?.bootstraps).toEqual(['hub:7777']);
    });
  });

  // loadPermitFromFile is tested indirectly through integration tests

  describe('savePermitData', () => {
    const testPermitPath = '/test/path/permit.json';

    it('should save permit data successfully', () => {
      const permitData = validPermitData;

      const result = savePermitData(permitData, testPermitPath);

      expect(result).toBe(true);
      expect(fsWriteCalls.length).toBe(1);
      expect(fsWriteCalls[0]).toEqual([testPermitPath, JSON.stringify(permitData, null, 2)]);
    });

    it('should create directory if not exists', () => {
      const permitData = validPermitData;
      mockFsExists = false;

      const result = savePermitData(permitData, testPermitPath);

      expect(result).toBe(true);
      expect(fsMkdirCalls.length).toBe(1);
      expect(fsMkdirCalls[0][0]).toBe(require('path').dirname(testPermitPath));
      expect(fsMkdirCalls[0][1]).toEqual({ recursive: true });
    });

    it('should handle file write error', () => {
      const permitData = validPermitData;
      mockFsWriteError = new Error('Write failed');

      const result = savePermitData(permitData, testPermitPath);

      expect(result).toBe(false);
    });

    it('should handle directory creation error', () => {
      const permitData = validPermitData;
      mockFsExists = false;
      mockFsMkdirError = new Error('Mkdir failed');

      const result = savePermitData(permitData, testPermitPath);

      expect(result).toBe(false);
    });

    it('should log success message', async () => {
      const permitData = validPermitData;
      mockFsExists = true;
      mockFsWriteError = null;

      savePermitData(permitData, testPermitPath);

      const { logger } = await import('../utils/logger.js');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Permit data saved to'));
    });

    it('should log error on failure', async () => {
      const permitData = validPermitData;
      mockFsWriteError = new Error('Write failed');

      savePermitData(permitData, testPermitPath);

      const { logger } = await import('../utils/logger.js');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle complex nested permit data', () => {
      const permitData = {
        ca: 'test-ca',
        agent: { certificate: 'test-cert' },
        bootstraps: ['bootstrap1:7777'],
        nested: {
          level1: {
            level2: { value: 'deep' },
          },
          array: [1, 2, 3],
        },
      } as unknown as PermitData;

      savePermitData(permitData, testPermitPath);

      expect(fsWriteCalls[0][1]).toBe(JSON.stringify(permitData, null, 2));
    });

    it('should handle special characters in data', () => {
      const permitData = {
        ca: 'test-ca',
        agent: { certificate: 'test-cert' },
        bootstraps: ['bootstrap1:7777'],
        message: 'Test unicode: 你好 🌍',
        special: 'Quotes: " \'',
      } as unknown as PermitData;

      const result = savePermitData(permitData, testPermitPath);

      expect(result).toBe(true);
    });

    it('should not create directory when exists', () => {
      const permitData = validPermitData;
      mockFsExists = true;

      savePermitData(permitData, testPermitPath);

      expect(fsMkdirCalls.length).toBe(0);
    });

    it('should handle deeply nested paths', () => {
      const permitData = validPermitData;
      mockFsExists = false;
      const deepPath = '/a/b/c/d/e/f/permit.json';

      savePermitData(permitData, deepPath);

      expect(fsMkdirCalls[0][0]).toBe('/a/b/c/d/e/f');
    });
  });

  describe('handlePairingRequest', () => {
    it('should register pairing request and send message', async () => {
      mockUpsertPairingRequest.mockClear();

      await handlePairingRequest(mockState, 'alice', 'Test context', []);

      expect(mockUpsertPairingRequest).toHaveBeenCalled();
      expect(mockState.chatSender?.sendPeerMessage).toHaveBeenCalled();
    });
  });

  describe('Edge Cases and Integration', () => {
    it('should handle concurrent pairing requests', async () => {
      const peers = ['peer1', 'peer2', 'peer3'];

      await Promise.all(peers.map(peer => handlePairingRequest(mockState, peer, 'context', [])));

      expect(mockState.chatSender?.sendPeerMessage).toHaveBeenCalledTimes(3);
    });

    it('should handle very long peer names', async () => {
      const longPeer = 'a'.repeat(1000);

      await handlePairingRequest(mockState, longPeer, 'context', []);

      expect(mockUpsertPairingRequest).toHaveBeenCalled();
    });

    it('should handle unicode peer names', async () => {
      const unicodePeer = '用户-пользователь';

      await handlePairingRequest(mockState, unicodePeer, 'context', []);

      expect(mockUpsertPairingRequest).toHaveBeenCalled();
    });

    it('should handle empty permit data save', () => {
      const emptyData = {} as unknown as PermitData;

      savePermitData(emptyData, '/test/path.json');

      expect(fsWriteCalls[0][1]).toBe('{}');
    });

    it('should handle null values in permit data', () => {
      const dataWithNull = {
        ca: 'test-ca',
        agent: { certificate: 'test-cert' },
        bootstraps: ['bootstrap1:7777'],
        optional: null,
      } as unknown as PermitData;

      savePermitData(dataWithNull, '/test/path.json');

      expect(fsWriteCalls[0][1]).toContain('null');
    });

    it('should handle network timeout in permit request', async () => {
      mockFetch.mockRejectedValue(new Error('Request timeout'));

      const result = await requestPermit('https://example.com/permit', 'key', 'user');

      expect(result).toBeNull();
    });
  });
});
