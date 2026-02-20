/**
 * Test Utilities Verification Tests
 *
 * Verifies that the test utilities (http-server and fs-helpers) work correctly.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  createTestServer,
  createZTMAgentMock,
  createStatusCodeServer,
  createEchoServer,
  type TestServer,
} from './http-server.js';
import {
  createTempDir,
  cleanupTempDir,
  withTempDir,
  createTestConfigFile,
  createTestStateFile,
  checkFileExists,
  readJSONFile,
  writeJSONFile,
  createCorruptedJSONFile,
  countFiles,
  createTempDirs,
} from './fs-helpers.js';

describe('HTTP Server Test Utilities', () => {
  let servers: TestServer[] = [];

  afterEach(async () => {
    // Clean up all servers
    await Promise.all(servers.map(s => s.close()));
    servers = [];
  });

  describe('createTestServer', () => {
    it('should create a server on available port', async () => {
      const server = await createTestServer();
      servers.push(server);

      expect(server.port).toBeGreaterThan(0);
      expect(server.url).toMatch(/^http:\/\/localhost:\d+$/);
      expect(server.server.listening).toBe(true);
    });

    it('should respond to requests', async () => {
      const server = await createTestServer();
      servers.push(server);

      const response = await fetch(server.url);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ status: 'ok' });
    });

    it('should record received requests', async () => {
      const server = await createTestServer();
      servers.push(server);

      await fetch(server.url);
      await fetch(`${server.url}/test`);

      expect(server.receivedRequests).toHaveLength(2);
      expect(server.receivedRequests[0]?.method).toBe('GET');
      expect(server.receivedRequests[0]?.url).toBe('/');
    });

    it('should support custom handler', async () => {
      const server = await createTestServer({
        handler: (_req, res) => {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ created: true }));
        },
      });
      servers.push(server);

      const response = await fetch(server.url);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data).toEqual({ created: true });
    });
  });

  describe('createZTMAgentMock', () => {
    it('should respond to ZTM Agent endpoints', async () => {
      const agent = await createZTMAgentMock();
      servers.push(agent);

      // Test messages endpoint
      const messagesResponse = await fetch(`${agent.url}/api/v1/messages`);
      expect(messagesResponse.status).toBe(200);

      // Test send message endpoint
      const sendResponse = await fetch(`${agent.url}/api/v1/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: 'test' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(sendResponse.status).toBe(201);

      // Test status endpoint
      const statusResponse = await fetch(`${agent.url}/api/v1/status`);
      expect(statusResponse.status).toBe(200);
      const status = (await statusResponse.json()) as { connected: boolean };
      expect(status.connected).toBe(true);
    });
  });

  describe('createStatusCodeServer', () => {
    it('should respond with specified status code', async () => {
      const server = await createStatusCodeServer(404);
      servers.push(server);

      const response = await fetch(server.url);
      expect(response.status).toBe(404);
    });

    it('should respond with 500 for server errors', async () => {
      const server = await createStatusCodeServer(500);
      servers.push(server);

      const response = await fetch(server.url);
      expect(response.status).toBe(500);
    });
  });

  describe('createEchoServer', () => {
    it('should echo back request data', async () => {
      const server = await createEchoServer();
      servers.push(server);

      const testBody = JSON.stringify({ message: 'test data' });
      const response = await fetch(server.url, {
        method: 'POST',
        body: testBody,
      });

      const echoed = (await response.json()) as { body: string; method: string };
      expect(echoed.body).toBe(testBody);
      expect(echoed.method).toBe('POST');
    });
  });
});

describe('File System Test Utilities', () => {
  describe('createTempDir and cleanupTempDir', () => {
    it('should create and cleanup temp directory', async () => {
      const dir = await createTempDir();

      expect(dir).toMatch(/ztm-test-[a-f0-9]+$/);

      const { existsSync } = await import('node:fs');
      expect(existsSync(dir)).toBe(true);

      await cleanupTempDir(dir);
      expect(existsSync(dir)).toBe(false);
    });

    it('should handle cleanup of non-existent directory', async () => {
      // Should not throw
      await cleanupTempDir('/non/existent/path');
    });
  });

  describe('withTempDir', () => {
    it('should auto-cleanup after callback', async () => {
      let dirInsideCallback: string | undefined;

      await withTempDir(async dir => {
        dirInsideCallback = dir;
        const { existsSync } = await import('node:fs');
        expect(existsSync(dir)).toBe(true);
      });

      const { existsSync } = await import('node:fs');
      expect(dirInsideCallback).toBeDefined();
      // Directory should be cleaned up
      expect(existsSync(dirInsideCallback!)).toBe(false);
    });

    it('should cleanup even on error', async () => {
      let dirInsideCallback: string | undefined;

      await expect(
        withTempDir(async dir => {
          dirInsideCallback = dir;
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      const { existsSync } = await import('node:fs');
      expect(existsSync(dirInsideCallback!)).toBe(false);
    });

    it('should return callback result', async () => {
      const result = await withTempDir(async dir => {
        return `result-${dir}`;
      });

      expect(result).toMatch(/^result-.*ztm-test-/);
    });
  });

  describe('createTestConfigFile', () => {
    it('should create config file with JSON content', async () => {
      await withTempDir(async dir => {
        const config = { agentUrl: 'http://test', dmPolicy: 'allow' };
        const path = await createTestConfigFile(dir, config);

        expect(path).toMatch(/config\.json$/);

        const content = await readJSONFile<typeof config>(path);
        expect(content).toEqual(config);
      });
    });

    it('should support custom filename', async () => {
      await withTempDir(async dir => {
        const config = { test: true };
        const path = await createTestConfigFile(dir, config, 'custom.json');

        expect(path).toMatch(/custom\.json$/);
      });
    });
  });

  describe('createTestStateFile', () => {
    it('should create state file with typed content', async () => {
      await withTempDir(async dir => {
        const state = { watermarks: { peer1: 123456 } };
        const path = await createTestStateFile(dir, state);

        const content = await readJSONFile<typeof state>(path);
        expect(content).toEqual(state);
      });
    });
  });

  describe('checkFileExists', () => {
    it('should return stats for existing file', async () => {
      await withTempDir(async dir => {
        const path = await createTestConfigFile(dir, { test: true });
        const stats = await checkFileExists(path);

        expect(stats).toBeDefined();
        expect(stats?.isFile()).toBe(true);
      });
    });

    it('should return null for non-existent file', async () => {
      const stats = await checkFileExists('/non/existent/file');
      expect(stats).toBeNull();
    });
  });

  describe('readJSONFile and writeJSONFile', () => {
    it('should write and read JSON files', async () => {
      await withTempDir(async dir => {
        const { join } = await import('node:path');
        const path = join(dir, 'test.json');

        const data = { nested: { value: 42 } };
        await writeJSONFile(path, data);

        const read = await readJSONFile<typeof data>(path);
        expect(read).toEqual(data);
      });
    });
  });

  describe('createCorruptedJSONFile', () => {
    it('should create file with invalid JSON', async () => {
      await withTempDir(async dir => {
        const path = await createCorruptedJSONFile(dir);

        await expect(readJSONFile(path)).rejects.toThrow();
      });
    });
  });

  describe('countFiles', () => {
    it('should count files in directory', async () => {
      await withTempDir(async dir => {
        expect(await countFiles(dir)).toBe(0);

        await createTestConfigFile(dir, { test: 1 }, 'a.json');
        await createTestConfigFile(dir, { test: 2 }, 'b.json');

        expect(await countFiles(dir)).toBe(2);
      });
    });
  });

  describe('createTempDirs', () => {
    it('should create multiple temp directories', async () => {
      const dirs = await createTempDirs(3);

      try {
        expect(dirs).toHaveLength(3);

        for (const dir of dirs) {
          const { existsSync } = await import('node:fs');
          expect(existsSync(dir)).toBe(true);
        }

        // All directories should be unique
        expect(new Set(dirs).size).toBe(3);
      } finally {
        await Promise.all(dirs.map(cleanupTempDir));
      }
    });

    it('should use custom prefix', async () => {
      const dirs = await createTempDirs(2, 'custom-');

      try {
        expect(dirs[0]).toMatch(/custom-0-/);
        expect(dirs[1]).toMatch(/custom-1-/);
      } finally {
        await Promise.all(dirs.map(cleanupTempDir));
      }
    });
  });
});
