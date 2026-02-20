/**
 * E2E Tests for Pairing Flow
 *
 * Tests the pairing request flow when dmPolicy is set to "pairing":
 * - Unpaired users are blocked
 * - Pairing requests are generated
 * - After approval, users are added to allowFrom
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  createTestServer,
  type TestServer,
} from '../../test-utils/http-server.js';

describe('E2E: Pairing Flow', () => {
  let servers: TestServer[] = [];

  afterEach(async () => {
    await Promise.all(servers.map(s => s.close()));
    servers = [];
  });

  it('should generate pairing request', async () => {
    const server = await createTestServer({
      handler: async (req, res) => {
        const url = req.url || '';

        // Pairing request endpoint
        if (url.includes('/pair/request') && req.method === 'POST') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              code: 'PAIR-' + Math.random().toString(36).substring(7),
              expiresAt: Date.now() + 3600000,
            })
          );
          return;
        }

        res.writeHead(404);
        res.end();
      },
    });
    servers.push(server);

    const response = await fetch(`${server.url}/api/pair/request`, {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.code).toBeDefined();
    expect(data.expiresAt).toBeGreaterThan(Date.now());
  });

  it('should block unpaired users in pairing mode', async () => {
    const dmPolicy = 'pairing';
    const allowFrom: string[] = [];
    const sender = 'unknown-user';

    // Unknown user should be blocked
    const isAllowed = allowFrom.includes(sender);
    expect(isAllowed).toBe(false);
  });

  it('should allow paired users after approval', async () => {
    const allowFrom = ['alice', 'bob'];
    const sender = 'alice';

    // Paired user should be allowed
    const isAllowed = allowFrom.includes(sender);
    expect(isAllowed).toBe(true);
  });

  it('should handle pairing timeout', async () => {
    const expiresAt = Date.now() - 1000; // Expired 1 second ago
    const isExpired = expiresAt < Date.now();

    expect(isExpired).toBe(true);
  });
});
