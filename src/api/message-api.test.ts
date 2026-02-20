// Unit tests for Message API

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMessageApi } from './message-api.js';
import { testConfig, testMessage } from '../test-utils/fixtures.js';

describe('createMessageApi', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPeerMessages', () => {
    it('should return object with getPeerMessages method', () => {
      const mockRequest = async () => ({ ok: true, value: [], error: null });
      const mockGetChats = async () => ({ ok: true, value: [], error: null });

      const messageApi = createMessageApi(
        testConfig,
        mockRequest as any,
        mockLogger,
        mockGetChats as any
      );

      expect(messageApi).toHaveProperty('getPeerMessages');
      expect(typeof messageApi.getPeerMessages).toBe('function');
    });

    it('should fetch messages from peer', async () => {
      const mockRequest = async () => ({
        ok: true,
        value: [
          { time: Date.now() - 1000, message: 'Hello', sender: 'alice' },
          { time: Date.now(), message: 'World', sender: 'alice' },
        ],
        error: null,
      });
      const mockGetChats = async () => ({ ok: true, value: [], error: null });

      const messageApi = createMessageApi(
        testConfig,
        mockRequest as any,
        mockLogger,
        mockGetChats as any
      );

      const result = await messageApi.getPeerMessages('alice');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value?.length).toBe(2);
      }
    });

    it('should normalize message content', async () => {
      const mockRequest = async () => ({
        ok: true,
        value: [{ time: Date.now(), message: { text: 'Normalized' }, sender: 'alice' }],
        error: null,
      });
      const mockGetChats = async () => ({ ok: true, value: [], error: null });

      const messageApi = createMessageApi(
        testConfig,
        mockRequest as any,
        mockLogger,
        mockGetChats as any
      );

      const result = await messageApi.getPeerMessages('alice');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value?.[0]?.message).toBe('Normalized');
      }
    });

    it('should handle API error', async () => {
      const mockRequest = async () => ({
        ok: false,
        value: null,
        error: new Error('Network error'),
      });
      const mockGetChats = async () => ({ ok: true, value: [], error: null });

      const messageApi = createMessageApi(
        testConfig,
        mockRequest as any,
        mockLogger,
        mockGetChats as any
      );

      const result = await messageApi.getPeerMessages('alice');

      expect(result.ok).toBe(false);
    });

    it('should pass since and before query params', async () => {
      let capturedPath = '';
      const mockRequest = async (method: string, path: string) => {
        capturedPath = path;
        return { ok: true, value: [], error: null };
      };
      const mockGetChats = async () => ({ ok: true, value: [], error: null });

      const messageApi = createMessageApi(
        testConfig,
        mockRequest as any,
        mockLogger,
        mockGetChats as any
      );

      await messageApi.getPeerMessages('alice', 1000, 2000);

      expect(capturedPath).toContain('since=1000');
      expect(capturedPath).toContain('before=2000');
    });

    it('should handle empty message array', async () => {
      const mockRequest = async () => ({
        ok: true,
        value: [],
        error: null,
      });
      const mockGetChats = async () => ({ ok: true, value: [], error: null });

      const messageApi = createMessageApi(
        testConfig,
        mockRequest as any,
        mockLogger,
        mockGetChats as any
      );

      const result = await messageApi.getPeerMessages('alice');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('sendPeerMessage', () => {
    it('should return object with sendPeerMessage method', () => {
      const mockRequest = async () => ({ ok: true, value: undefined, error: null });
      const mockGetChats = async () => ({ ok: true, value: [], error: null });

      const messageApi = createMessageApi(
        testConfig,
        mockRequest as any,
        mockLogger,
        mockGetChats as any
      );

      expect(messageApi).toHaveProperty('sendPeerMessage');
      expect(typeof messageApi.sendPeerMessage).toBe('function');
    });

    it('should send message to peer', async () => {
      const mockRequest = async () => ({
        ok: true,
        value: undefined,
        error: null,
      });
      const mockGetChats = async () => ({ ok: true, value: [], error: null });

      const messageApi = createMessageApi(
        testConfig,
        mockRequest as any,
        mockLogger,
        mockGetChats as any
      );

      const result = await messageApi.sendPeerMessage('alice', testMessage);

      expect(result.ok).toBe(true);
    });

    it('should handle send error', async () => {
      const mockRequest = async () => ({
        ok: false,
        value: null,
        error: new Error('Send failed'),
      });
      const mockGetChats = async () => ({ ok: true, value: [], error: null });

      const messageApi = createMessageApi(
        testConfig,
        mockRequest as any,
        mockLogger,
        mockGetChats as any
      );

      const result = await messageApi.sendPeerMessage('alice', testMessage);

      expect(result.ok).toBe(false);
    });
  });

  describe('getGroupMessages', () => {
    it('should return object with getGroupMessages method', () => {
      const mockRequest = async () => ({ ok: true, value: [], error: null });
      const mockGetChats = async () => ({ ok: true, value: [], error: null });

      const messageApi = createMessageApi(
        testConfig,
        mockRequest as any,
        mockLogger,
        mockGetChats as any
      );

      expect(messageApi).toHaveProperty('getGroupMessages');
      expect(typeof messageApi.getGroupMessages).toBe('function');
    });

    it('should fetch group messages', async () => {
      const mockRequest = async () => ({
        ok: true,
        value: [{ time: Date.now() - 1000, message: 'Hello group', sender: 'alice' }],
        error: null,
      });
      const mockGetChats = async () => ({ ok: true, value: [], error: null });

      const messageApi = createMessageApi(
        testConfig,
        mockRequest as any,
        mockLogger,
        mockGetChats as any
      );

      const result = await messageApi.getGroupMessages('alice', 'test-group');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value?.length).toBe(1);
      }
    });

    it('should normalize message content in group messages', async () => {
      const mockRequest = async () => ({
        ok: true,
        value: [{ time: Date.now(), message: { text: 'Normalized' }, sender: 'alice' }],
        error: null,
      });
      const mockGetChats = async () => ({ ok: true, value: [], error: null });

      const messageApi = createMessageApi(
        testConfig,
        mockRequest as any,
        mockLogger,
        mockGetChats as any
      );

      const result = await messageApi.getGroupMessages('alice', 'test-group');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value?.[0]?.message).toBe('Normalized');
      }
    });

    it('should handle API error', async () => {
      const mockRequest = async () => ({
        ok: false,
        value: null,
        error: new Error('Group not found'),
      });
      const mockGetChats = async () => ({ ok: true, value: [], error: null });

      const messageApi = createMessageApi(
        testConfig,
        mockRequest as any,
        mockLogger,
        mockGetChats as any
      );

      const result = await messageApi.getGroupMessages('alice', 'test-group');

      expect(result.ok).toBe(false);
    });

    it('should encode special characters in creator and group', async () => {
      let capturedPath = '';
      const mockRequest = async (method: string, path: string) => {
        capturedPath = path;
        return { ok: true, value: [], error: null };
      };
      const mockGetChats = async () => ({ ok: true, value: [], error: null });

      const messageApi = createMessageApi(
        testConfig,
        mockRequest as any,
        mockLogger,
        mockGetChats as any
      );

      // Use valid identifiers per IDENTIFIER_PATTERN (alphanumeric, hyphens, underscores)
      await messageApi.getGroupMessages('Alice_Smith', 'My_Group-Name');

      expect(capturedPath).toContain(encodeURIComponent('Alice_Smith'));
      expect(capturedPath).toContain(encodeURIComponent('My_Group-Name'));
    });
  });

  describe('sendGroupMessage', () => {
    it('should return object with sendGroupMessage method', () => {
      const mockRequest = async () => ({ ok: true, value: undefined, error: null });
      const mockGetChats = async () => ({ ok: true, value: [], error: null });

      const messageApi = createMessageApi(
        testConfig,
        mockRequest as any,
        mockLogger,
        mockGetChats as any
      );

      expect(messageApi).toHaveProperty('sendGroupMessage');
      expect(typeof messageApi.sendGroupMessage).toBe('function');
    });

    it('should send message to group', async () => {
      const mockRequest = async () => ({
        ok: true,
        value: undefined,
        error: null,
      });
      const mockGetChats = async () => ({ ok: true, value: [], error: null });

      const messageApi = createMessageApi(
        testConfig,
        mockRequest as any,
        mockLogger,
        mockGetChats as any
      );

      const result = await messageApi.sendGroupMessage('alice', 'test-group', testMessage);

      expect(result.ok).toBe(true);
    });

    it('should handle send error', async () => {
      const mockRequest = async () => ({
        ok: false,
        value: null,
        error: new Error('Send failed'),
      });
      const mockGetChats = async () => ({ ok: true, value: [], error: null });

      const messageApi = createMessageApi(
        testConfig,
        mockRequest as any,
        mockLogger,
        mockGetChats as any
      );

      const result = await messageApi.sendGroupMessage('alice', 'test-group', testMessage);

      expect(result.ok).toBe(false);
    });
  });

  describe('watchChanges', () => {
    it('should return object with watchChanges method', () => {
      const mockRequest = async () => ({ ok: true, value: [], error: null });
      const mockGetChats = async () => ({ ok: true, value: [], error: null });

      const messageApi = createMessageApi(
        testConfig,
        mockRequest as any,
        mockLogger,
        mockGetChats as any
      );

      expect(messageApi).toHaveProperty('watchChanges');
      expect(typeof messageApi.watchChanges).toBe('function');
    });

    it('should detect peer message changes', async () => {
      const now = Date.now();
      const mockGetChats = async () => ({
        ok: true,
        value: [
          {
            peer: 'alice',
            time: now,
            updated: now,
            latest: { time: now, message: 'Hello', sender: 'alice' },
          },
        ],
        error: null,
      });

      const messageApi = createMessageApi(
        testConfig,
        (async () => ({ ok: true, value: [], error: null })) as any,
        mockLogger,
        mockGetChats as any
      );

      // Set initial poll time to older than the message
      messageApi.setLastPollTime(now - 10000);

      const result = await messageApi.watchChanges('prefix');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value?.length).toBe(1);
        expect(result.value?.[0]?.type).toBe('peer');
        expect(result.value?.[0]?.peer).toBe('alice');
      }
    });

    it('should detect group message changes', async () => {
      const now = Date.now();
      const mockGetChats = async () => ({
        ok: true,
        value: [
          {
            creator: 'alice',
            group: 'test-group',
            name: 'Test Group',
            time: now,
            updated: now,
            latest: { time: now, message: 'Hello', sender: 'alice' },
          },
        ],
        error: null,
      });

      const messageApi = createMessageApi(
        testConfig,
        (async () => ({ ok: true, value: [], error: null })) as any,
        mockLogger,
        mockGetChats as any
      );

      messageApi.setLastPollTime(now - 10000);

      const result = await messageApi.watchChanges('prefix');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value?.length).toBe(1);
        expect(result.value?.[0]?.type).toBe('group');
        expect(result.value?.[0]?.group).toBe('test-group');
      }
    });

    it('should not include messages from self', async () => {
      const now = Date.now();
      const mockGetChats = async () => ({
        ok: true,
        value: [
          {
            peer: testConfig.username, // Same as bot username
            time: now,
            updated: now,
            latest: { time: now, message: 'My message', sender: testConfig.username },
          },
        ],
        error: null,
      });

      const messageApi = createMessageApi(
        testConfig,
        (async () => ({ ok: true, value: [], error: null })) as any,
        mockLogger,
        mockGetChats as any
      );

      messageApi.setLastPollTime(now - 10000);

      const result = await messageApi.watchChanges('prefix');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value?.length).toBe(0);
      }
    });

    it('should update lastPollTime after detecting changes', async () => {
      const now = Date.now();
      const mockGetChats = async () => ({
        ok: true,
        value: [
          {
            peer: 'alice',
            time: now,
            updated: now,
            latest: { time: now, message: 'Hello', sender: 'alice' },
          },
        ],
        error: null,
      });

      const messageApi = createMessageApi(
        testConfig,
        (async () => ({ ok: true, value: [], error: null })) as any,
        mockLogger,
        mockGetChats as any
      );

      const initialTime = now - 10000;
      messageApi.setLastPollTime(initialTime);

      await messageApi.watchChanges('prefix');

      const lastPollTime = messageApi.getLastPollTime();
      expect(lastPollTime).toBe(now);
    });

    it('should return empty array when no changes', async () => {
      const now = Date.now();
      const mockGetChats = async () => ({
        ok: true,
        value: [
          {
            peer: 'alice',
            time: now - 20000,
            updated: now - 20000,
            latest: { time: now - 20000, message: 'Old message', sender: 'alice' },
          },
        ],
        error: null,
      });

      const messageApi = createMessageApi(
        testConfig,
        (async () => ({ ok: true, value: [], error: null })) as any,
        mockLogger,
        mockGetChats as any
      );

      messageApi.setLastPollTime(now);

      const result = await messageApi.watchChanges('prefix');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value?.length).toBe(0);
      }
    });

    it('should skip peers with invalid usernames (e.g., Chinese characters)', async () => {
      const now = Date.now();
      const mockGetChats = async () => ({
        ok: true,
        value: [
          {
            peer: '张三', // Valid: Chinese characters now supported
            time: now,
            updated: now,
            latest: { time: now, message: 'Hello', sender: '张三' },
          },
          {
            peer: 'alice', // Valid
            time: now,
            updated: now,
            latest: { time: now, message: 'Hi', sender: 'alice' },
          },
        ],
        error: null,
      });

      const messageApi = createMessageApi(
        testConfig,
        (async () => ({ ok: true, value: [], error: null })) as any,
        mockLogger,
        mockGetChats as any
      );

      messageApi.setLastPollTime(now - 10000);

      const result = await messageApi.watchChanges('prefix');

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should include both peers - Chinese username is now valid
        expect(result.value?.length).toBe(2);
        expect(result.value?.[0]?.type).toBe('peer');
        expect(result.value?.[0]?.peer).toBe('张三');
        expect(result.value?.[1]?.type).toBe('peer');
        expect(result.value?.[1]?.peer).toBe('alice');
      }
    });

    it('should accept groups with Unicode creator usernames', async () => {
      const now = Date.now();
      const mockGetChats = async () => ({
        ok: true,
        value: [
          {
            creator: '用户A', // Valid: Chinese characters now supported
            group: 'test-group',
            name: 'Test Group',
            time: now,
            updated: now,
            latest: { time: now, message: 'Hello', sender: '用户A' },
          },
          {
            creator: 'alice', // Valid
            group: 'another-group',
            name: 'Another Group',
            time: now,
            updated: now,
            latest: { time: now, message: 'Hi', sender: 'alice' },
          },
        ],
        error: null,
      });

      const messageApi = createMessageApi(
        testConfig,
        (async () => ({ ok: true, value: [], error: null })) as any,
        mockLogger,
        mockGetChats as any
      );

      messageApi.setLastPollTime(now - 10000);

      const result = await messageApi.watchChanges('prefix');

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should include both groups - Chinese creator is now valid
        expect(result.value?.length).toBe(2);
        expect(result.value?.[0]?.type).toBe('group');
        expect(result.value?.[0]?.creator).toBe('用户A');
        expect(result.value?.[1]?.type).toBe('group');
        expect(result.value?.[1]?.creator).toBe('alice');
      }
    });

    it('should accept groups with Unicode group IDs', async () => {
      const now = Date.now();
      const mockGetChats = async () => ({
        ok: true,
        value: [
          {
            creator: 'alice',
            group: '测试组', // Valid: Chinese characters in group ID now supported
            name: 'Test Group',
            time: now,
            updated: now,
            latest: { time: now, message: 'Hello', sender: 'alice' },
          },
          {
            creator: 'bob',
            group: 'valid-group', // Valid
            name: 'Valid Group',
            time: now,
            updated: now,
            latest: { time: now, message: 'Hi', sender: 'bob' },
          },
        ],
        error: null,
      });

      const messageApi = createMessageApi(
        testConfig,
        (async () => ({ ok: true, value: [], error: null })) as any,
        mockLogger,
        mockGetChats as any
      );

      messageApi.setLastPollTime(now - 10000);

      const result = await messageApi.watchChanges('prefix');

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should include both groups - Chinese group ID is now valid
        expect(result.value?.length).toBe(2);
        expect(result.value?.[0]?.type).toBe('group');
        expect(result.value?.[0]?.group).toBe('测试组');
        expect(result.value?.[1]?.type).toBe('group');
        expect(result.value?.[1]?.group).toBe('valid-group');
      }
    });

    it('should skip peers with special characters in username', async () => {
      const now = Date.now();
      const mockGetChats = async () => ({
        ok: true,
        value: [
          {
            peer: 'user@example.com', // Invalid: contains @
            time: now,
            updated: now,
            latest: { time: now, message: 'Hello', sender: 'user@example.com' },
          },
          {
            peer: 'valid_user', // Valid
            time: now,
            updated: now,
            latest: { time: now, message: 'Hi', sender: 'valid_user' },
          },
        ],
        error: null,
      });

      const messageApi = createMessageApi(
        testConfig,
        (async () => ({ ok: true, value: [], error: null })) as any,
        mockLogger,
        mockGetChats as any
      );

      messageApi.setLastPollTime(now - 10000);

      const result = await messageApi.watchChanges('prefix');

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should only include the valid peer
        expect(result.value?.length).toBe(1);
        expect(result.value?.[0]?.peer).toBe('valid_user');
      }
    });
  });

  describe('getLastPollTime and setLastPollTime', () => {
    it('should get and set last poll time', () => {
      const mockRequest = async () => ({ ok: true, value: [], error: null });
      const mockGetChats = async () => ({ ok: true, value: [], error: null });

      const messageApi = createMessageApi(
        testConfig,
        mockRequest as any,
        mockLogger,
        mockGetChats as any
      );

      expect(messageApi.getLastPollTime()).toBeUndefined();

      messageApi.setLastPollTime(1000);
      expect(messageApi.getLastPollTime()).toBe(1000);
    });
  });
});
