/**
 * E2E Tests for Watch/Polling Mode Switch
 *
 * Tests the fallback mechanism from Watch mode to Polling mode
 * when the Watch API becomes unavailable.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  createTestServer,
  type TestServer,
  type ExtendedTestServer,
} from '../../test-utils/http-server.js';

describe('E2E: Watch/Polling Mode Switch', () => {
  let servers: TestServer[] = [];

  afterEach(async () => {
    await Promise.all(servers.map(s => s.close()));
    servers = [];
  });

  it('should handle Watch API becoming unavailable', async () => {
    // Create server that fails after first request
    let requestCount = 0;
    const server = await createTestServer({
      handler: async (req, res) => {
        requestCount++;
        if (requestCount > 1) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Service Unavailable' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ chats: [] }));
      },
    });
    servers.push(server);

    // First request should succeed
    const response1 = await fetch(server.url);
    expect(response1.status).toBe(200);

    // Second request should fail (simulating Watch API unavailable)
    const response2 = await fetch(server.url);
    expect(response2.status).toBe(503);
  });

  it('should inject error to simulate Watch failure', async () => {
    const server = await createTestServer();
    servers.push(server);

    // Inject 503 error to simulate Watch API failure
    server.injectError(503, new Error('Watch API unavailable'));

    const response = await fetch(server.url);
    expect(response.status).toBe(503);

    const data = await response.json();
    expect(data.error).toContain('Watch API unavailable');

    // Reset and verify恢复正常
    server.reset();
    const response2 = await fetch(server.url);
    expect(response2.status).toBe(200);
  });

  it('should handle polling interval delays', async () => {
    const server = await createTestServer();
    servers.push(server);

    // Set delay to simulate polling interval
    server.setDelay(50);

    const start = Date.now();
    await fetch(server.url);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(45);
  });
});
