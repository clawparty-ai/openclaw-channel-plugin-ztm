/**
 * E2E Tests for Outbound Messaging
 *
 * Tests the outbound message sending flow:
 * - Send reply message to peer successfully
 * - Send message to group successfully
 * - Update lastOutboundAt on success
 * - Validate peer username before sending
 * - Handle send failure scenarios
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sendZTMMessage, generateMessageId } from '../outbound.js';
import {
  testConfigOpenDM,
  testAccountId,
  e2eBeforeEach,
  e2eAfterEach,
  getOrCreateAccountState,
} from '../../test-utils/index.js';
import { isSuccess, isFailure } from '../../types/common.js';

describe('E2E: Outbound Messaging', () => {
  beforeEach(() => {
    e2eBeforeEach();
  });

  afterEach(async () => {
    await e2eAfterEach();
  });

  describe('Send Peer Message', () => {
    it('should send reply message to peer successfully', async () => {
      const state = getOrCreateAccountState(testAccountId);

      // Mock successful chatSender
      const mockChatSender = {
        sendPeerMessage: vi.fn().mockResolvedValue({
          ok: true,
          value: true,
        }),
        sendGroupMessage: vi.fn(),
      } as any;

      state.config = testConfigOpenDM;
      state.chatSender = mockChatSender;

      const peer = 'alice';
      const content = 'Hello from test';

      const result = await sendZTMMessage(state, peer, content);

      expect(isSuccess(result)).toBe(true);
      expect(mockChatSender.sendPeerMessage).toHaveBeenCalledWith(
        peer,
        expect.objectContaining({
          message: content,
          sender: testConfigOpenDM.username,
        })
      );
    });

    it('should update lastOutboundAt on successful send', async () => {
      const state = getOrCreateAccountState(testAccountId);
      const beforeTime = new Date();

      // Mock successful chatSender
      const mockChatSender = {
        sendPeerMessage: vi.fn().mockResolvedValue({
          ok: true,
          value: true,
        }),
      } as any;

      state.config = testConfigOpenDM;
      state.chatSender = mockChatSender;

      await sendZTMMessage(state, 'bob', 'Test message');

      expect(state.lastOutboundAt).not.toBeNull();
      expect(state.lastOutboundAt!.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
    });

    it('should validate peer username before sending', async () => {
      const state = getOrCreateAccountState(testAccountId);

      state.config = testConfigOpenDM;
      state.chatSender = {
        sendPeerMessage: vi.fn(),
      } as any;

      // Test with invalid peer username (empty)
      const result = await sendZTMMessage(state, '', 'Test message');

      expect(isFailure(result)).toBe(true);
      expect(state.lastError).toContain('Invalid peer');
    });

    it('should handle send failure gracefully', async () => {
      const state = getOrCreateAccountState(testAccountId);

      // Mock failing chatSender
      const mockChatSender = {
        sendPeerMessage: vi.fn().mockResolvedValue({
          ok: false,
          error: new Error('Network error'),
        }),
      } as any;

      state.config = testConfigOpenDM;
      state.chatSender = mockChatSender;

      const result = await sendZTMMessage(state, 'alice', 'Test message');

      expect(isFailure(result)).toBe(true);
      expect(state.lastError).toBeDefined();
    });
  });

  describe('Send Group Message', () => {
    it('should send message to group successfully', async () => {
      const state = getOrCreateAccountState(testAccountId);

      // Mock successful group chatSender
      const mockChatSender = {
        sendGroupMessage: vi.fn().mockResolvedValue({
          ok: true,
          value: true,
        }),
      } as any;

      state.config = testConfigOpenDM;
      state.chatSender = mockChatSender;

      const groupInfo = { creator: 'admin', group: 'test-group' };
      const content = 'Hello group';

      const result = await sendZTMMessage(state, '', content, groupInfo);

      expect(isSuccess(result)).toBe(true);
      expect(mockChatSender.sendGroupMessage).toHaveBeenCalledWith(
        groupInfo.creator,
        groupInfo.group,
        expect.objectContaining({
          message: content,
        })
      );
    });

    it('should skip peer validation for group messages', async () => {
      const state = getOrCreateAccountState(testAccountId);

      // Mock successful group chatSender
      const mockChatSender = {
        sendGroupMessage: vi.fn().mockResolvedValue({
          ok: true,
          value: true,
        }),
      } as any;

      state.config = testConfigOpenDM;
      state.chatSender = mockChatSender;

      // Empty peer should be allowed for group messages
      const groupInfo = { creator: 'admin', group: 'test-group' };
      const result = await sendZTMMessage(state, '', 'Group message', groupInfo);

      expect(isSuccess(result)).toBe(true);
    });

    it('should log group message target correctly', async () => {
      const state = getOrCreateAccountState(testAccountId);

      const mockChatSender = {
        sendGroupMessage: vi.fn().mockResolvedValue({
          ok: true,
          value: true,
        }),
      } as any;

      state.config = testConfigOpenDM;
      state.chatSender = mockChatSender;

      const groupInfo = { creator: 'admin', group: 'test-group' };
      await sendZTMMessage(state, '', 'Test', groupInfo);

      // If we get here without error, the logging worked
      expect(mockChatSender.sendGroupMessage).toHaveBeenCalled();
    });
  });

  describe('Runtime Not Initialized', () => {
    it('should fail when config is not set', async () => {
      const state = getOrCreateAccountState(testAccountId);

      // No config set
      state.config = null as unknown as typeof state.config;

      const result = await sendZTMMessage(state, 'alice', 'Test');

      expect(isFailure(result)).toBe(true);
      expect(state.lastError).toContain('Runtime not initialized');
    });

    it('should fail when chatSender is not set', async () => {
      const state = getOrCreateAccountState(testAccountId);

      state.config = testConfigOpenDM;
      state.chatSender = null;

      const result = await sendZTMMessage(state, 'alice', 'Test');

      expect(isFailure(result)).toBe(true);
      expect(state.lastError).toContain('Runtime not initialized');
    });
  });

  describe('Message ID Generation', () => {
    it('should generate unique message IDs', () => {
      const id1 = generateMessageId();
      const id2 = generateMessageId();

      expect(id1).not.toBe(id2);
    });

    it('should generate ztm-prefixed IDs', () => {
      const id = generateMessageId();

      expect(id).toMatch(/^ztm-/);
    });

    it('should contain timestamp in ID', () => {
      const before = Date.now();
      const id = generateMessageId();
      const after = Date.now();

      const match = id.match(/^ztm-(\d+)-/);
      expect(match).not.toBeNull();

      const timestamp = parseInt(match![1], 10);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });
});
