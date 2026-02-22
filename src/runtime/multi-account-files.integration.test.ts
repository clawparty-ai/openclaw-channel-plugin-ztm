/**
 * Integration tests for Multi-Account File Isolation
 *
 * Tests that multiple accounts have isolated state and permit files
 * using REAL file system operations (not mocked).
 *
 * This verifies:
 * 1. Each account has its own state.json file
 * 2. Each account has its own permit.json file
 * 3. Files are correctly isolated and don't interfere with each other
 * 4. Concurrent writes to different accounts don't cause race conditions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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

describe('Multi-Account File Isolation Integration (Real File I/O)', () => {
  // Use a unique temp directory for this test suite
  const testBaseDir = path.join(os.tmpdir(), `ztm-multi-account-test-${Date.now()}`);

  beforeEach(() => {
    vi.clearAllMocks();
    // Create test base directory
    if (!fs.existsSync(testBaseDir)) {
      fs.mkdirSync(testBaseDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testBaseDir)) {
      fs.rmSync(testBaseDir, { recursive: true, force: true });
    }
  });

  describe('State file isolation', () => {
    it('should create separate state files for different accounts', async () => {
      // Import after mocking
      const { resolveStatePath } = await import('../utils/paths.js');

      const account1 = 'account-1';
      const account2 = 'account-2';

      // Set custom state path for testing
      const originalEnv = process.env.ZTM_STATE_PATH;
      process.env.ZTM_STATE_PATH = testBaseDir;

      try {
        const statePath1 = resolveStatePath(account1);
        const statePath2 = resolveStatePath(account2);

        // Verify paths are different
        expect(statePath1).not.toBe(statePath2);

        // Verify they are in correct subdirectories
        expect(statePath1).toContain('/account-1/');
        expect(statePath2).toContain('/account-2/');
        expect(statePath1).toContain('state.json');
        expect(statePath2).toContain('state.json');

        // Write to each file
        const testData1 = { accounts: { [account1]: { peer1: 1000 } }, fileMetadata: {} };
        const testData2 = { accounts: { [account2]: { peer2: 2000 } }, fileMetadata: {} };

        // Ensure directories exist
        fs.mkdirSync(path.dirname(statePath1), { recursive: true });
        fs.mkdirSync(path.dirname(statePath2), { recursive: true });

        // Write files
        fs.writeFileSync(statePath1, JSON.stringify(testData1));
        fs.writeFileSync(statePath2, JSON.stringify(testData2));

        // Verify files exist
        expect(fs.existsSync(statePath1)).toBe(true);
        expect(fs.existsSync(statePath2)).toBe(true);

        // Read and verify content is isolated
        const content1 = JSON.parse(fs.readFileSync(statePath1, 'utf-8'));
        const content2 = JSON.parse(fs.readFileSync(statePath2, 'utf-8'));

        expect(content1.accounts[account1].peer1).toBe(1000);
        expect(content2.accounts[account2].peer2).toBe(2000);

        // Verify accounts don't see each other's data
        expect(content1.accounts[account2]).toBeUndefined();
        expect(content2.accounts[account1]).toBeUndefined();
      } finally {
        process.env.ZTM_STATE_PATH = originalEnv;
      }
    });

    it('should handle many accounts without file conflicts', async () => {
      const { resolveStatePath } = await import('../utils/paths.js');

      const numAccounts = 10;
      const accountIds = Array.from({ length: numAccounts }, (_, i) => `bot-${i}`);

      const originalEnv = process.env.ZTM_STATE_PATH;
      process.env.ZTM_STATE_PATH = testBaseDir;

      try {
        // Create files for all accounts
        for (const accountId of accountIds) {
          const statePath = resolveStatePath(accountId);
          const testData = { accounts: { [accountId]: { peer: Date.now() } }, fileMetadata: {} };

          fs.mkdirSync(path.dirname(statePath), { recursive: true });
          fs.writeFileSync(statePath, JSON.stringify(testData));
        }

        // Verify all files exist
        for (const accountId of accountIds) {
          const statePath = resolveStatePath(accountId);
          expect(fs.existsSync(statePath)).toBe(true);

          const content = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
          expect(content.accounts[accountId]).toBeDefined();
        }
      } finally {
        process.env.ZTM_STATE_PATH = originalEnv;
      }
    });
  });

  describe('Permit file isolation', () => {
    it('should create separate permit files for different accounts', async () => {
      const { resolvePermitPath } = await import('../utils/paths.js');

      const account1 = 'account-1';
      const account2 = 'account-2';

      const originalEnv = process.env.ZTM_STATE_PATH;
      process.env.ZTM_STATE_PATH = testBaseDir;

      try {
        const permitPath1 = resolvePermitPath(account1);
        const permitPath2 = resolvePermitPath(account2);

        // Verify paths are different
        expect(permitPath1).not.toBe(permitPath2);

        // Verify they are in correct subdirectories
        expect(permitPath1).toContain('/account-1/');
        expect(permitPath2).toContain('/account-2/');
        expect(permitPath1).toContain('permit.json');
        expect(permitPath2).toContain('permit.json');

        // Write permit data for each account
        const permitData1 = {
          ca: 'cert-ca-account1',
          agent: { certificate: 'cert-account1', privateKey: 'key-account1' },
          bootstraps: ['hub1.account1.local'],
        };
        const permitData2 = {
          ca: 'cert-ca-account2',
          agent: { certificate: 'cert-account2', privateKey: 'key-account2' },
          bootstraps: ['hub1.account2.local'],
        };

        // Ensure directories exist
        fs.mkdirSync(path.dirname(permitPath1), { recursive: true });
        fs.mkdirSync(path.dirname(permitPath2), { recursive: true });

        // Write files
        fs.writeFileSync(permitPath1, JSON.stringify(permitData1));
        fs.writeFileSync(permitPath2, JSON.stringify(permitData2));

        // Verify files exist
        expect(fs.existsSync(permitPath1)).toBe(true);
        expect(fs.existsSync(permitPath2)).toBe(true);

        // Read and verify content is isolated
        const content1 = JSON.parse(fs.readFileSync(permitPath1, 'utf-8'));
        const content2 = JSON.parse(fs.readFileSync(permitPath2, 'utf-8'));

        expect(content1.ca).toBe('cert-ca-account1');
        expect(content2.ca).toBe('cert-ca-account2');

        // Verify they don't share data
        expect(content1.ca).not.toBe(content2.ca);
      } finally {
        process.env.ZTM_STATE_PATH = originalEnv;
      }
    });

    it('should isolate permit data for multiple accounts with different mesh configs', async () => {
      const { resolvePermitPath } = await import('../utils/paths.js');

      const accounts = [
        { id: 'prod-bot', meshName: 'production-mesh', bootstraps: ['prod-hub-1', 'prod-hub-2'] },
        { id: 'dev-bot', meshName: 'development-mesh', bootstraps: ['dev-hub-1'] },
        { id: 'test-bot', meshName: 'test-mesh', bootstraps: ['localhost'] },
      ];

      const originalEnv = process.env.ZTM_STATE_PATH;
      process.env.ZTM_STATE_PATH = testBaseDir;

      try {
        // Write permit files for each account
        for (const account of accounts) {
          const permitPath = resolvePermitPath(account.id);
          const permitData = {
            ca: `ca-${account.meshName}`,
            agent: { certificate: `cert-${account.id}`, privateKey: `key-${account.id}` },
            bootstraps: account.bootstraps,
          };

          fs.mkdirSync(path.dirname(permitPath), { recursive: true });
          fs.writeFileSync(permitPath, JSON.stringify(permitData));
        }

        // Verify each account's permit data is correct
        for (const account of accounts) {
          const permitPath = resolvePermitPath(account.id);
          const content = JSON.parse(fs.readFileSync(permitPath, 'utf-8'));

          expect(content.ca).toBe(`ca-${account.meshName}`);
          expect(content.agent.certificate).toBe(`cert-${account.id}`);
          expect(content.bootstraps).toEqual(account.bootstraps);
        }
      } finally {
        process.env.ZTM_STATE_PATH = originalEnv;
      }
    });
  });

  describe('Concurrent account operations', () => {
    it('should handle concurrent writes to different account state files', async () => {
      const { resolveStatePath } = await import('../utils/paths.js');

      const numAccounts = 5;
      const accountIds = Array.from({ length: numAccounts }, (_, i) => `concurrent-account-${i}`);

      const originalEnv = process.env.ZTM_STATE_PATH;
      process.env.ZTM_STATE_PATH = testBaseDir;

      try {
        // Simulate concurrent writes
        const writePromises = accountIds.map(async accountId => {
          const statePath = resolveStatePath(accountId);
          const testData = {
            accounts: { [accountId]: { peer: Date.now(), timestamp: Date.now() } },
            fileMetadata: {},
          };

          fs.mkdirSync(path.dirname(statePath), { recursive: true });

          // Add some delay to simulate real-world timing
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10));

          fs.writeFileSync(statePath, JSON.stringify(testData));
        });

        await Promise.all(writePromises);

        // Verify all files were written correctly
        for (const accountId of accountIds) {
          const statePath = resolveStatePath(accountId);
          expect(fs.existsSync(statePath)).toBe(true);

          const content = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
          expect(content.accounts[accountId]).toBeDefined();
          expect(content.accounts[accountId].timestamp).toBeLessThanOrEqual(Date.now());
        }
      } finally {
        process.env.ZTM_STATE_PATH = originalEnv;
      }
    });

    it('should not corrupt state file when writing to different accounts simultaneously', async () => {
      const { resolveStatePath } = await import('../utils/paths.js');

      const account1 = 'race-test-1';
      const account2 = 'race-test-2';

      const originalEnv = process.env.ZTM_STATE_PATH;
      process.env.ZTM_STATE_PATH = testBaseDir;

      try {
        // Initialize both files
        const statePath1 = resolveStatePath(account1);
        const statePath2 = resolveStatePath(account2);

        fs.mkdirSync(path.dirname(statePath1), { recursive: true });
        fs.mkdirSync(path.dirname(statePath2), { recursive: true });

        // Rapid concurrent writes
        const iterations = 100;
        const promises: Promise<void>[] = [];

        for (let i = 0; i < iterations; i++) {
          promises.push(
            (async () => {
              const data = { accounts: { [account1]: { peer: i } }, fileMetadata: {} };
              fs.writeFileSync(statePath1, JSON.stringify(data));
            })()
          );
          promises.push(
            (async () => {
              const data = { accounts: { [account2]: { peer: i } }, fileMetadata: {} };
              fs.writeFileSync(statePath2, JSON.stringify(data));
            })()
          );
        }

        await Promise.all(promises);

        // Verify both files are valid JSON (not corrupted)
        const content1 = JSON.parse(fs.readFileSync(statePath1, 'utf-8'));
        const content2 = JSON.parse(fs.readFileSync(statePath2, 'utf-8'));

        expect(content1.accounts[account1]).toBeDefined();
        expect(content2.accounts[account2]).toBeDefined();
      } finally {
        process.env.ZTM_STATE_PATH = originalEnv;
      }
    });
  });

  describe('Directory structure', () => {
    it('should create correct directory structure for accounts', async () => {
      const { resolveZTMStateDir } = await import('../utils/paths.js');

      const account1 = 'my-bot';
      const account2 = 'another-bot';

      const originalEnv = process.env.ZTM_STATE_PATH;
      process.env.ZTM_STATE_PATH = testBaseDir;

      try {
        const dir1 = resolveZTMStateDir(account1);
        const dir2 = resolveZTMStateDir(account2);

        // Verify directory paths
        expect(dir1).toBe(path.join(testBaseDir, 'my-bot'));
        expect(dir2).toBe(path.join(testBaseDir, 'another-bot'));

        // Create directories
        fs.mkdirSync(dir1, { recursive: true });
        fs.mkdirSync(dir2, { recursive: true });

        // Verify directories exist
        expect(fs.existsSync(dir1)).toBe(true);
        expect(fs.existsSync(dir2)).toBe(true);

        // Verify directories are different
        expect(dir1).not.toBe(dir2);
      } finally {
        process.env.ZTM_STATE_PATH = originalEnv;
      }
    });

    it('should maintain separate subdirectories under common parent', async () => {
      const { resolveZTMStateDir } = await import('../utils/paths.js');

      const account1 = 'account-a';
      const account2 = 'account-b';

      const originalEnv = process.env.ZTM_STATE_PATH;
      process.env.ZTM_STATE_PATH = testBaseDir;

      try {
        const dir1 = resolveZTMStateDir(account1);
        const dir2 = resolveZTMStateDir(account2);

        // Verify both directories share the same parent
        const parent1 = path.dirname(dir1);
        const parent2 = path.dirname(dir2);
        expect(parent1).toBe(parent2);
        expect(parent1).toBe(testBaseDir);
      } finally {
        process.env.ZTM_STATE_PATH = originalEnv;
      }
    });
  });
});
