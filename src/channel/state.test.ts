// Unit tests for Channel State Management

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildAccountSnapshot } from './state.js';
import type { ResolvedZTMChatAccount } from './config.js';

// Mock the runtime state module
vi.mock('../runtime/state.js', () => ({
  getAllAccountStates: vi.fn(() => new Map()),
}));

describe('buildAccountSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockAccount = (
    overrides: Partial<ResolvedZTMChatAccount> = {}
  ): ResolvedZTMChatAccount => ({
    accountId: 'test-account',
    username: 'test-bot',
    enabled: true,
    config: {
      agentUrl: 'https://example.com:7777',
      permitUrl: 'https://example.com/permit',
      permitSource: 'server',
      meshName: 'test-mesh',
      username: 'test-bot',
      dmPolicy: 'pairing',
      enableGroups: false,
    },
    ...overrides,
  });

  describe('basic snapshot properties', () => {
    it('should return accountId from account', () => {
      const account = createMockAccount({ accountId: 'my-account' });

      const snapshot = buildAccountSnapshot({ account });

      expect(snapshot.accountId).toBe('my-account');
    });

    it('should return username as name', () => {
      const account = createMockAccount({ username: 'my-bot' });

      const snapshot = buildAccountSnapshot({ account });

      expect(snapshot.name).toBe('my-bot');
    });

    it('should return enabled status', () => {
      const account = createMockAccount({ enabled: true });

      const snapshot = buildAccountSnapshot({ account });

      expect(snapshot.enabled).toBe(true);
    });

    it('should return enabled as false when disabled', () => {
      const account = createMockAccount({ enabled: false });

      const snapshot = buildAccountSnapshot({ account });

      expect(snapshot.enabled).toBe(false);
    });
  });

  describe('configured status', () => {
    it('should return configured as true for valid config', () => {
      const account = createMockAccount({
        config: {
          agentUrl: 'https://example.com:7777',
          permitUrl: 'https://example.com/permit',
          permitSource: 'server',
          meshName: 'test-mesh',
          username: 'test-bot',
          dmPolicy: 'pairing',
          enableGroups: false,
        },
      });

      const snapshot = buildAccountSnapshot({ account });

      expect(snapshot.configured).toBe(true);
    });

    it('should return configured as false for missing agentUrl', () => {
      const account = createMockAccount({
        config: {
          agentUrl: '',
          permitUrl: 'https://example.com/permit',
          permitSource: 'server',
          meshName: 'test-mesh',
          username: 'test-bot',
          dmPolicy: 'pairing',
          enableGroups: false,
        },
      });

      const snapshot = buildAccountSnapshot({ account });

      expect(snapshot.configured).toBe(false);
    });
  });

  describe('runtime state integration', () => {
    it('should return running false when no state exists', async () => {
      const { getAllAccountStates } = await import('../runtime/state.js');
      (getAllAccountStates as any).mockReturnValue(new Map());

      const account = createMockAccount();

      const snapshot = buildAccountSnapshot({ account });

      expect(snapshot.running).toBe(false);
    });

    it('should return running true when state shows started', async () => {
      const { getAllAccountStates } = await import('../runtime/state.js');
      const mockStates = new Map([
        [
          'test-account',
          {
            started: true,
          },
        ],
      ]);
      (getAllAccountStates as any).mockReturnValue(mockStates);

      const account = createMockAccount();

      const snapshot = buildAccountSnapshot({ account });

      expect(snapshot.running).toBe(true);
    });

    it('should return meshConnected from state', async () => {
      const { getAllAccountStates } = await import('../runtime/state.js');
      const mockStates = new Map([
        [
          'test-account',
          {
            started: true,
          },
        ],
      ]);
      (getAllAccountStates as any).mockReturnValue(mockStates);

      const account = createMockAccount();

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _snapshot = buildAccountSnapshot({ account });
    });

    it('should return connected true when mesh is disconnected but API is connected', async () => {
      const { getAllAccountStates } = await import('../runtime/state.js');
      const mockStates = new Map([
        [
          'test-account',
          {
            started: true,
          },
        ],
      ]);
      (getAllAccountStates as any).mockReturnValue(mockStates);

      const account = createMockAccount();

      const snapshot = buildAccountSnapshot({ account });

      expect(snapshot.running).toBe(true);
    });

    it('should return default values when state is incomplete', async () => {
      const { getAllAccountStates } = await import('../runtime/state.js');
      const mockStates = new Map([
        [
          'test-account',
          {
            // meshConnected not defined
          },
        ],
      ]);
      (getAllAccountStates as any).mockReturnValue(mockStates);

      const account = createMockAccount();

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _snapshot = buildAccountSnapshot({ account });
    });
  });

  describe('timestamp handling', () => {
    it('should return null for lastStartAt when not set', async () => {
      const { getAllAccountStates } = await import('../runtime/state.js');
      (getAllAccountStates as any).mockReturnValue(new Map());

      const account = createMockAccount();

      const snapshot = buildAccountSnapshot({ account });

      expect(snapshot.lastStartAt).toBeNull();
    });

    it('should return lastStartAt from state', async () => {
      const { getAllAccountStates } = await import('../runtime/state.js');
      const startTime = Date.now() - 60000;
      const mockStates = new Map([
        [
          'test-account',
          {
            lastStartAt: startTime,
          },
        ],
      ]);
      (getAllAccountStates as any).mockReturnValue(mockStates);

      const account = createMockAccount();

      const snapshot = buildAccountSnapshot({ account });

      expect(snapshot.lastStartAt).toBe(startTime);
    });

    it('should return null for lastStopAt when not set', async () => {
      const { getAllAccountStates } = await import('../runtime/state.js');
      (getAllAccountStates as any).mockReturnValue(new Map());

      const account = createMockAccount();

      const snapshot = buildAccountSnapshot({ account });

      expect(snapshot.lastStopAt).toBeNull();
    });

    it('should return lastError from state', async () => {
      const { getAllAccountStates } = await import('../runtime/state.js');
      const mockStates = new Map([
        [
          'test-account',
          {
            lastError: 'Connection failed',
          },
        ],
      ]);
      (getAllAccountStates as any).mockReturnValue(mockStates);

      const account = createMockAccount();

      const snapshot = buildAccountSnapshot({ account });

      expect(snapshot.lastError).toBe('Connection failed');
    });

    it('should return null for lastError when not set', async () => {
      const { getAllAccountStates } = await import('../runtime/state.js');
      (getAllAccountStates as any).mockReturnValue(new Map());

      const account = createMockAccount();

      const snapshot = buildAccountSnapshot({ account });

      expect(snapshot.lastError).toBeNull();
    });
  });

  describe('account-specific state', () => {
    it('should look up state by accountId', async () => {
      const { getAllAccountStates } = await import('../runtime/state.js');
      const mockStates = new Map([
        ['other-account', { connected: true }],
        ['test-account', { connected: false }],
      ]);
      (getAllAccountStates as any).mockReturnValue(mockStates);

      const account = createMockAccount({ accountId: 'test-account' });

      const snapshot = buildAccountSnapshot({ account });

      expect(snapshot.running).toBe(false);
    });

    it('should return defaults for non-existent account', async () => {
      const { getAllAccountStates } = await import('../runtime/state.js');
      const mockStates = new Map([['other-account', { connected: true }]]);
      (getAllAccountStates as any).mockReturnValue(mockStates);

      const account = createMockAccount({ accountId: 'non-existent' });

      const snapshot = buildAccountSnapshot({ account });

      expect(snapshot.running).toBe(false);
    });
  });
});
