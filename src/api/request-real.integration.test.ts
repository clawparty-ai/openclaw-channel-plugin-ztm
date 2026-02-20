/**
 * Real HTTP Integration tests for API Request
 *
 * Tests for actual HTTP requests using real HTTP servers.
 * These tests verify network behavior, timeout handling, and retry logic.
 *
 * Test categories:
 * 1. Real HTTP server communication
 * 2. Timeout scenarios
 * 3. Error recovery with real network failures
 * 4. Concurrent request handling
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  createTestServer,
  createZTMAgentMock,
  createStatusCodeServer,
  createDelayedServer,
  createEchoServer,
  type TestServer,
} from '../test-utils/http-server.js';

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

describe('API Request Real HTTP Integration', () => {
  let servers: TestServer[] = [];

  afterEach(async () => {
    // Clean up all servers
    await Promise.all(servers.map(s => s.close()));
    servers = [];
  });

  describe('Real HTTP Server Communication', () => {
    it('should make successful GET request to real server', async () => {
      const server = await createTestServer({
        handler: (_req, res) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Hello from real server!' }));
        },
      });
      servers.push(server);

      // Use native fetch for direct testing
      const response = await fetch(`${server.url}/api/test`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ message: 'Hello from real server!' });

      // Verify server received the request
      expect(server.receivedRequests).toHaveLength(1);
      expect(server.receivedRequests[0]?.method).toBe('GET');
      expect(server.receivedRequests[0]?.url).toBe('/api/test');
    });

    it('should make POST request with body', async () => {
      const server = await createEchoServer();
      servers.push(server);

      const testBody = JSON.stringify({ user: 'alice', message: 'Hello' });
      const response = await fetch(server.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: testBody,
      });

      const echoed = (await response.json()) as { method: string; body: string };

      expect(echoed.method).toBe('POST');
      expect(echoed.body).toBe(testBody);
    });

    it('should handle different status codes', async () => {
      const notFoundServer = await createStatusCodeServer(404);
      servers.push(notFoundServer);

      const response = await fetch(notFoundServer.url);
      expect(response.status).toBe(404);

      const errorServer = await createStatusCodeServer(500);
      servers.push(errorServer);

      const errorResponse = await fetch(errorServer.url);
      expect(errorResponse.status).toBe(500);
    });

    it('should preserve request headers', async () => {
      const server = await createEchoServer();
      servers.push(server);

      const customHeaders = {
        'X-Custom-Header': 'custom-value',
        Authorization: 'Bearer token123',
        'User-Agent': 'TestAgent/1.0',
      };

      const response = await fetch(server.url, {
        headers: customHeaders,
      });

      const echoed = (await response.json()) as { headers: Record<string, string> };

      // Verify headers were sent
      expect(echoed.headers['x-custom-header']).toBe('custom-value');
      expect(echoed.headers['authorization']).toBe('Bearer token123');
    });
  });

  describe('Timeout Scenarios', () => {
    it('should timeout on slow response', async () => {
      // Create a server that takes 5 seconds to respond
      const server = await createDelayedServer(5000);
      servers.push(server);

      // Use AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 500); // 500ms timeout

      try {
        const response = await fetch(server.url, {
          signal: controller.signal,
        });
        await response.json();
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        // AbortError is a DOMException in modern Node.js
        expect(error).toBeInstanceOf(DOMException);
        expect((error as DOMException).name).toBe('AbortError');
      } finally {
        clearTimeout(timeoutId);
      }
    }, 10000);

    it('should complete fast request before timeout', async () => {
      const server = await createTestServer({
        handler: (_req, res) => {
          // Respond quickly
          res.writeHead(200);
          res.end(JSON.stringify({ fast: true }));
        },
      });
      servers.push(server);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      try {
        const response = await fetch(server.url, {
          signal: controller.signal,
        });
        const data = await response.json();

        expect(data).toEqual({ fast: true });
      } finally {
        clearTimeout(timeoutId);
      }
    });
  });

  describe('Error Recovery with Real Network', () => {
    it('should handle connection refused', async () => {
      // Try to connect to a port that's not listening
      try {
        await fetch('http://localhost:59999', {
          signal: AbortSignal.timeout(1000),
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        // Connection refused throws TypeError (or AggregateError in newer Node.js)
        expect(error).toBeInstanceOf(TypeError);
      }
    });

    it('should retry failed requests to real server', async () => {
      let attemptCount = 0;

      const server = await createTestServer({
        handler: (req, res) => {
          attemptCount++;
          // Fail first 2 attempts, succeed on 3rd
          if (attemptCount < 3) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Server error' }));
          } else {
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, attempt: attemptCount }));
          }
        },
      });
      servers.push(server);

      // Manual retry logic
      let success = false;
      for (let i = 0; i < 5; i++) {
        try {
          const response = await fetch(server.url);
          if (response.ok) {
            const data = (await response.json()) as { success: boolean };
            expect(data.success).toBe(true);
            success = true;
            break;
          }
        } catch {
          // Retry on error
        }
        // Small delay between retries
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      expect(success).toBe(true);
      expect(attemptCount).toBe(3);
    });

    it('should handle malformed JSON responses', async () => {
      const server = await createTestServer({
        handler: (_req, res) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{ invalid json }');
        },
      });
      servers.push(server);

      try {
        const response = await fetch(server.url);
        await response.json();
        // Should throw
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(SyntaxError);
      }
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle multiple concurrent requests', async () => {
      const requestCount = 10;
      let serverRequestCount = 0;

      const server = await createTestServer({
        handler: async (req, res) => {
          serverRequestCount++;
          // Simulate some processing time
          await new Promise(resolve => setTimeout(resolve, 10));
          res.writeHead(200);
          res.end(JSON.stringify({ request: serverRequestCount }));
        },
      });
      servers.push(server);

      // Make concurrent requests
      const promises = Array.from({ length: requestCount }, () =>
        fetch(server.url).then(r => r.json())
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(requestCount);
      expect(serverRequestCount).toBe(requestCount);
    });

    it('should not mix up responses', async () => {
      const server = await createTestServer({
        handler: (req, res) => {
          // Extract request ID from URL
          const url = new URL(req.url || '', `http://${req.headers.host}`);
          const requestId = url.searchParams.get('id');

          res.writeHead(200);
          res.end(JSON.stringify({ responseId: requestId }));
        },
      });
      servers.push(server);

      // Make requests with different IDs
      const promises = [1, 2, 3, 4, 5].map(id =>
        fetch(`${server.url}?id=${id}`).then(r => r.json() as Promise<{ responseId: string }>)
      );

      const results = await Promise.all(promises);

      // Verify each response matches its request ID
      results.forEach((result, index) => {
        expect(result.responseId).toBe(String(index + 1));
      });
    });
  });

  describe('ZTM Agent Mock Server', () => {
    it('should communicate with mock ZTM Agent', async () => {
      const agent = await createZTMAgentMock();
      servers.push(agent);

      // Test messages endpoint
      const messagesResponse = await fetch(`${agent.url}/api/v1/messages`);
      expect(messagesResponse.status).toBe(200);
      const messages = await messagesResponse.json();
      expect(messages).toHaveProperty('messages');

      // Test send message endpoint
      const sendResponse = await fetch(`${agent.url}/api/v1/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Test message' }),
      });
      expect(sendResponse.status).toBe(201);
      const result = await sendResponse.json();
      expect(result).toHaveProperty('id');

      // Test status endpoint
      const statusResponse = await fetch(`${agent.url}/api/v1/status`);
      expect(statusResponse.status).toBe(200);
      const status = (await statusResponse.json()) as { connected: boolean };
      expect(status.connected).toBe(true);
    });

    it('should handle ZTM Agent errors', async () => {
      const agent = await createZTMAgentMock();
      servers.push(agent);

      // Test 404 for unknown endpoint
      const response = await fetch(`${agent.url}/api/v1/unknown`);
      expect(response.status).toBe(404);
    });
  });

  describe('Request Size Limits', () => {
    it('should handle large request bodies', async () => {
      const server = await createTestServer({
        handler: async (req, res) => {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          const body = Buffer.concat(chunks).toString('utf-8');

          res.writeHead(200);
          res.end(JSON.stringify({ receivedBytes: body.length }));
        },
      });
      servers.push(server);

      // Create a large payload (100KB)
      const largePayload = 'x'.repeat(100 * 1024);

      const response = await fetch(server.url, {
        method: 'POST',
        body: largePayload,
      });

      const data = (await response.json()) as { receivedBytes: number };
      expect(data.receivedBytes).toBe(100 * 1024);
    });

    it('should handle large response bodies', async () => {
      const server = await createTestServer({
        handler: (req, res) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          // Send a large response (50KB)
          const largeData = { data: 'x'.repeat(50 * 1024) };
          res.end(JSON.stringify(largeData));
        },
      });
      servers.push(server);

      const response = await fetch(server.url);
      const data = (await response.json()) as { data: string };

      expect(data.data).toHaveLength(50 * 1024);
    });
  });

  describe('HTTP Methods', () => {
    it('should handle GET requests', async () => {
      const server = await createEchoServer();
      servers.push(server);

      const response = await fetch(server.url, { method: 'GET' });
      const data = (await response.json()) as { method: string };

      expect(data.method).toBe('GET');
    });

    it('should handle POST requests', async () => {
      const server = await createEchoServer();
      servers.push(server);

      const response = await fetch(server.url, {
        method: 'POST',
        body: JSON.stringify({ test: 'data' }),
      });
      const data = (await response.json()) as { method: string };

      expect(data.method).toBe('POST');
    });

    it('should handle PUT requests', async () => {
      const server = await createEchoServer();
      servers.push(server);

      const response = await fetch(server.url, {
        method: 'PUT',
        body: JSON.stringify({ test: 'data' }),
      });
      const data = (await response.json()) as { method: string };

      expect(data.method).toBe('PUT');
    });

    it('should handle DELETE requests', async () => {
      const server = await createEchoServer();
      servers.push(server);

      const response = await fetch(server.url, { method: 'DELETE' });
      const data = (await response.json()) as { method: string };

      expect(data.method).toBe('DELETE');
    });
  });
});
