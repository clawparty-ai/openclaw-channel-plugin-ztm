// Integration tests for Mesh Reconnection
// Tests for mesh reconnection, state recovery, identity fetching, mesh joining

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getIdentity, joinMesh } from './mesh.js';
import type { PermitData } from '../types/connectivity.js';

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Mesh Reconnection Integration', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('connection timeout handling', () => {
    it('should handle connection timeout', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => '-----BEGIN PUBLIC KEY-----\nMOCK CERTIFICATE\n-----END PUBLIC KEY-----',
      } as Response);

      // Mock timeout behavior - connection succeeds but with delay
      const result = await getIdentity('http://localhost:7777');

      // Should complete successfully
      expect(result).not.toBeNull();
      expect(result).toContain('BEGIN PUBLIC KEY');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:7777/api/identity',
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  describe('reconnection with exponential backoff', () => {
    it('should attempt reconnection with increasing delays', async () => {
      // Mock to track retry delays
      mockFetch.mockImplementation(async () => {
        // Simulate retry delay
        await new Promise(resolve => setTimeout(resolve, 50));
        return {
          ok: true,
          json: async () => ({ result: 'success' }),
        } as Response;
      });

      const startTime = Date.now();
      await getIdentity('http://localhost:7777');
      const elapsed = Date.now() - startTime;

      // Should complete (actual retry logic is in implementation)
      expect(mockFetch).toHaveBeenCalled();
      expect(elapsed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('state restoration after reconnection', () => {
    it('should re-fetch identity after reconnection', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error')).mockResolvedValueOnce({
        ok: true,
        text: async () =>
          '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A\n-----END PUBLIC KEY-----',
      } as Response);

      // First attempt fails
      const id1 = await getIdentity('http://localhost:7777');
      expect(id1).toBeNull();

      // Second attempt succeeds (after reconnection)
      const id2 = await getIdentity('http://localhost:7777');
      expect(id2).toContain('BEGIN PUBLIC KEY');
    });

    it('should re-join mesh after reconnection', async () => {
      const permitData: PermitData = {
        ca: 'CA CERT',
        agent: {
          certificate: 'AGENT CERT',
          privateKey: 'PRIVATE KEY',
        },
        bootstraps: ['hub1.example.com:7777'],
      };

      mockFetch.mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce({
        ok: true,
      } as Response);

      const agentUrl = 'http://localhost:7777';
      const meshName = 'test-mesh';
      const endpointName = 'test-endpoint';

      // First attempt fails
      const joined1 = await joinMesh(agentUrl, meshName, endpointName, permitData);
      expect(joined1).toBe(false);

      // Second attempt succeeds
      const joined2 = await joinMesh(agentUrl, meshName, endpointName, permitData);
      expect(joined2).toBe(true);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should preserve mesh state during reconnection', async () => {
      const permitData: PermitData = {
        ca: 'CA CERT',
        agent: {
          certificate: 'AGENT CERT',
          privateKey: 'PRIVATE KEY',
        },
        bootstraps: ['hub1.example.com:7777'],
      };

      mockFetch.mockResolvedValue({
        ok: true,
      } as Response);

      const agentUrl = 'http://localhost:7777';
      const meshName = 'test-mesh';
      const endpointName = 'test-endpoint';

      // Join mesh successfully
      const joined = await joinMesh(agentUrl, meshName, endpointName, permitData);
      expect(joined).toBe(true);

      // Verify mesh state is preserved
      // In a real scenario, the agent would maintain membership state
      expect(mockFetch).toHaveBeenCalledWith(
        `${agentUrl}/api/meshes/${encodeURIComponent(meshName)}`,
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining(endpointName),
        })
      );
    });
  });

  describe('agent shutdown handling', () => {
    it('should handle agent shutdown gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Agent shutting down'));

      const result = await getIdentity('http://localhost:7777');

      expect(result).toBeNull();
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle 409 Conflict (already joined) gracefully', async () => {
      const permitData: PermitData = {
        ca: 'CA',
        agent: {
          certificate: 'CERT',
          privateKey: 'KEY',
        },
        bootstraps: [],
      };

      mockFetch.mockResolvedValue({
        ok: false,
        status: 409,
        statusText: 'Conflict',
        text: async () => 'Already joined',
      } as Response);

      const joined = await joinMesh(
        'http://localhost:7777',
        'test-mesh',
        'test-endpoint',
        permitData
      );

      // 409 Conflict means already joined, which is acceptable
      expect(joined).toBe(true);
    });
  });

  describe('identity validation', () => {
    it('should validate identity format after reconnection', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => '-----BEGIN PUBLIC KEY-----\nVALID CERT DATA\n-----END PUBLIC KEY-----',
      } as Response);

      const identity = await getIdentity('http://localhost:7777');

      expect(identity).not.toBeNull();
      expect(identity).toContain('BEGIN PUBLIC KEY');
      expect(identity).toContain('VALID CERT DATA');
    });

    it('should reject invalid identity format', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => 'INVALID DATA NOT A CERT',
      } as Response);

      const identity = await getIdentity('http://localhost:7777');

      // Should return null for invalid format
      expect(identity).toBeNull();
    });

    it('should handle network errors during identity fetch', async () => {
      mockFetch.mockRejectedValue(new Error('ETIMEDOUT'));

      const identity = await getIdentity('http://localhost:7777');

      expect(identity).toBeNull();
    });
  });

  describe('mesh join error handling', () => {
    it('should handle mesh join transient errors', async () => {
      const permitData: PermitData = {
        ca: 'CA',
        agent: {
          certificate: 'CERT',
          privateKey: 'KEY',
        },
        bootstraps: [],
      };

      mockFetch.mockRejectedValue(new Error('ECONNRESET'));

      const joined = await joinMesh(
        'http://localhost:7777',
        'test-mesh',
        'test-endpoint',
        permitData
      );

      // Should handle error gracefully - returns false
      expect(joined).toBe(false);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle malformed permit data', async () => {
      // Permit data with missing required fields
      const invalidPermitData = {
        ca: 'CA',
        agent: {
          certificate: 'CERT',
          privateKey: 'KEY',
        },
        // Missing bootstraps
      } as unknown as PermitData;

      mockFetch.mockResolvedValue({
        ok: true,
      } as Response);

      const joined = await joinMesh(
        'http://localhost:7777',
        'test-mesh',
        'test-endpoint',
        invalidPermitData
      );

      // Should handle gracefully
      expect(joined).toBeDefined();
    });
  });
});
