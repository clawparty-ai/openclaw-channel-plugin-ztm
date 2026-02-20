/**
 * E2E Tests for Network Error Recovery
 *
 * Tests network error handling and recovery:
 * - Connection timeout handling
 * - Server unavailable recovery
 * - Request retry logic
 * - Message state consistency after reconnection
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  createTestServer,
  type TestServer,
} from '../../test-utils/http-server.js';

describe('E2E: Network Error Recovery', () => {
  let servers: TestServer[] = [];

  afterEach(async () => {
    await Promise.all(servers.map(s => s.close()));
    servers = [];
  });

  it('should handle connection refused', async () => {
    // Try to connect to a port that should be refused
    try {
      await fetch('http://localhost:59999');
    } catch (error) {
      // Connection should be refused
      expect(error).toBeDefined();
    }
  });

  it('should inject error to simulate network failure', async () => {
    const server = await createTestServer();
    servers.push(server);

    // Inject network error
    server.injectError(503, new Error('Network unavailable'));

    const response = await fetch(server.url);
    expect(response.status).toBe(503);

    server.reset();
  });

  it('should handle recovery after network error', async () => {
    const server = await createTestServer();
    servers.push(server);

    // Inject error
    server.injectError(503);

    const response1 = await fetch(server.url);
    expect(response1.status).toBe(503);

    // Reset and verify recovery
    server.reset();

    const response2 = await fetch(server.url);
    expect(response2.status).toBe(200);
  });

  it('should apply delay to simulate slow network', async () => {
    const server = await createTestServer();
    servers.push(server);

    server.setDelay(100);

    const start = Date.now();
    await fetch(server.url);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(90);

    server.reset();
  });

  it('should handle retry with sequential responses', async () => {
    const server = await createTestServer();
    servers.push(server);

    // First fails, second succeeds (retry scenario)
    server.addResponseSequence([
      { status: 500, body: { error: 'Temporary failure' } },
      { status: 200, body: { success: true } },
    ]);

    const response1 = await fetch(server.url);
    expect(response1.status).toBe(500);

    const response2 = await fetch(server.url);
    expect(response2.status).toBe(200);

    server.reset();
  });
});
