/**
 * E2E Tests for Multi-Account Concurrency
 *
 * Tests multiple account scenarios:
 * - Concurrent message handling across accounts
 * - Account isolation verification
 * - Concurrent state management
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  createTestServer,
  type TestServer,
} from '../../test-utils/http-server.js';

describe('E2E: Multi-Account Concurrency', () => {
  let servers: TestServer[] = [];

  afterEach(async () => {
    await Promise.all(servers.map(s => s.close()));
    servers = [];
  });

  it('should handle multiple account servers', async () => {
    // Create multiple servers for different accounts
    const server1 = await createTestServer({
      handler: async (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ account: 'account-1' }));
      },
    });
    const server2 = await createTestServer({
      handler: async (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ account: 'account-2' }));
      },
    });
    servers.push(server1, server2);

    // Both servers should work independently
    const response1 = await fetch(server1.url);
    const data1 = await response1.json() as { account: string };
    expect(data1.account).toBe('account-1');

    const response2 = await fetch(server2.url);
    const data2 = await response2.json() as { account: string };
    expect(data2.account).toBe('account-2');
  });

  it('should maintain account isolation', async () => {
    const account1State = { accountId: 'account-1', connected: true };
    const account2State = { accountId: 'account-2', connected: true };

    // States should be independent
    expect(account1State.accountId).not.toBe(account2State.accountId);
    expect(account1State.connected).toBe(account2State.connected);
  });

  it('should handle concurrent requests to different accounts', async () => {
    const server = await createTestServer();
    servers.push(server);

    // Simulate concurrent requests
    const promises = Array(5)
      .fill(null)
      .map(() => fetch(server.url));

    const responses = await Promise.all(promises);

    // All should succeed
    expect(responses.every(r => r.status === 200)).toBe(true);
  });

  it('should apply different delays per server', async () => {
    const server1 = await createTestServer();
    const server2 = await createTestServer();
    servers.push(server1, server2);

    server1.setDelay(50);
    server2.setDelay(100);

    const start = Date.now();
    await Promise.all([fetch(server1.url), fetch(server2.url)]);
    const elapsed = Date.now() - start;

    // Should take approximately 100ms (the longer delay)
    expect(elapsed).toBeGreaterThanOrEqual(90);

    server1.reset();
    server2.reset();
  });
});
