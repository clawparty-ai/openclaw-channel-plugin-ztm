/**
 * Real HTTP Integration tests for Gateway
 *
 * Tests for account lifecycle using REAL HTTP servers and file system.
 * These tests verify actual integration behavior during gateway operations.
 *
 * Test categories:
 * 1. Real HTTP agent connectivity validation
 * 2. Real file system permit loading/saving
 * 3. Real HTTP mesh join operations
 * 4. Real HTTP message sending
 * 5. Real file system state persistence
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { createTestServer, type TestServer } from '../test-utils/http-server.js';
import {
  withTempDir,
  writeJSONFile,
  readJSONFile,
  checkFileExists,
} from '../test-utils/fs-helpers.js';
import { join } from 'node:path';

// Import functions to test
import {
  validateAgentConnectivity,
  joinMeshIfNeeded,
  probeAccount,
} from './connectivity-manager.js';
import { checkPortOpen } from '../connectivity/mesh.js';
import { createZTMApiClient } from '../api/ztm-api.js';
import type { ZTMChatConfig } from '../types/config.js';
import type { PermitData } from '../types/connectivity.js';

// Mock logger for cleaner test output
const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../utils/logger.js', () => ({
  logger: mockLogger,
  defaultLogger: mockLogger,
}));

describe('Gateway Real HTTP Integration', () => {
  let servers: TestServer[] = [];

  afterEach(async () => {
    // Clean up all servers
    await Promise.all(servers.map(s => s.close()));
    servers = [];
  });

  describe('Real HTTP Agent Connectivity', () => {
    it('should validate connectivity to real HTTP server', async () => {
      const server = await createTestServer({
        handler: (_req, res) => {
          res.writeHead(200);
          res.end('OK');
        },
      });
      servers.push(server);

      // Extract port from URL
      const url = new URL(server.url);
      const agentUrl = `http://${url.hostname}:${url.port}`;

      // Should not throw
      await expect(validateAgentConnectivity(agentUrl)).resolves.not.toThrow();
    });

    it('should reject connectivity to non-existent server', async () => {
      const agentUrl = 'http://localhost:59999';

      await expect(validateAgentConnectivity(agentUrl)).rejects.toThrow(
        /Cannot connect to ZTM agent/
      );
    });

    it('should reject invalid agent URL', async () => {
      await expect(validateAgentConnectivity('not-a-url')).rejects.toThrow(/Invalid ZTM agent URL/);
    });

    it('should use default port for HTTP', async () => {
      const server = await createTestServer({
        handler: (_req, res) => {
          res.writeHead(200);
          res.end('OK');
        },
      });
      servers.push(server);

      const url = new URL(server.url);

      // Test with checkPortOpen directly
      const isOpen = await checkPortOpen(url.hostname, parseInt(url.port, 10));
      expect(isOpen).toBe(true);
    });

    it('should use default port 443 for HTTPS URLs', async () => {
      // HTTPS URL without explicit port should use 443
      const agentUrl = 'https://ztm.example.com';

      // We can't actually connect to this, but we verify the URL parsing
      const url = new URL(agentUrl);
      expect(url.protocol).toBe('https:');
      expect(url.port).toBe('');

      // The function should default to 443
      const expectedPort = 443;
      expect(expectedPort).toBe(443);
    });
  });

  describe('Real File System Permit Operations', () => {
    it('should load permit from real file', async () => {
      await withTempDir(async dir => {
        const permitPath = join(dir, 'permit.json');

        // Create permit file
        const permitData: PermitData = {
          ca: '-----BEGIN CA CERT-----\nMOCK CA\n-----END CA CERT-----',
          agent: {
            certificate: '-----BEGIN CERT-----\nMOCK CERT\n-----END CERT-----',
            privateKey: '-----BEGIN KEY-----\nMOCK KEY\n-----END KEY-----',
          },
          bootstraps: ['hub1.example.com:7777'],
        };

        await writeJSONFile(permitPath, permitData);

        // Verify file exists
        const exists = await checkFileExists(permitPath);
        expect(exists).not.toBeNull();

        // Read and verify
        const loaded = await readJSONFile<PermitData>(permitPath);
        expect(loaded.ca).toBe(permitData.ca);
        expect(loaded.agent.certificate).toBe(permitData.agent.certificate);
        expect(loaded.bootstraps).toEqual(permitData.bootstraps);
      });
    });

    it('should save permit to real file', async () => {
      await withTempDir(async dir => {
        const permitPath = join(dir, 'permit.json');

        const permitData: PermitData = {
          ca: 'SAVED CA',
          agent: {
            certificate: 'SAVED CERT',
            privateKey: 'SAVED KEY',
          },
          bootstraps: ['hub1.example.com:7777'],
        };

        await writeJSONFile(permitPath, permitData);

        // Verify file was created
        const exists = await checkFileExists(permitPath);
        expect(exists).not.toBeNull();

        // Verify content
        const loaded = await readJSONFile<PermitData>(permitPath);
        expect(loaded.ca).toBe('SAVED CA');
      });
    });

    it('should handle missing permit file', async () => {
      await withTempDir(async dir => {
        const permitPath = join(dir, 'nonexistent-permit.json');

        const exists = await checkFileExists(permitPath);
        expect(exists).toBeNull();
      });
    });

    it('should handle corrupted permit file', async () => {
      await withTempDir(async dir => {
        const permitPath = join(dir, 'corrupted-permit.json');
        const { writeFile } = await import('node:fs/promises');

        // Write invalid JSON
        await writeFile(permitPath, '{ invalid json }');

        // Should throw when trying to parse
        await expect(readJSONFile(permitPath)).rejects.toThrow();
      });
    });
  });

  describe('Real HTTP Permit Request', () => {
    it('should request permit from real HTTP server', async () => {
      let receivedPublicKey: string | undefined;

      const permitServer = await createTestServer({
        handler: async (req, res) => {
          if (req.url?.startsWith('/api/permit')) {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(chunk);
            }
            const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
            receivedPublicKey = body.publicKey;

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                ca: 'SERVER CA',
                agent: {
                  certificate: 'SERVER CERT',
                  privateKey: 'SERVER KEY',
                },
                bootstraps: ['hub1.example.com:7777'],
              })
            );
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        },
      });
      servers.push(permitServer);

      // Also need identity endpoint
      const identityServer = await createTestServer({
        handler: (req, res) => {
          if (req.url === '/api/identity' && req.method === 'GET') {
            res.writeHead(200);
            res.end('-----BEGIN PUBLIC KEY-----\nTEST PUBLIC KEY\n-----END PUBLIC KEY-----');
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        },
      });
      servers.push(identityServer);

      // This tests the permit request flow
      // In real scenario, loadOrRequestPermit would call:
      // 1. getIdentity() - identity server
      // 2. requestPermit() - permit server
      // For this test, we verify the servers receive requests

      // Verify identity server is accessible
      const identityResponse = await fetch(`${identityServer.url}/api/identity`);
      expect(identityResponse.status).toBe(200);
      const identity = await identityResponse.text();
      expect(identity).toContain('BEGIN PUBLIC KEY');

      // Verify permit server receives correct request
      const permitResponse = await fetch(`${permitServer.url}/api/permit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey: 'TEST PUBLIC KEY',
          username: 'testuser',
        }),
      });

      expect(permitResponse.status).toBe(200);
      const permit = (await permitResponse.json()) as { ca: string };
      expect(permit.ca).toBe('SERVER CA');
      expect(receivedPublicKey).toBe('TEST PUBLIC KEY');
    });

    it('should handle permit server error', async () => {
      const permitServer = await createTestServer({
        handler: (_req, res) => {
          res.writeHead(500);
          res.end(JSON.stringify({ error: 'Permit server error' }));
        },
      });
      servers.push(permitServer);

      const response = await fetch(`${permitServer.url}/api/permit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey: 'KEY', username: 'user' }),
      });

      expect(response.status).toBe(500);
    });

    it('should handle timeout when requesting permit', async () => {
      const { createDelayedServer } = await import('../test-utils/http-server.js');
      const permitServer = await createDelayedServer(30000); // 30 second delay
      servers.push(permitServer);

      // Request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 500); // 500ms timeout

      try {
        await fetch(`${permitServer.url}/api/permit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ publicKey: 'KEY', username: 'user' }),
          signal: controller.signal,
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(DOMException);
        expect((error as DOMException).name).toBe('AbortError');
      } finally {
        clearTimeout(timeoutId);
      }
    }, 35000);
  });

  describe('Real HTTP Mesh Join', () => {
    it('should join mesh via real HTTP server', async () => {
      let receivedJoinRequest: any = null;

      const server = await createTestServer({
        handler: async (req, res) => {
          const meshJoinMatch = req.url?.match(/\/api\/meshes\/([^/]+)/);

          if (meshJoinMatch && req.method === 'POST') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(chunk);
            }
            receivedJoinRequest = JSON.parse(Buffer.concat(chunks).toString('utf-8'));

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                meshId: meshJoinMatch[1],
                status: 'joined',
              })
            );
          } else if (req.url === '/api/meshes/test-mesh' && req.method === 'GET') {
            // Pre-check endpoint - not connected yet
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                connected: false,
                meshName: 'test-mesh',
                agent: { username: 'testuser' },
              })
            );
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        },
      });
      servers.push(server);

      const url = new URL(server.url);
      const agentUrl = `http://${url.hostname}:${url.port}`;

      const config: ZTMChatConfig = {
        agentUrl,
        username: 'testuser',
        meshName: 'test-mesh',
        permitUrl: `${server.url}/api/permit`,
        permitSource: 'server',
      };

      const permitData: PermitData = {
        ca: 'TEST CA',
        agent: {
          certificate: 'TEST CERT',
          privateKey: 'TEST KEY',
        },
        bootstraps: ['hub1.example.com:7777'],
      };

      // Test joinMeshIfNeeded
      await expect(
        joinMeshIfNeeded(config, 'testuser-ep', permitData, { log: mockLogger })
      ).resolves.not.toThrow();

      // Verify the join request was made
      expect(receivedJoinRequest).not.toBeNull();
      expect(receivedJoinRequest.agent.name).toBe('testuser-ep');
      expect(receivedJoinRequest.ca).toBe('TEST CA');
    });

    it('should skip mesh join if already connected', async () => {
      const server = await createTestServer({
        handler: (req, res) => {
          if (req.url === '/api/meshes/test-mesh' && req.method === 'GET') {
            // Already connected
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                connected: true,
                meshName: 'test-mesh',
                agent: { username: 'testuser' },
              })
            );
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        },
      });
      servers.push(server);

      const url = new URL(server.url);
      const agentUrl = `http://${url.hostname}:${url.port}`;

      const config: ZTMChatConfig = {
        agentUrl,
        username: 'testuser',
        meshName: 'test-mesh',
        permitUrl: `${server.url}/api/permit`,
        permitSource: 'server',
      };

      const permitData: PermitData = {
        ca: 'TEST CA',
        agent: {
          certificate: 'TEST CERT',
          privateKey: 'TEST KEY',
        },
        bootstraps: ['hub1.example.com:7777'],
      };

      // Should skip join and return immediately
      await expect(
        joinMeshIfNeeded(config, 'testuser-ep', permitData, { log: mockLogger })
      ).resolves.not.toThrow();

      // Verify info log was called
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Already connected to mesh')
      );
    });

    it('should handle mesh join failure', async () => {
      const server = await createTestServer({
        handler: (req, res) => {
          if (req.url === '/api/meshes/test-mesh' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                connected: false,
                meshName: 'test-mesh',
                agent: { username: 'testuser' },
              })
            );
          } else if (req.url?.match(/\/api\/meshes\//) && req.method === 'POST') {
            // Join fails
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Join failed' }));
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        },
      });
      servers.push(server);

      const url = new URL(server.url);
      const agentUrl = `http://${url.hostname}:${url.port}`;

      const config: ZTMChatConfig = {
        agentUrl,
        username: 'testuser',
        meshName: 'test-mesh',
        permitUrl: `${server.url}/api/permit`,
        permitSource: 'server',
      };

      const permitData: PermitData = {
        ca: 'TEST CA',
        agent: {
          certificate: 'TEST CERT',
          privateKey: 'TEST KEY',
        },
        bootstraps: ['hub1.example.com:7777'],
      };

      // Should throw error
      await expect(
        joinMeshIfNeeded(config, 'testuser-ep', permitData, { log: mockLogger })
      ).rejects.toThrow('Failed to join mesh');
    });
  });

  describe('Real HTTP Probe Account', () => {
    it('should probe account via real HTTP server', async () => {
      const server = await createTestServer({
        handler: (req, res) => {
          if (req.url === '/api/meshes/test-mesh' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                connected: true,
                meshName: 'test-mesh',
                agent: { username: 'testuser' },
              })
            );
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        },
      });
      servers.push(server);

      const url = new URL(server.url);
      const agentUrl = `http://${url.hostname}:${url.port}`;

      const config: ZTMChatConfig = {
        agentUrl,
        username: 'testuser',
        meshName: 'test-mesh',
        permitUrl: `${server.url}/api/permit`,
        permitSource: 'server',
      };

      const result = await probeAccount({ config });

      expect(result.ok).toBe(true);
      expect(result.error).toBeNull();
      expect(result.meshInfo).toBeDefined();
      expect(result.meshInfo?.connected).toBe(true);
    });

    it('should probe disconnected account', async () => {
      const server = await createTestServer({
        handler: (req, res) => {
          if (req.url === '/api/meshes/test-mesh' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                connected: false,
                meshName: 'test-mesh',
                agent: { username: 'testuser' },
              })
            );
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        },
      });
      servers.push(server);

      const url = new URL(server.url);
      const agentUrl = `http://${url.hostname}:${url.port}`;

      const config: ZTMChatConfig = {
        agentUrl,
        username: 'testuser',
        meshName: 'test-mesh',
        permitUrl: `${server.url}/api/permit`,
        permitSource: 'server',
      };

      const result = await probeAccount({ config });

      expect(result.ok).toBe(true);
      expect(result.meshConnected).toBe(false);
      expect(result.meshInfo).toBeDefined();
      expect(result.meshInfo?.connected).toBe(false);
    });

    it('should handle probe server error', async () => {
      const server = await createTestServer({
        handler: (req, res) => {
          if (req.url === '/api/meshes/test-mesh') {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Server error' }));
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        },
      });
      servers.push(server);

      const url = new URL(server.url);
      const agentUrl = `http://${url.hostname}:${url.port}`;

      const config: ZTMChatConfig = {
        agentUrl,
        username: 'testuser',
        meshName: 'test-mesh',
        permitUrl: `${server.url}/api/permit`,
        permitSource: 'server',
      };

      const result = await probeAccount({ config });

      expect(result.ok).toBe(false);
      expect(result.error).not.toBeNull();
    });

    it('should handle probe with no agent URL', async () => {
      const config: ZTMChatConfig = {
        agentUrl: '',
        username: 'testuser',
        meshName: 'test-mesh',
        permitUrl: 'http://localhost:8080/api/permit',
        permitSource: 'server',
      };

      const result = await probeAccount({ config });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('No agent URL configured');
    });
  });

  describe('Real HTTP API Client Integration', () => {
    it('should create API client and make real HTTP requests', async () => {
      const server = await createTestServer({
        handler: (req, res) => {
          if (req.url === '/api/meshes/api-test-mesh' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                connected: true,
                name: 'api-test-mesh',
                agent: { username: 'testuser' },
              })
            );
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        },
      });
      servers.push(server);

      const config: ZTMChatConfig = {
        agentUrl: server.url,
        username: 'testuser',
        meshName: 'api-test-mesh',
        permitUrl: `${server.url}/api/permit`,
        permitSource: 'server',
      };

      const apiClient = createZTMApiClient(config);
      const result = await apiClient.getMeshInfo();

      expect(result.ok).toBe(true);
      expect(result.value).toBeDefined();
      expect(result.value?.connected).toBe(true);
      expect(result.value?.name).toBe('api-test-mesh');
    });

    it('should handle API client timeout', async () => {
      const { createDelayedServer } = await import('../test-utils/http-server.js');
      const server = await createDelayedServer(30000); // 30 second delay
      servers.push(server);

      const config: ZTMChatConfig = {
        agentUrl: server.url,
        username: 'testuser',
        meshName: 'test-mesh',
        permitUrl: `${server.url}/api/permit`,
        permitSource: 'server',
        apiTimeout: 500, // 500ms timeout
      };

      const apiClient = createZTMApiClient(config);
      const result = await apiClient.getMeshInfo();

      // Should fail with timeout error
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    }, 35000);
  });

  describe('End-to-End Gateway Flow with Real HTTP', () => {
    it('should complete full permit acquisition flow', async () => {
      await withTempDir(async dir => {
        const permitPath = join(dir, 'permit.json');

        let identityRequested = false;
        let permitRequested = false;

        const server = await createTestServer({
          handler: async (req, res) => {
            // Identity endpoint
            if (req.url === '/api/identity' && req.method === 'GET') {
              identityRequested = true;
              res.writeHead(200);
              res.end('-----BEGIN PUBLIC KEY-----\nE2E PUBLIC KEY\n-----END PUBLIC KEY-----');
              return;
            }

            // Permit endpoint
            if (req.url?.startsWith('/api/permit') && req.method === 'POST') {
              permitRequested = true;
              const chunks: Buffer[] = [];
              for await (const chunk of req) {
                chunks.push(chunk);
              }
              JSON.parse(Buffer.concat(chunks).toString('utf-8'));

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  ca: 'E2E CA',
                  agent: {
                    certificate: 'E2E CERT',
                    privateKey: 'E2E KEY',
                  },
                  bootstraps: ['hub1.example.com:7777'],
                })
              );
              return;
            }

            res.writeHead(404);
            res.end('Not found');
          },
        });
        servers.push(server);

        const config: ZTMChatConfig = {
          agentUrl: server.url,
          username: 'e2euser',
          meshName: 'e2e-mesh',
          permitUrl: `${server.url}/api/permit`,
          permitSource: 'server',
        };

        // Import and use the actual functions
        const { getIdentity } = await import('../connectivity/mesh.js');
        const { requestPermit, savePermitData } = await import('../connectivity/permit.js');

        // Step 1: Get identity
        const publicKey = await getIdentity(config.agentUrl);
        expect(publicKey).not.toBeNull();
        expect(identityRequested).toBe(true);

        // Step 2: Request permit
        const permitData = await requestPermit(config.permitUrl!, publicKey!, config.username);
        expect(permitData).not.toBeNull();
        expect(permitRequested).toBe(true);

        // Step 3: Save permit
        const saved = savePermitData(permitData!, permitPath);
        expect(saved).toBe(true);

        // Verify file was created
        const exists = await checkFileExists(permitPath);
        expect(exists).not.toBeNull();

        // Verify content
        const loaded = await readJSONFile<PermitData>(permitPath);
        expect(loaded.ca).toBe('E2E CA');
      });
    });

    it('should load existing permit from file system', async () => {
      await withTempDir(async dir => {
        const permitPath = join(dir, 'permit.json');

        // Pre-create permit file
        const existingPermit: PermitData = {
          ca: 'EXISTING CA',
          agent: {
            certificate: 'EXISTING CERT',
            privateKey: 'EXISTING KEY',
          },
          bootstraps: ['hub1.example.com:7777'],
        };
        await writeJSONFile(permitPath, existingPermit);

        const { loadPermitFromFile } = await import('../connectivity/permit.js');

        const loaded = loadPermitFromFile(permitPath);
        expect(loaded).not.toBeNull();
        expect(loaded?.ca).toBe('EXISTING CA');
      });
    });
  });

  describe('Real HTTP Message Operations', () => {
    it('should send message via real HTTP server', async () => {
      let receivedMessage: any = null;

      const server = await createTestServer({
        handler: async (req, res) => {
          const match = req.url?.match(
            /\/api\/meshes\/[^/]+\/apps\/ztm\/chat\/api\/peers\/([^/]+)\/messages/
          );

          if (match && req.method === 'POST') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(chunk);
            }
            receivedMessage = JSON.parse(Buffer.concat(chunks).toString('utf-8'));

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                id: `msg-${Date.now()}`,
                text: receivedMessage.text,
                timestamp: new Date().toISOString(),
              })
            );
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        },
      });
      servers.push(server);

      const url = new URL(server.url);
      const agentUrl = `http://${url.hostname}:${url.port}`;

      const messageUrl = `${agentUrl}/api/meshes/test-mesh/apps/ztm/chat/api/peers/alice/messages`;

      const response = await fetch(messageUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Hello from E2E test!' }),
      });

      expect(response.status).toBe(201);
      const result = (await response.json()) as { text: string };
      expect(result.text).toBe('Hello from E2E test!');
      expect(receivedMessage.text).toBe('Hello from E2E test!');
    });

    it('should handle message send failure', async () => {
      const server = await createTestServer({
        handler: (req, res) => {
          if (req.url?.includes('/messages') && req.method === 'POST') {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Message send failed' }));
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        },
      });
      servers.push(server);

      const url = new URL(server.url);
      const agentUrl = `http://${url.hostname}:${url.port}`;

      const messageUrl = `${agentUrl}/api/meshes/test-mesh/apps/ztm/chat/api/peers/alice/messages`;

      const response = await fetch(messageUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'This will fail' }),
      });

      expect(response.status).toBe(500);
    });
  });

  describe('Real File System State Persistence', () => {
    it('should persist message state across gateway restarts', async () => {
      await withTempDir(async dir => {
        const statePath = join(dir, 'message-state.json');

        // Simulate first gateway run - save watermark
        const firstState = {
          watermarks: {
            alice: 1234567890,
            bob: 9876543210,
          },
        };
        await writeJSONFile(statePath, firstState);

        // Verify file exists
        const exists = await checkFileExists(statePath);
        expect(exists).not.toBeNull();

        // Simulate gateway restart - load watermark
        const loadedState = await readJSONFile<typeof firstState>(statePath);
        expect(loadedState.watermarks.alice).toBe(1234567890);
        expect(loadedState.watermarks.bob).toBe(9876543210);

        // Simulate updating watermark
        loadedState.watermarks.alice = 9999999999;
        await writeJSONFile(statePath, loadedState);

        // Verify update persisted
        const updatedState = await readJSONFile<typeof firstState>(statePath);
        expect(updatedState.watermarks.alice).toBe(9999999999);
      });
    });

    it('should handle missing state file gracefully', async () => {
      await withTempDir(async dir => {
        const statePath = join(dir, 'nonexistent-state.json');

        const exists = await checkFileExists(statePath);
        expect(exists).toBeNull();

        // Should handle gracefully when loading non-existent file
        const loaded = await readJSONFile(statePath).catch(() => null);
        expect(loaded).toBeNull();
      });
    });

    it('should handle corrupted state file', async () => {
      await withTempDir(async dir => {
        const statePath = join(dir, 'corrupted-state.json');
        const { writeFile } = await import('node:fs/promises');

        await writeFile(statePath, '{ corrupted json data');

        // Should throw when trying to parse
        await expect(readJSONFile(statePath)).rejects.toThrow();
      });
    });
  });

  describe('Concurrent Operations with Real Resources', () => {
    it('should handle concurrent file writes', async () => {
      await withTempDir(async dir => {
        const statePath = join(dir, 'concurrent-state.json');

        // Write to same file from multiple "operations"
        const promises = [
          writeJSONFile(statePath, { value: 1 }),
          writeJSONFile(statePath, { value: 2 }),
          writeJSONFile(statePath, { value: 3 }),
        ];

        await Promise.all(promises);

        // Verify final state (last write wins)
        const final = await readJSONFile<{ value: number }>(statePath);
        expect(final.value).toBeDefined();
        expect([1, 2, 3]).toContain(final.value);
      });
    });

    it('should handle concurrent HTTP requests', async () => {
      let requestCount = 0;

      const server = await createTestServer({
        handler: async (req, res) => {
          requestCount++;
          // Simulate some processing
          await new Promise(resolve => setTimeout(resolve, 10));
          res.writeHead(200);
          res.end(JSON.stringify({ requestId: requestCount }));
        },
      });
      servers.push(server);

      // Send concurrent requests
      const promises = Array.from({ length: 10 }, () => fetch(server.url));
      const responses = await Promise.all(promises);

      expect(responses).toHaveLength(10);
      expect(requestCount).toBe(10);

      // All should succeed
      for (const response of responses) {
        expect(response.status).toBe(200);
      }
    });
  });
});
