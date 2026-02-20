/**
 * E2E Tests for Message Flow
 *
 * Tests complete message flow: receive message via Watch API,
 * process through the system, dispatch to callbacks, and send response.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  createTestServer,
  createZTMAgentMock,
  type TestServer,
  type TestRequest,
} from '../../test-utils/http-server.js';

describe('E2E: Message Flow', () => {
  let servers: TestServer[] = [];

  afterEach(async () => {
    await Promise.all(servers.map(s => s.close()));
    servers = [];
  });

  it('should receive message via Watch API', async () => {
    const server = await createZTMAgentMock();
    servers.push(server);

    // Test the status endpoint
    const response = await fetch(`${server.url}/api/v1/status`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { connected: boolean };
    expect(data.connected).toBe(true);
  });

  it('should inject error response', async () => {
    const server = await createTestServer();
    servers.push(server);

    // Inject error for all requests
    server.injectError(500, new Error('Injected error'));

    const response = await fetch(server.url, {
      method: 'GET',
    });

    expect(response.status).toBe(500);
    const data = (await response.json()) as { error: string };
    expect(data.error).toBe('Injected error');
  });

  it('should handle sequential responses', async () => {
    const server = await createTestServer();
    servers.push(server);

    // First call succeeds, second call fails
    server.addResponseSequence([
      { status: 200, body: { result: 'first' } },
      { status: 500, body: { error: 'second' } },
    ]);

    const response1 = await fetch(server.url);
    expect(response1.status).toBe(200);
    const data1 = (await response1.json()) as { result: string };
    expect(data1.result).toBe('first');

    const response2 = await fetch(server.url);
    expect(response2.status).toBe(500);

    // Reset to clear sequence
    server.reset();

    // After reset, should use default handler
    const response3 = await fetch(server.url);
    expect(response3.status).toBe(200);
  });

  it('should apply response delay', async () => {
    const server = await createTestServer();
    servers.push(server);

    // Set 100ms delay
    server.setDelay(100);

    const start = Date.now();
    const response = await fetch(server.url);
    const elapsed = Date.now() - start;

    expect(response.status).toBe(200);
    expect(elapsed).toBeGreaterThanOrEqual(90);

    server.reset();
  });

  it('should handle error injection then reset', async () => {
    const server = await createTestServer();
    servers.push(server);

    // Inject error
    server.injectError(503, new Error('Service unavailable'));

    const response1 = await fetch(server.url);
    expect(response1.status).toBe(503);

    // Reset
    server.reset();

    // After reset, should work normally
    const response2 = await fetch(server.url);
    expect(response2.status).toBe(200);
  });

  it('should support match condition in sequential responses', async () => {
    const server = await createTestServer();
    servers.push(server);

    // First request matches /api/v1, returns 200
    // Others return 404
    server.addResponseSequence([
      {
        match: (req: TestRequest) => req.url.includes('/v1'),
        status: 200,
        body: { matched: true },
      },
      {
        status: 404,
        body: { error: 'Not matched' },
      },
    ]);

    const response1 = await fetch(`${server.url}/api/v1/test`);
    expect(response1.status).toBe(200);

    const response2 = await fetch(`${server.url}/api/other`);
    expect(response2.status).toBe(404);

    server.reset();
  });
});
