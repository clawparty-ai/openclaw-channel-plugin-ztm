// Unit tests for Mesh connectivity functions via Agent API

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkPortOpen, getIdentity, joinMesh, MeshInputValidationError } from './mesh.js';
import type { PermitData } from '../types/connectivity.js';

// Track event handlers for manual triggering
const socketHandlers: Map<string, () => void> = new Map();

vi.mock('net', () => ({
  Socket: class MockSocket {
    setTimeout = vi.fn((_ms: number) => {});
    on = vi.fn(function (this: any, event: string, handler: () => void) {
      socketHandlers.set(event, handler);
    });
    connect = vi.fn();
    destroy = vi.fn();
  },
}));

describe('Mesh connectivity functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socketHandlers.clear();
    global.fetch = vi.fn();
  });

  describe('checkPortOpen', () => {
    it('should return true when port is open', async () => {
      setTimeout(() => {
        const connectHandler = socketHandlers.get('connect');
        if (connectHandler) connectHandler();
      }, 10);

      const result = await checkPortOpen('localhost', 7777);

      expect(result).toBe(true);
    });

    it('should return false when port is closed (timeout)', async () => {
      setTimeout(() => {
        const timeoutHandler = socketHandlers.get('timeout');
        if (timeoutHandler) timeoutHandler();
      }, 10);

      const result = await checkPortOpen('localhost', 7777);

      expect(result).toBe(false);
    });

    it('should return false when port is closed (error)', async () => {
      setTimeout(() => {
        const errorHandler = socketHandlers.get('error');
        if (errorHandler) errorHandler();
      }, 10);

      const result = await checkPortOpen('localhost', 7777);

      expect(result).toBe(false);
    });

    it('should handle various hostnames', async () => {
      // Trigger connect for first call
      setTimeout(() => {
        const connectHandler = socketHandlers.get('connect');
        if (connectHandler) connectHandler();
      }, 10);
      await checkPortOpen('example.com', 443);

      // Trigger connect for second call
      setTimeout(() => {
        const connectHandler = socketHandlers.get('connect');
        if (connectHandler) connectHandler();
      }, 10);
      await checkPortOpen('192.168.1.1', 8080);
    });
  });

  describe('getIdentity', () => {
    it('should fetch identity from /api/identity', async () => {
      const mockPublicKey =
        '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA\n-----END PUBLIC KEY-----';

      (global.fetch as any).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockPublicKey),
      });

      const result = await getIdentity('http://localhost:7777');

      expect(result).toBe(mockPublicKey);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:7777/api/identity',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should return null on API error', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await getIdentity('http://localhost:7777');

      expect(result).toBeNull();
    });

    it('should return null on invalid PEM format', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('invalid data'),
      });

      const result = await getIdentity('http://localhost:7777');

      expect(result).toBeNull();
    });

    it('should handle network error', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const result = await getIdentity('http://localhost:7777');

      expect(result).toBeNull();
    });
  });

  describe('joinMesh', () => {
    const mockPermitData: PermitData = {
      ca: '-----BEGIN CERTIFICATE-----\nCA...\n-----END CERTIFICATE-----',
      agent: {
        certificate: '-----BEGIN CERTIFICATE-----\nAGENT...\n-----END CERTIFICATE-----',
        privateKey: '-----BEGIN PRIVATE KEY-----\nKEY...\n-----END PRIVATE KEY-----',
        labels: [],
      },
      bootstraps: ['hub.example.com:8888'],
    };

    it('should POST permit to /api/meshes/{name}', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
      });

      const result = await joinMesh('http://localhost:7777', 'my-mesh', 'my-ep', mockPermitData);

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:7777/api/meshes/my-mesh',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('my-ep'),
        })
      );
    });

    it('should handle 409 as already joined', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 409,
      });

      const result = await joinMesh('http://localhost:7777', 'my-mesh', 'my-ep', mockPermitData);

      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server error'),
      });

      const result = await joinMesh('http://localhost:7777', 'my-mesh', 'my-ep', mockPermitData);

      expect(result).toBe(false);
    });

    it('should handle network error', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const result = await joinMesh('http://localhost:7777', 'my-mesh', 'my-ep', mockPermitData);

      expect(result).toBe(false);
    });

    it('should handle special characters in mesh name', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
      });

      const result = await joinMesh(
        'http://localhost:7777',
        'test_mesh-123',
        'endpoint-456',
        mockPermitData
      );

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('test_mesh-123'),
        expect.anything()
      );
    });

    it('should use empty string for missing private key', async () => {
      const permitWithoutKey: PermitData = {
        ...mockPermitData,
        agent: {
          certificate: mockPermitData.agent.certificate,
          labels: [],
        },
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
      });

      await joinMesh('http://localhost:7777', 'my-mesh', 'my-ep', permitWithoutKey);

      const callArgs = (fetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.agent.privateKey).toBe('');
    });
  });

  describe('error handling', () => {
    it('should handle network timeout gracefully', async () => {
      setTimeout(() => {
        const timeoutHandler = socketHandlers.get('timeout');
        if (timeoutHandler) timeoutHandler();
      }, 10);

      const result = await checkPortOpen('unreachable-host', 7777);

      expect(result).toBe(false);
    });
  });

  // ============================================
  // Security: Input Validation Tests
  // ============================================

  describe('checkPortOpen security validation', () => {
    it('should reject hostname with path traversal (../)', async () => {
      await expect(checkPortOpen('../etc/passwd', 7777)).rejects.toThrow(MeshInputValidationError);
    });

    it('should reject hostname with Windows path traversal (..\\)', async () => {
      await expect(checkPortOpen('..\\windows\\system32', 7777)).rejects.toThrow(
        MeshInputValidationError
      );
    });

    it('should reject port out of range (too low)', async () => {
      await expect(checkPortOpen('localhost', 0)).rejects.toThrow(MeshInputValidationError);
    });

    it('should reject port out of range (too high)', async () => {
      await expect(checkPortOpen('localhost', 65536)).rejects.toThrow(MeshInputValidationError);
    });

    it('should reject port with decimal value', async () => {
      await expect(checkPortOpen('localhost', 80.5 as unknown as number)).rejects.toThrow(
        MeshInputValidationError
      );
    });

    it('should reject invalid port (NaN)', async () => {
      await expect(checkPortOpen('localhost', NaN as unknown as number)).rejects.toThrow(
        MeshInputValidationError
      );
    });

    it('should accept valid port boundary (1)', async () => {
      // Mock socket to return false (port closed)
      setTimeout(() => {
        const errorHandler = socketHandlers.get('error');
        if (errorHandler) errorHandler();
      }, 10);

      // Should not throw validation error, may return false due to network
      await expect(checkPortOpen('localhost', 1)).resolves.toEqual(false);
    });

    it('should accept valid port boundary (65535)', async () => {
      setTimeout(() => {
        const errorHandler = socketHandlers.get('error');
        if (errorHandler) errorHandler();
      }, 10);

      // Should not throw validation error
      await expect(checkPortOpen('localhost', 65535)).resolves.toEqual(false);
    });
  });

  describe('joinMesh security validation', () => {
    const mockPermitData: PermitData = {
      ca: '-----BEGIN CERTIFICATE-----\nCA...\n-----END CERTIFICATE-----',
      agent: {
        certificate: '-----BEGIN CERTIFICATE-----\nAGENT...\n-----END CERTIFICATE-----',
        privateKey: '-----BEGIN PRIVATE KEY-----\nKEY...\n-----END PRIVATE KEY-----',
        labels: [],
      },
      bootstraps: ['hub.example.com:8888'],
    };

    it('should reject invalid agentUrl (not a URL)', async () => {
      await expect(joinMesh('not-a-url', 'mesh', 'ep', mockPermitData)).rejects.toThrow(
        MeshInputValidationError
      );
    });

    it('should reject agentUrl with invalid protocol (ftp)', async () => {
      await expect(joinMesh('ftp://example.com', 'mesh', 'ep', mockPermitData)).rejects.toThrow(
        MeshInputValidationError
      );
    });

    it('should reject agentUrl with invalid protocol (file://)', async () => {
      await expect(joinMesh('file:///etc/passwd', 'mesh', 'ep', mockPermitData)).rejects.toThrow(
        MeshInputValidationError
      );
    });

    it('should reject empty meshName', async () => {
      await expect(joinMesh('http://localhost:7777', '', 'ep', mockPermitData)).rejects.toThrow(
        MeshInputValidationError
      );
    });

    it('should reject meshName exceeding max length', async () => {
      const longName = 'a'.repeat(100);
      await expect(
        joinMesh('http://localhost:7777', longName, 'ep', mockPermitData)
      ).rejects.toThrow(MeshInputValidationError);
    });

    it('should reject meshName with special characters', async () => {
      await expect(
        joinMesh('http://localhost:7777', 'mesh/@#$', 'ep', mockPermitData)
      ).rejects.toThrow(MeshInputValidationError);
    });

    it('should reject meshName with path traversal', async () => {
      await expect(
        joinMesh('http://localhost:7777', '../malicious', 'ep', mockPermitData)
      ).rejects.toThrow(MeshInputValidationError);
    });

    it('should reject empty endpointName', async () => {
      await expect(joinMesh('http://localhost:7777', 'mesh', '', mockPermitData)).rejects.toThrow(
        MeshInputValidationError
      );
    });

    it('should reject endpointName exceeding max length', async () => {
      const longName = 'a'.repeat(100);
      await expect(
        joinMesh('http://localhost:7777', 'mesh', longName, mockPermitData)
      ).rejects.toThrow(MeshInputValidationError);
    });

    it('should reject endpointName with path traversal', async () => {
      await expect(
        joinMesh('http://localhost:7777', 'mesh', '../etc', mockPermitData)
      ).rejects.toThrow(MeshInputValidationError);
    });

    it('should accept valid parameters (network may fail but validation passes)', async () => {
      // Mock fetch to simulate network error
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      // joinMesh catches network errors and returns false (not throw)
      // Valid parameters should pass validation without throwing MeshInputValidationError
      const result = await joinMesh(
        'http://localhost:7777',
        'valid-mesh',
        'valid-ep',
        mockPermitData
      );
      expect(result).toBe(false); // Network error, not validation error
    });

    it('should accept valid parameters when API succeeds', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
      });

      const result = await joinMesh(
        'http://localhost:7777',
        'valid-mesh',
        'valid-ep',
        mockPermitData
      );
      expect(result).toBe(true);
    });
  });
});
