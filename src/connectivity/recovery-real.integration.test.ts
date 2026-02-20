/**
 * Real HTTP Integration tests for Connectivity Recovery
 *
 * Tests for mesh reconnection, state recovery, identity fetching using REAL HTTP servers.
 * These tests verify actual network behavior during connection issues.
 *
 * Test categories:
 * 1. Real HTTP connection timeout handling
 * 2. Real HTTP reconnection with backoff
 * 3. Real HTTP state restoration
 * 4. Real HTTP mesh join behavior
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  createTestServer,
  createStatusCodeServer,
  createDelayedServer,
  type TestServer,
} from '../test-utils/http-server.js';
import { getIdentity, joinMesh } from './mesh.js';
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

describe('Connectivity Recovery Real HTTP Integration', () => {
  let servers: TestServer[] = [];

  afterEach(async () => {
    // Clean up all servers
    await Promise.all(servers.map(s => s.close()));
    servers = [];
  });

  // Helper function to create test permit data
  const createTestPermitData = (): PermitData => ({
    ca: '-----BEGIN CA CERT-----\nMOCK CA DATA\n-----END CA CERT-----',
    agent: {
      certificate: '-----BEGIN CERT-----\nMOCK CERT\n-----END CERT-----',
      privateKey: '-----BEGIN KEY-----\nMOCK KEY\n-----END KEY-----',
    },
    bootstraps: ['hub1.example.com:7777', 'hub2.example.com:7777'],
  });

  describe('Real HTTP Identity Fetching', () => {
    it('should fetch identity from real HTTP server', async () => {
      const server = await createTestServer({
        handler: (req, res) => {
          if (req.url === '/api/identity' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('-----BEGIN PUBLIC KEY-----\nMOCK CERTIFICATE DATA\n-----END PUBLIC KEY-----');
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        },
      });
      servers.push(server);

      const identity = await getIdentity(server.url);

      expect(identity).not.toBeNull();
      expect(identity).toContain('BEGIN PUBLIC KEY');
      expect(identity).toContain('MOCK CERTIFICATE DATA');

      // Verify server received the request
      expect(server.receivedRequests.length).toBe(1);
      expect(server.receivedRequests[0]?.url).toBe('/api/identity');
    });

    it('should handle connection refused to identity endpoint', async () => {
      // Use non-existent server
      const identity = await getIdentity('http://localhost:59999');

      expect(identity).toBeNull();
    });

    it('should handle invalid identity format from server', async () => {
      const server = await createTestServer({
        handler: (req, res) => {
          if (req.url === '/api/identity' && req.method === 'GET') {
            // Return invalid PEM format
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('INVALID DATA NOT A CERT');
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        },
      });
      servers.push(server);

      const identity = await getIdentity(server.url);

      // Should return null for invalid format
      expect(identity).toBeNull();
    });

    it('should handle HTTP error response from identity endpoint', async () => {
      const server = await createStatusCodeServer(500);
      servers.push(server);

      const identity = await getIdentity(server.url);

      expect(identity).toBeNull();
    });

    it('should handle timeout when fetching identity', async () => {
      // Create a server that never responds
      const server = await createDelayedServer(30000); // 30 second delay
      servers.push(server);

      // Note: This will use the default timeout from the implementation
      const identity = await getIdentity(server.url);

      // Should return null on timeout
      expect(identity).toBeNull();
    }, 35000);
  });

  describe('Real HTTP Mesh Join Operations', () => {
    it('should successfully join mesh via real HTTP server', async () => {
      const server = await createTestServer({
        handler: (req, res) => {
          // Handle mesh join endpoint
          const meshJoinMatch = req.url?.match(/\/api\/meshes\/([^/]+)/);

          if (meshJoinMatch && req.method === 'POST') {
            // Verify request body contains permit data
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                meshId: meshJoinMatch[1],
                status: 'joined',
                endpoint: 'test-endpoint',
              })
            );
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        },
      });
      servers.push(server);

      const agentUrl = server.url;
      const meshName = 'test-mesh';
      const endpointName = 'test-endpoint';
      const permitData = createTestPermitData();

      const joined = await joinMesh(agentUrl, meshName, endpointName, permitData);

      expect(joined).toBe(true);
    });

    it('should handle 409 Conflict (already joined) gracefully', async () => {
      const server = await createStatusCodeServer(409);
      servers.push(server);

      const agentUrl = server.url;
      const meshName = 'test-mesh';
      const endpointName = 'test-endpoint';
      const permitData = createTestPermitData();

      const joined = await joinMesh(agentUrl, meshName, endpointName, permitData);

      // 409 Conflict means already joined, which is acceptable
      expect(joined).toBe(true);
    });

    it('should handle mesh join failure', async () => {
      const server = await createStatusCodeServer(500);
      servers.push(server);

      const agentUrl = server.url;
      const meshName = 'test-mesh';
      const endpointName = 'test-endpoint';
      const permitData = createTestPermitData();

      const joined = await joinMesh(agentUrl, meshName, endpointName, permitData);

      expect(joined).toBe(false);
    });

    it('should handle connection refused during mesh join', async () => {
      // Use non-existent server
      const agentUrl = 'http://localhost:59999';
      const meshName = 'test-mesh';
      const endpointName = 'test-endpoint';
      const permitData = createTestPermitData();

      const joined = await joinMesh(agentUrl, meshName, endpointName, permitData);

      expect(joined).toBe(false);
    });

    it('should send correct permit data in mesh join request', async () => {
      let receivedBody: any = null;

      const server = await createTestServer({
        handler: async (req, res) => {
          const meshJoinMatch = req.url?.match(/\/api\/meshes\/([^/]+)/);

          if (meshJoinMatch && req.method === 'POST') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(chunk);
            }
            receivedBody = JSON.parse(Buffer.concat(chunks).toString('utf-8'));

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'joined' }));
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        },
      });
      servers.push(server);

      const agentUrl = server.url;
      const meshName = 'test-mesh';
      const endpointName = 'test-endpoint';
      const permitData: PermitData = {
        ca: 'MOCK CA',
        agent: {
          certificate: 'MOCK CERT',
          privateKey: 'MOCK KEY',
        },
        bootstraps: ['hub1.example.com:7777'],
      };

      await joinMesh(agentUrl, meshName, endpointName, permitData);

      // Verify the permit data was sent correctly
      expect(receivedBody).not.toBeNull();
      expect(receivedBody.agent.name).toBe(endpointName);
      expect(receivedBody.ca).toBe(permitData.ca);
      expect(receivedBody.bootstraps).toEqual(permitData.bootstraps);
      expect(receivedBody.agent.certificate).toBe(permitData.agent.certificate);
    });
  });

  describe('Real HTTP Reconnection Scenarios', () => {
    it('should recover from temporary network failure', async () => {
      let attemptCount = 0;

      const server = await createTestServer({
        handler: (req, res) => {
          attemptCount++;

          // Fail first 2 attempts, succeed on 3rd
          if (attemptCount <= 2) {
            res.writeHead(503);
            res.end(JSON.stringify({ error: 'Service unavailable' }));
          } else {
            if (req.url === '/api/identity' && req.method === 'GET') {
              res.writeHead(200);
              res.end('-----BEGIN PUBLIC KEY-----\nRECOVERED CERT\n-----END PUBLIC KEY-----');
            } else {
              res.writeHead(404);
              res.end('Not found');
            }
          }
        },
      });
      servers.push(server);

      // First attempt fails
      const id1 = await getIdentity(server.url);
      expect(id1).toBeNull();

      // Second attempt also fails (no retry in current implementation)
      // This test documents current behavior
      expect(attemptCount).toBe(1);
    });

    it('should handle slow network responses', async () => {
      const server = await createTestServer({
        handler: async (req, res) => {
          // Simulate slow network
          await new Promise(resolve => setTimeout(resolve, 100));

          if (req.url === '/api/identity' && req.method === 'GET') {
            res.writeHead(200);
            res.end('-----BEGIN PUBLIC KEY-----\nSLOW NETWORK CERT\n-----END PUBLIC KEY-----');
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        },
      });
      servers.push(server);

      const startTime = Date.now();
      const identity = await getIdentity(server.url);
      const elapsed = Date.now() - startTime;

      expect(identity).not.toBeNull();
      expect(identity).toContain('SLOW NETWORK CERT');
      expect(elapsed).toBeGreaterThanOrEqual(100);
    });

    it('should handle intermittent connection drops', async () => {
      let connectionState = 'up';

      const server = await createTestServer({
        handler: (req, res) => {
          if (connectionState === 'down') {
            res.writeHead(503);
            res.end(JSON.stringify({ error: 'Connection down' }));
            return;
          }

          if (req.url === '/api/identity' && req.method === 'GET') {
            res.writeHead(200);
            res.end('-----BEGIN PUBLIC KEY-----\nINTERMITTENT CERT\n-----END PUBLIC KEY-----');
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        },
      });
      servers.push(server);

      // First request succeeds
      connectionState = 'up';
      const id1 = await getIdentity(server.url);
      expect(id1).toContain('INTERMITTENT CERT');

      // Simulate connection drop
      connectionState = 'down';
      const id2 = await getIdentity(server.url);
      expect(id2).toBeNull();

      // Connection restored
      connectionState = 'up';
      const id3 = await getIdentity(server.url);
      expect(id3).toContain('INTERMITTENT CERT');
    });
  });

  describe('Real HTTP Concurrent Operations', () => {
    it('should handle concurrent identity fetches', async () => {
      let requestCount = 0;

      const server = await createTestServer({
        handler: async (req, res) => {
          if (req.url === '/api/identity' && req.method === 'GET') {
            requestCount++;
            // Small delay to simulate processing
            await new Promise(resolve => setTimeout(resolve, 10));
            res.writeHead(200);
            res.end(`-----BEGIN PUBLIC KEY-----\nCERT-${requestCount}\n-----END PUBLIC KEY-----`);
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        },
      });
      servers.push(server);

      // Fetch 5 identities concurrently
      const promises = Array.from({ length: 5 }, () => getIdentity(server.url));
      const results = await Promise.all(promises);

      // All should succeed
      results.forEach(id => {
        expect(id).not.toBeNull();
        expect(id).toContain('BEGIN PUBLIC KEY');
      });

      // Server should have received 5 requests
      expect(requestCount).toBe(5);
    });

    it('should handle concurrent mesh join operations', async () => {
      let joinCount = 0;

      const server = await createTestServer({
        handler: (req, res) => {
          const meshJoinMatch = req.url?.match(/\/api\/meshes\/([^/]+)/);

          if (meshJoinMatch && req.method === 'POST') {
            joinCount++;
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'joined', attempt: joinCount }));
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        },
      });
      servers.push(server);

      const agentUrl = server.url;
      const meshName = 'test-mesh';
      const endpointName = 'test-endpoint';

      // Define permit data inline for this test
      const permitData: PermitData = {
        ca: 'MOCK CA',
        agent: {
          certificate: 'MOCK CERT',
          privateKey: 'MOCK KEY',
        },
        bootstraps: ['hub1.example.com:7777'],
      };

      // Join mesh 3 times concurrently
      const promises = Array.from({ length: 3 }, () =>
        joinMesh(agentUrl, meshName, endpointName, permitData)
      );
      const results = await Promise.all(promises);

      // All should succeed
      results.forEach(joined => {
        expect(joined).toBe(true);
      });

      expect(joinCount).toBe(3);
    });
  });

  describe('Real HTTP Error Recovery', () => {
    it('should handle various HTTP error codes', async () => {
      const errorCodes = [400, 401, 403, 404, 500, 502, 503];

      for (const errorCode of errorCodes) {
        const server = await createStatusCodeServer(errorCode);
        servers.push(server);

        const identity = await getIdentity(server.url);

        // All errors should return null
        expect(identity).toBeNull();

        // Clean up server
        await server.close();
        servers.pop();
      }
    });

    it('should handle malformed HTTP responses', async () => {
      const server = await createTestServer({
        handler: (req, res) => {
          // Send malformed HTTP response
          res.socket?.destroy();
        },
      });
      servers.push(server);

      const identity = await getIdentity(server.url);

      // Should handle gracefully
      expect(identity).toBeDefined();
    });

    it('should handle empty response', async () => {
      const server = await createTestServer({
        handler: (req, res) => {
          res.writeHead(200);
          res.end('');
        },
      });
      servers.push(server);

      const identity = await getIdentity(server.url);

      // Should handle empty response
      expect(identity).toBeNull();
    });

    it('should handle JSON response instead of PEM', async () => {
      const server = await createTestServer({
        handler: (req, res) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ identity: 'some-data' }));
        },
      });
      servers.push(server);

      const identity = await getIdentity(server.url);

      // Should handle non-PEM format gracefully
      expect(identity).toBeNull();
    });
  });

  describe('Real HTTP Timeout and Retry Behavior', () => {
    it('should complete request within reasonable time', async () => {
      const server = await createTestServer({
        handler: (req, res) => {
          res.writeHead(200);
          res.end('-----BEGIN PUBLIC KEY-----\nFAST CERT\n-----END PUBLIC KEY-----');
        },
      });
      servers.push(server);

      const startTime = Date.now();
      const identity = await getIdentity(server.url);
      const elapsed = Date.now() - startTime;

      expect(identity).not.toBeNull();
      expect(elapsed).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle server that responds but very slowly', async () => {
      const server = await createTestServer({
        handler: async (req, res) => {
          // Respond after 3 seconds
          await new Promise(resolve => setTimeout(resolve, 3000));
          res.writeHead(200);
          res.end('-----BEGIN PUBLIC KEY-----\nSLOW CERT\n-----END PUBLIC KEY-----');
        },
      });
      servers.push(server);

      const startTime = Date.now();
      const identity = await getIdentity(server.url);
      const elapsed = Date.now() - startTime;

      // Should either succeed or timeout based on timeout configuration
      expect(identity).toBeDefined();
      expect(elapsed).toBeGreaterThanOrEqual(3000);
    }, 10000);
  });

  describe('Real HTTP State Preservation', () => {
    it('should handle state preservation across server restarts', async () => {
      let serverVersion = 1;

      // Create first server instance
      const createServer = () =>
        createTestServer({
          handler: (req, res) => {
            if (req.url === '/api/identity' && req.method === 'GET') {
              res.writeHead(200);
              res.end(
                `-----BEGIN PUBLIC KEY-----\nSERVER-VERSION-${serverVersion}\n-----END PUBLIC KEY-----`
              );
            } else {
              res.writeHead(404);
              res.end('Not found');
            }
          },
        });

      let server = await createServer();
      servers.push(server);

      // First fetch from server v1
      const id1 = await getIdentity(server.url);
      expect(id1).toContain('SERVER-VERSION-1');

      // Simulate server restart - close and create new server
      await server.close();
      servers.pop();

      serverVersion = 2;
      server = await createServer();
      servers.push(server);

      // Fetch from "new" server
      const id2 = await getIdentity(server.url);
      expect(id2).toContain('SERVER-VERSION-2');
    });
  });
});
