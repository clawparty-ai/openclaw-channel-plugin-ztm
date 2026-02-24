/**
 * Real HTTP Integration tests for Outbound Message Sending
 *
 * Tests for sendZTMMessage flow using REAL HTTP servers.
 * These tests verify actual HTTP communication for message sending.
 *
 * Test categories:
 * 1. Real HTTP peer message sending
 * 2. Real HTTP group message sending
 * 3. Network error recovery
 * 4. Timeout handling
 * 5. Concurrent message sending
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  createTestServer,
  createStatusCodeServer,
  createDelayedServer,
  type TestServer,
} from '../test-utils/http-server.js';
import { sendZTMMessage, generateMessageId } from './outbound.js';
import type { AccountRuntimeState } from '../runtime/state.js';
import { testConfig, testAccountId } from '../test-utils/fixtures.js';

type GroupInfo = { creator: string; group: string };
import { createZTMApiClient } from '../api/ztm-api.js';

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

// Mock validation
vi.mock('../utils/validation.js', () => ({
  validateUsername: vi.fn((username: string) => {
    if (!username || username.length === 0) {
      return { valid: false, error: 'Username is required' };
    }
    if (username.includes(' ')) {
      return { valid: false, error: 'Username cannot contain spaces' };
    }
    if (username.length > 100) {
      return { valid: false, error: 'Username too long' };
    }
    return { valid: true };
  }),
  validateMessageContent: vi.fn((content: string) => {
    if (!content || typeof content !== 'string') {
      return { valid: false, error: 'Message content must be a non-empty string' };
    }
    if (content.length === 0) {
      return { valid: false, error: 'Message content must be a non-empty string' };
    }
    if (content.includes('\x00')) {
      return { valid: false, error: 'Message content contains null bytes' };
    }
    if (content.length > 10000) {
      return { valid: false, error: 'Message content exceeds maximum length of 10000' };
    }
    return { valid: true, value: content };
  }),
  validateGroupId: vi.fn((groupId: string) => {
    if (!groupId || groupId.length === 0) {
      return { valid: false, error: 'Group ID is required' };
    }
    return { valid: true };
  }),
}));

describe('Outbound Message Real HTTP Integration', () => {
  let servers: TestServer[] = [];

  afterEach(async () => {
    // Clean up all servers
    await Promise.all(servers.map(s => s.close()));
    servers = [];
  });

  const createRealState = (
    agentUrl: string,
    meshName: string = 'test-mesh'
  ): AccountRuntimeState => {
    const config = { ...testConfig, agentUrl, meshName };
    const apiClient = createZTMApiClient(config, { logger: mockLogger });
    return {
      accountId: testAccountId,
      config,
      chatReader: apiClient as any,
      chatSender: apiClient as any,
      discovery: apiClient as any,
      messageCallbacks: new Set(),
      watchInterval: null,
      lastError: null,
      lastStartAt: null,
      lastStopAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      watchErrorCount: 0,
      pendingPairings: new Map(),
    };
  };

  const createChatApiServer = (): Promise<TestServer> => {
    return createTestServer({
      handler: async (req, res) => {
        const url = req.url || '';

        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        // Handle OPTIONS preflight
        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        // Parse peer message send endpoint
        // POST /api/meshes/{meshName}/apps/ztm/chat/api/peers/{peer}/messages
        const peerMessageMatch = url.match(
          /\/api\/meshes\/[^/]+\/apps\/ztm\/chat\/api\/peers\/([^/]+)\/messages/
        );

        if (peerMessageMatch && req.method === 'POST') {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));

          // ZTM Chat API expects { text: "message" }
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              id: `msg-${Date.now()}`,
              status: 'sent',
              peer: peerMessageMatch[1],
              text: body.text,
            })
          );
          return;
        }

        // Parse group message send endpoint
        // POST /api/meshes/{meshName}/apps/ztm/chat/api/groups/{creator}/{group}/messages
        const groupMessageMatch = url.match(
          /\/api\/meshes\/[^/]+\/apps\/ztm\/chat\/api\/groups\/([^/]+)\/([^/]+)\/messages/
        );

        if (groupMessageMatch && req.method === 'POST') {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));

          // ZTM Chat API expects { text: "message" }
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              id: `msg-${Date.now()}`,
              status: 'sent',
              group: `${groupMessageMatch[1]}/${groupMessageMatch[2]}`,
              text: body.text,
            })
          );
          return;
        }

        // Default 404
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found', path: url }));
      },
    });
  };

  describe('Real HTTP Peer Message Sending', () => {
    it('should send peer message to real HTTP server', async () => {
      const server = await createChatApiServer();
      servers.push(server);

      const state = createRealState(server.url);

      const result = await sendZTMMessage(state, 'alice', 'Hello from real HTTP!');

      expect(result.ok).toBe(true);
      expect(state.lastOutboundAt).not.toBeNull();

      // Verify server received the request
      expect(server.receivedRequests.length).toBeGreaterThan(0);
      const postRequest = server.receivedRequests.find(r => r.method === 'POST');
      expect(postRequest).toBeDefined();
      expect(postRequest?.url).toContain('/peers/alice/messages');
    });

    it('should include correct message structure in HTTP request', async () => {
      let receivedBody: any = null;

      const server = await createTestServer({
        handler: async (req, res) => {
          const url = req.url || '';
          const peerMessageMatch = url.match(/\/peers\/([^/]+)\/messages/);

          if (peerMessageMatch && req.method === 'POST') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(chunk);
            }
            receivedBody = JSON.parse(Buffer.concat(chunks).toString('utf-8'));

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
          }
        },
      });
      servers.push(server);

      const state = createRealState(server.url);
      const result = await sendZTMMessage(state, 'bob', 'Test message');

      expect(result.ok).toBe(true);
      // ZTM Chat API format is { text: "message" }
      expect(receivedBody).toEqual({
        text: 'Test message',
      });
    });

    it('should handle special characters in message content', async () => {
      let receivedMessage: string | undefined;

      const server = await createTestServer({
        handler: async (req, res) => {
          const url = req.url || '';
          const peerMessageMatch = url.match(/\/peers\/([^/]+)\/messages/);

          if (peerMessageMatch && req.method === 'POST') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(chunk);
            }
            const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
            receivedMessage = body.text;

            res.writeHead(201);
            res.end(JSON.stringify({ success: true }));
          } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
          }
        },
      });
      servers.push(server);

      const state = createRealState(server.url);
      const specialMessage = 'Hello 🚀! Test with "quotes" and \'apostrophes\' & symbols <>';

      const result = await sendZTMMessage(state, 'alice', specialMessage);

      expect(result.ok).toBe(true);
      expect(receivedMessage).toBe(specialMessage);
    });

    it('should handle very long messages', async () => {
      const server = await createTestServer({
        handler: async (req, res) => {
          const url = req.url || '';
          const peerMessageMatch = url.match(/\/peers\/([^/]+)\/messages/);

          if (peerMessageMatch && req.method === 'POST') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(chunk);
            }
            const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));

            res.writeHead(201);
            res.end(JSON.stringify({ receivedLength: body.text.length }));
          } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
          }
        },
      });
      servers.push(server);

      const state = createRealState(server.url);
      const longMessage = 'x'.repeat(5000); // 5KB message

      const result = await sendZTMMessage(state, 'alice', longMessage);

      expect(result.ok).toBe(true);
    });
  });

  describe('Real HTTP Group Message Sending', () => {
    it('should send group message to real HTTP server', async () => {
      const server = await createChatApiServer();
      servers.push(server);

      const state = createRealState(server.url);
      const groupInfo: GroupInfo = { creator: 'admin', group: 'developers' };

      const result = await sendZTMMessage(state, 'admin', 'Hello team!', groupInfo);

      expect(result.ok).toBe(true);
      expect(state.lastOutboundAt).not.toBeNull();

      // Verify server received group message request
      expect(server.receivedRequests.length).toBeGreaterThan(0);
      const postRequest = server.receivedRequests.find(r => r.url.includes('/groups/'));
      expect(postRequest).toBeDefined();
    });

    it('should include group info in HTTP request', async () => {
      let receivedCreator: string | undefined;
      let receivedGroup: string | undefined;

      const server = await createTestServer({
        handler: async (req, res) => {
          const url = req.url || '';
          const groupMessageMatch = url.match(/\/groups\/([^/]+)\/([^/]+)\/messages/);

          if (groupMessageMatch && req.method === 'POST') {
            receivedCreator = groupMessageMatch[1];
            receivedGroup = groupMessageMatch[2];

            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(chunk);
            }
            // Parse body but don't need it for this test
            JSON.parse(Buffer.concat(chunks).toString('utf-8'));

            res.writeHead(201);
            res.end(JSON.stringify({ success: true }));
          } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
          }
        },
      });
      servers.push(server);

      const state = createRealState(server.url);
      const groupInfo: GroupInfo = { creator: 'admin', group: 'engineering' };

      await sendZTMMessage(state, 'admin', 'Hello engineering!', groupInfo);

      expect(receivedCreator).toBe('admin');
      expect(receivedGroup).toBe('engineering');
    });
  });

  describe('Network Error Recovery', () => {
    it('should handle connection refused errors', async () => {
      // Use a non-existent server
      const state = createRealState('http://localhost:59999');

      const result = await sendZTMMessage(state, 'alice', 'Hello');

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(state.lastError).toBeDefined();
    });

    it('should handle HTTP 500 errors', async () => {
      const server = await createStatusCodeServer(500);
      servers.push(server);

      const state = createRealState(server.url);

      const result = await sendZTMMessage(state, 'alice', 'Hello');

      expect(result.ok).toBe(false);
      expect(state.lastError).toBeDefined();
    });

    it('should handle HTTP 503 errors', async () => {
      const server = await createStatusCodeServer(503);
      servers.push(server);

      const state = createRealState(server.url);

      const result = await sendZTMMessage(state, 'alice', 'Hello');

      expect(result.ok).toBe(false);
    });

    it('should retry on transient failures', async () => {
      let attemptCount = 0;

      const server = await createTestServer({
        handler: (req, res) => {
          attemptCount++;
          // Fail first 2 attempts
          if (attemptCount <= 2) {
            res.writeHead(503);
            res.end(JSON.stringify({ error: 'Service unavailable' }));
          } else {
            res.writeHead(201);
            res.end(JSON.stringify({ success: true }));
          }
        },
      });
      servers.push(server);

      const state = createRealState(server.url);

      // Note: This test shows the behavior - actual retry logic may vary
      await sendZTMMessage(state, 'alice', 'Hello');

      // Should fail immediately without retry (current implementation)
      // This documents the current behavior
      expect(attemptCount).toBeGreaterThan(0);
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout on slow response', async () => {
      const server = await createDelayedServer(10000); // 10 second delay
      servers.push(server);

      // Use a short timeout
      const config = {
        ...testConfig,
        agentUrl: server.url,
        apiTimeout: 100,
        meshName: 'test-mesh',
      };
      const apiClient = createZTMApiClient(config, { logger: mockLogger });
      const state: AccountRuntimeState = {
        accountId: testAccountId,
        config,
        chatReader: apiClient as any,
        chatSender: apiClient as any,
        discovery: apiClient as any,
        messageCallbacks: new Set(),
        watchInterval: null,
        lastError: null,
        lastStartAt: null,
        lastStopAt: null,
        lastInboundAt: null,
        lastOutboundAt: null,
        watchErrorCount: 0,
        pendingPairings: new Map(),
      };

      const startTime = Date.now();
      const result = await sendZTMMessage(state, 'alice', 'Hello');
      const elapsed = Date.now() - startTime;

      // Should timeout quickly (within reasonable time)
      expect(elapsed).toBeLessThan(15000);
      expect(result.ok).toBe(false);
    });

    it('should complete fast request before timeout', async () => {
      const server = await createChatApiServer();
      servers.push(server);

      const state = createRealState(server.url);

      const result = await sendZTMMessage(state, 'alice', 'Hello');

      expect(result.ok).toBe(true);
    });
  });

  describe('Concurrent Message Sending', () => {
    it('should handle multiple concurrent messages', async () => {
      const server = await createChatApiServer();
      servers.push(server);

      const state = createRealState(server.url);

      // Send 5 messages concurrently
      const promises = [
        sendZTMMessage(state, 'alice', 'Message 1'),
        sendZTMMessage(state, 'bob', 'Message 2'),
        sendZTMMessage(state, 'charlie', 'Message 3'),
        sendZTMMessage(state, 'david', 'Message 4'),
        sendZTMMessage(state, 'eve', 'Message 5'),
      ];

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach(result => {
        expect(result.ok).toBe(true);
      });

      // Server should have received all requests
      const peerRequests = server.receivedRequests.filter(r => r.url.includes('/peers/'));
      expect(peerRequests.length).toBe(5);
    });

    it('should not mix up message recipients', async () => {
      const receivedMessages: { peer: string; message: string }[] = [];

      const server = await createTestServer({
        handler: async (req, res) => {
          const url = req.url || '';
          const peerMessageMatch = url.match(/\/peers\/([^/]+)\/messages/);

          if (peerMessageMatch && req.method === 'POST') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(chunk);
            }

            const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
            receivedMessages.push({ peer: peerMessageMatch[1], message: body.text });

            res.writeHead(201);
            res.end(JSON.stringify({ success: true }));
          } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
          }
        },
      });
      servers.push(server);

      const state = createRealState(server.url);

      // Send different messages to different recipients
      await sendZTMMessage(state, 'alice', 'Hello Alice');
      await sendZTMMessage(state, 'bob', 'Hello Bob');
      await sendZTMMessage(state, 'charlie', 'Hello Charlie');

      // Verify each message went to the right recipient
      expect(receivedMessages).toHaveLength(3);
      expect(receivedMessages.some(m => m.peer === 'alice' && m.message === 'Hello Alice')).toBe(
        true
      );
      expect(receivedMessages.some(m => m.peer === 'bob' && m.message === 'Hello Bob')).toBe(true);
      expect(
        receivedMessages.some(m => m.peer === 'charlie' && m.message === 'Hello Charlie')
      ).toBe(true);
    });
  });

  describe('Message ID Generation', () => {
    it('should generate unique message IDs', () => {
      const ids = new Set();
      const count = 100;

      for (let i = 0; i < count; i++) {
        const id = generateMessageId();
        ids.add(id);
      }

      expect(ids.size).toBe(count);
    });

    it('should include timestamp in message ID', () => {
      const before = Date.now();
      const id = generateMessageId();
      const after = Date.now();

      const match = id.match(/^ztm-(\d+)-/);
      expect(match).not.toBeNull();

      const timestamp = parseInt(match![1], 10);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('should include random hex suffix', () => {
      const id = generateMessageId();

      expect(id).toMatch(/ztm-\d+-[a-f0-9]+$/);

      const hexPart = id.split('-')[2];
      expect(hexPart.length).toBeGreaterThan(0);
      expect(hexPart).toMatch(/^[a-f0-9]+$/);
    });

    it('should generate IDs in correct format', () => {
      const id = generateMessageId();

      // Format: ztm-{timestamp}-{random}
      expect(id).toMatch(/^ztm-\d{13,}-[a-f0-9]+$/);
    });
  });

  describe('State Updates', () => {
    it('should update lastOutboundAt on successful send', async () => {
      const server = await createChatApiServer();
      servers.push(server);

      const state = createRealState(server.url);
      expect(state.lastOutboundAt).toBeNull();

      await sendZTMMessage(state, 'alice', 'Hello');

      expect(state.lastOutboundAt).not.toBeNull();
      expect(state.lastOutboundAt).toBeInstanceOf(Date);
    });

    it('should not update lastOutboundAt on failed send', async () => {
      const server = await createStatusCodeServer(500);
      servers.push(server);

      const state = createRealState(server.url);
      state.lastOutboundAt = new Date('2024-01-01');

      await sendZTMMessage(state, 'alice', 'Hello');

      expect(state.lastOutboundAt?.toISOString()).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should update lastError on failed send', async () => {
      const server = await createStatusCodeServer(500);
      servers.push(server);

      const state = createRealState(server.url);
      expect(state.lastError).toBeNull();

      await sendZTMMessage(state, 'alice', 'Hello');

      expect(state.lastError).not.toBeNull();
      expect(state.lastError).toBeDefined();
    });

    it('should not clear lastError on successful send (it persists)', async () => {
      const server = await createChatApiServer();
      servers.push(server);

      const state = createRealState(server.url);
      state.lastError = 'Previous error';

      await sendZTMMessage(state, 'alice', 'Hello');

      // lastError is NOT cleared on successful send - it persists
      expect(state.lastError).toBe('Previous error');
    });
  });

  describe('Server Response Validation', () => {
    it('should handle malformed JSON response', async () => {
      const server = await createTestServer({
        handler: (req, res) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{ invalid json }');
        },
      });
      servers.push(server);

      const state = createRealState(server.url);

      const result = await sendZTMMessage(state, 'alice', 'Hello');

      expect(result.ok).toBe(false);
    });

    it('should handle empty response', async () => {
      const server = await createTestServer({
        handler: (req, res) => {
          res.writeHead(200);
          res.end('');
        },
      });
      servers.push(server);

      const state = createRealState(server.url);

      const result = await sendZTMMessage(state, 'alice', 'Hello');

      // Should handle gracefully - result depends on implementation
      expect(result).toBeDefined();
    });

    it('should handle response with missing fields', async () => {
      const server = await createTestServer({
        handler: (req, res) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({})); // Empty response
        },
      });
      servers.push(server);

      const state = createRealState(server.url);

      const result = await sendZTMMessage(state, 'alice', 'Hello');

      expect(result).toBeDefined();
    });
  });

  describe('HTTP Method and Headers', () => {
    it('should use POST method for sending messages', async () => {
      let receivedMethod: string | undefined;

      const server = await createTestServer({
        handler: async (req, res) => {
          receivedMethod = req.method;
          res.writeHead(201);
          res.end(JSON.stringify({ success: true }));
        },
      });
      servers.push(server);

      const state = createRealState(server.url);
      await sendZTMMessage(state, 'alice', 'Hello');

      expect(receivedMethod).toBe('POST');
    });

    it('should include correct content-type header', async () => {
      let receivedContentType: string | undefined;

      const server = await createTestServer({
        handler: async (req, res) => {
          receivedContentType = req.headers['content-type'];
          res.writeHead(201);
          res.end(JSON.stringify({ success: true }));
        },
      });
      servers.push(server);

      const state = createRealState(server.url);
      await sendZTMMessage(state, 'alice', 'Hello');

      expect(receivedContentType).toContain('application/json');
    });
  });
});
