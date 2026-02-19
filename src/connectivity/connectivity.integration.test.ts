// Integration tests for Connectivity Module
// Tests for full connectivity flow: validation → permit → mesh join

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testConfig } from '../test-utils/fixtures.js';
import type { PermitData } from '../types/connectivity.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Mock logger
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

describe('Connectivity Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('identity retrieval flow', () => {
    it('should retrieve identity from agent', async () => {
      const { getIdentity } = await import('./mesh.js');

      const mockPublicKey =
        '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA\n-----END PUBLIC KEY-----';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockPublicKey,
      } as Response);

      const result = await getIdentity('http://localhost:7777');

      expect(result).toBe(mockPublicKey);
    });

    it('should handle identity fetch failure', async () => {
      const { getIdentity } = await import('./mesh.js');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      } as Response);

      const result = await getIdentity('http://localhost:7777');

      expect(result).toBeNull();
    });

    it('should handle network error', async () => {
      const { getIdentity } = await import('./mesh.js');

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await getIdentity('http://localhost:7777');

      expect(result).toBeNull();
    });
  });

  describe('permit request flow', () => {
    it('should complete permit request successfully', async () => {
      const { requestPermit } = await import('./permit.js');

      const mockPermitData: PermitData = {
        ca: '-----BEGIN CERTIFICATE-----\nCA CERT\n-----END CERTIFICATE-----',
        agent: {
          certificate: '-----BEGIN CERTIFICATE-----\nAGENT CERT\n-----END CERTIFICATE-----',
          privateKey: '-----BEGIN PRIVATE KEY-----\nPRIVATE KEY\n-----END PRIVATE KEY-----',
        },
        bootstraps: ['hub1.example.com:7777', 'hub2.example.com:7777'],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPermitData,
      } as Response);

      const result = await requestPermit(
        'https://ztm-portal.example.com/permit',
        'public-key-123',
        'testuser'
      );

      expect(result).not.toBeNull();
      expect(result?.ca).toContain('CA CERT');
      expect(result?.agent?.certificate).toContain('AGENT CERT');
      expect(result?.bootstraps).toHaveLength(2);
    });

    it('should handle permit request failure', async () => {
      const { requestPermit } = await import('./permit.js');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      } as Response);

      const result = await requestPermit(
        'https://ztm-portal.example.com/permit',
        'public-key-123',
        'testuser'
      );

      expect(result).toBeNull();
    });

    it('should handle permit with missing required fields', async () => {
      const { requestPermit } = await import('./permit.js');

      const incompletePermit = {
        agent: { certificate: 'cert', privateKey: 'key' },
        bootstraps: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => incompletePermit,
      } as Response);

      const result = await requestPermit(
        'https://ztm-portal.example.com/permit',
        'public-key-123',
        'testuser'
      );

      expect(result).toBeNull();
    });

    it('should handle permit with empty bootstraps', async () => {
      const { requestPermit } = await import('./permit.js');

      const emptyBootstrapPermit = {
        ca: 'CA CERT',
        agent: { certificate: 'AGENT CERT', privateKey: 'PRIVATE KEY' },
        bootstraps: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => emptyBootstrapPermit,
      } as Response);

      const result = await requestPermit(
        'https://ztm-portal.example.com/permit',
        'public-key-123',
        'testuser'
      );

      expect(result).not.toBeNull();
      expect(result?.bootstraps).toEqual([]);
    });

    it('should handle network error during permit request', async () => {
      const { requestPermit } = await import('./permit.js');

      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      const result = await requestPermit(
        'https://ztm-portal.example.com/permit',
        'public-key-123',
        'testuser'
      );

      expect(result).toBeNull();
    });
  });

  describe('pairing request flow', () => {
    it('should skip pairing for already approved peer', async () => {
      const { handlePairingRequest } = await import('./permit.js');
      const mockSendPeerMessage = vi.fn().mockResolvedValue({ ok: true });

      const mockState = {
        accountId: 'test-account',
        config: {
          ...testConfig,
          allowFrom: ['alice'],
        },
        apiClient: {
          sendPeerMessage: mockSendPeerMessage,
        },
        pendingPairings: new Map(),
      } as any;

      await handlePairingRequest(mockState, 'alice', 'test-context');

      // Should not send message for already approved peer
      expect(mockSendPeerMessage).not.toHaveBeenCalled();
    });

    it('should skip pairing for store-approved peer', async () => {
      const { handlePairingRequest } = await import('./permit.js');
      const mockSendPeerMessage = vi.fn().mockResolvedValue({ ok: true });

      const mockState = {
        accountId: 'test-account',
        config: {
          ...testConfig,
          allowFrom: [],
        },
        apiClient: {
          sendPeerMessage: mockSendPeerMessage,
        },
        pendingPairings: new Map(),
      } as any;

      await handlePairingRequest(mockState, 'alice', 'test-context', ['alice']);

      expect(mockSendPeerMessage).not.toHaveBeenCalled();
    });

    it('should handle apiClient not available', async () => {
      const { handlePairingRequest } = await import('./permit.js');

      const mockState = {
        accountId: 'test-account',
        config: {
          ...testConfig,
          allowFrom: [],
        },
        apiClient: null,
        pendingPairings: new Map(),
      } as any;

      // Should not throw when apiClient is null
      await expect(
        handlePairingRequest(mockState, 'alice', 'test-context')
      ).resolves.toBeUndefined();
    });
  });
});
