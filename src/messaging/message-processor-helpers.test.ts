// Unit tests for message processor helpers

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testConfig, testAccountId } from '../test-utils/fixtures.js';
import type { AccountRuntimeState } from '../runtime/state.js';

// Mock dependencies
vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  defaultLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../utils/log-sanitize.js', () => ({
  sanitizeForLog: vi.fn((s: string) => s),
}));

vi.mock('./processor.js', () => ({
  processIncomingMessage: vi.fn(),
}));

vi.mock('./dispatcher.js', () => ({
  notifyMessageCallbacks: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../core/dm-policy.js', () => ({
  checkDmPolicy: vi.fn(),
}));

vi.mock('../core/policy-checker.js', () => ({
  checkMessagePolicy: vi.fn(),
}));

vi.mock('../connectivity/permit.js', () => ({
  handlePairingRequest: vi.fn().mockResolvedValue(undefined),
}));

import {
  getWatermarkKey,
  isGroupChat,
  extractSender,
  isSelfMessage,
  validateChatMessage,
  processPeerMessage,
  processGroupMessage,
  handlePeerPolicyCheck,
  processAndNotifyPeerMessages,
  processAndNotifyGroupMessages,
} from './message-processor-helpers.js';
import { processIncomingMessage } from './processor.js';
import { notifyMessageCallbacks } from './dispatcher.js';
import { checkDmPolicy } from '../core/dm-policy.js';
import { checkMessagePolicy } from '../core/policy-checker.js';
import { handlePairingRequest } from '../connectivity/permit.js';
import type { ZTMChat } from '../types/api.js';
import type { ZTMChatMessage } from '../types/messaging.js';

describe('message-processor-helpers', () => {
  describe('getWatermarkKey', () => {
    it('should return peer from ZTMChatMessage', () => {
      const msg: ZTMChatMessage = {
        id: 'msg-1',
        content: 'hello',
        sender: 'alice',
        senderId: 'alice',
        timestamp: new Date(1000),
        peer: 'alice',
      };
      expect(getWatermarkKey({ type: 'message', data: msg })).toBe('alice');
    });

    it('should return group key for group message', () => {
      const msg: ZTMChatMessage = {
        id: 'msg-1',
        content: 'hello',
        sender: 'alice',
        senderId: 'alice',
        timestamp: new Date(1000),
        peer: 'alice',
        isGroup: true,
        groupCreator: 'creator1',
        groupId: 'group1',
      };
      expect(getWatermarkKey({ type: 'message', data: msg })).toBe('group:creator1/group1');
    });

    it('should return group key from groupInfo object', () => {
      const groupInfo = { creator: 'creator1', group: 'group1' };
      expect(getWatermarkKey({ type: 'group', data: groupInfo })).toBe('group:creator1/group1');
    });

    it('should return peer from peer type', () => {
      expect(getWatermarkKey({ type: 'peer', data: 'bob' })).toBe('bob');
    });

    it('should return group key with undefined for incomplete group info', () => {
      const groupInfo = { creator: 'creator1' };
      expect(
        getWatermarkKey({ type: 'group', data: groupInfo as { creator: string; group: string } })
      ).toBe('group:creator1/undefined');
    });
  });

  describe('isGroupChat', () => {
    it('should return true when chat has creator and group', () => {
      const chat: ZTMChat = {
        creator: 'admin',
        group: 'testgroup',
        time: 1000,
        updated: 1000,
        latest: { time: 1000, message: 'hello', sender: 'user1' },
      };
      expect(isGroupChat(chat)).toBe(true);
    });

    it('should return false when chat has only peer', () => {
      const chat: ZTMChat = {
        peer: 'alice',
        time: 1000,
        updated: 1000,
        latest: { time: 1000, message: 'hello', sender: 'user1' },
      };
      expect(isGroupChat(chat)).toBe(false);
    });

    it('should return false when chat has neither creator nor group', () => {
      const chat: ZTMChat = {
        time: 1000,
        updated: 1000,
        latest: { time: 1000, message: 'hello', sender: 'user1' },
      };
      expect(isGroupChat(chat)).toBe(false);
    });
  });

  describe('extractSender', () => {
    it('should return explicit sender when present', () => {
      const chat: ZTMChat = {
        peer: 'alice',
        time: 1000,
        updated: 1000,
        latest: { time: 1000, message: 'hello', sender: 'bob' },
      };
      expect(extractSender(chat)).toBe('bob');
    });

    it('should return peer for peer chat without explicit sender', () => {
      const chat: ZTMChat = {
        peer: 'alice',
        time: 1000,
        updated: 1000,
        latest: { time: 1000, message: 'hello', sender: '' },
      };
      expect(extractSender(chat)).toBe('alice');
    });

    it('should return empty string for group chat without sender', () => {
      const chat: ZTMChat = {
        creator: 'admin',
        group: 'testgroup',
        time: 1000,
        updated: 1000,
        latest: { time: 1000, message: 'hello', sender: '' },
      };
      expect(extractSender(chat)).toBe('');
    });

    it('should return explicit sender for group chat when present', () => {
      const chat: ZTMChat = {
        creator: 'admin',
        group: 'testgroup',
        time: 1000,
        updated: 1000,
        latest: { time: 1000, message: 'hello', sender: 'user1' },
      };
      expect(extractSender(chat)).toBe('user1');
    });
  });

  describe('isSelfMessage', () => {
    it('should return true when sender matches bot username', () => {
      expect(isSelfMessage('botuser', 'botuser')).toBe(true);
    });

    it('should return false when sender does not match', () => {
      expect(isSelfMessage('alice', 'botuser')).toBe(false);
    });

    it('should be case sensitive', () => {
      expect(isSelfMessage('BotUser', 'botuser')).toBe(false);
    });
  });

  describe('validateChatMessage', () => {
    const config = { ...testConfig, username: 'mybot' };

    it('should return valid for peer chat', () => {
      const chat: ZTMChat = {
        peer: 'alice',
        time: 1000,
        updated: 1000,
        latest: { time: 1000, message: 'hello', sender: 'alice' },
      };
      expect(validateChatMessage(chat, config)).toEqual({ valid: true });
    });

    it('should reject peer chat when peer is same as bot username', () => {
      const chat: ZTMChat = {
        peer: 'mybot',
        time: 1000,
        updated: 1000,
        latest: { time: 1000, message: 'hello', sender: 'mybot' },
      };
      expect(validateChatMessage(chat, config)).toEqual({
        valid: false,
        reason: 'invalid_peer',
      });
    });

    it('should reject peer chat without peer', () => {
      const chat: ZTMChat = {
        time: 1000,
        updated: 1000,
        latest: { time: 1000, message: 'hello', sender: 'alice' },
      };
      expect(validateChatMessage(chat, config)).toEqual({
        valid: false,
        reason: 'invalid_peer',
      });
    });

    it('should accept peer chat with latest message', () => {
      const chat: ZTMChat = {
        peer: 'alice',
        time: 1000,
        updated: 1000,
        latest: { time: 1000, message: 'hello', sender: 'alice' },
      };
      expect(validateChatMessage(chat, config)).toEqual({
        valid: true,
      });
    });

    it('should accept group chat with latest message', () => {
      const chat: ZTMChat = {
        creator: 'admin',
        group: 'testgroup',
        time: 1000,
        updated: 1000,
        latest: { time: 1000, message: 'hello', sender: 'user1' },
      };
      expect(validateChatMessage(chat, config)).toEqual({
        valid: true,
      });
    });

    it('should reject group chat with empty sender', () => {
      const chat: ZTMChat = {
        creator: 'admin',
        group: 'testgroup',
        time: 1000,
        updated: 1000,
        latest: { time: 1000, message: 'hello', sender: '' },
      };
      expect(validateChatMessage(chat, config)).toEqual({
        valid: false,
        reason: 'empty_sender',
      });
    });

    it('should reject self message in group', () => {
      const chat: ZTMChat = {
        creator: 'admin',
        group: 'testgroup',
        time: 1000,
        updated: 1000,
        latest: { time: 1000, message: 'hello', sender: 'mybot' },
      };
      expect(validateChatMessage(chat, config)).toEqual({
        valid: false,
        reason: 'self_message',
      });
    });

    it('should reject self message in peer chat', () => {
      const chat: ZTMChat = {
        peer: 'alice',
        time: 1000,
        updated: 1000,
        latest: { time: 1000, message: 'hello', sender: 'mybot' },
      };
      expect(validateChatMessage(chat, config)).toEqual({
        valid: false,
        reason: 'self_message',
      });
    });

    it('should accept valid group message', () => {
      const chat: ZTMChat = {
        creator: 'admin',
        group: 'testgroup',
        time: 1000,
        updated: 1000,
        latest: { time: 1000, message: 'hello', sender: 'alice' },
      };
      expect(validateChatMessage(chat, config)).toEqual({ valid: true });
    });
  });

  describe('processPeerMessage', () => {
    let mockState: AccountRuntimeState;

    beforeEach(() => {
      vi.clearAllMocks();
      mockState = {
        accountId: testAccountId,
        config: { ...testConfig, username: 'mybot' },
        chatReader: null,
        chatSender: null,
        discovery: null,
        lastError: null,
        lastStartAt: null,
        lastStopAt: null,
        lastInboundAt: null,
        lastOutboundAt: null,
        watchErrorCount: 0,
        messageCallbacks: new Set(),
        watchInterval: null,
      };
    });

    it('should return null for self message', () => {
      const msg = { time: 1000, message: 'hello', sender: 'mybot' };
      const result = processPeerMessage(msg, mockState, []);
      expect(result).toBeNull();
    });

    it('should process message through pipeline', () => {
      const normalizedMsg: ZTMChatMessage = {
        id: 'msg-1',
        content: 'hello',
        sender: 'alice',
        senderId: 'alice',
        timestamp: new Date(1000),
        peer: 'alice',
      };
      vi.mocked(checkMessagePolicy).mockReturnValue({ allowed: true, reason: 'allowed', action: 'process' });
      (processIncomingMessage as ReturnType<typeof vi.fn>).mockReturnValue(normalizedMsg);

      const msg = { time: 1000, message: 'hello', sender: 'alice' };
      const result = processPeerMessage(msg, mockState, []);

      expect(result).toEqual(normalizedMsg);
      expect(checkMessagePolicy).toHaveBeenCalledWith({
        sender: 'alice',
        content: 'hello',
        config: mockState.config,
        accountId: testAccountId,
        storeAllowFrom: [],
      });
      expect(processIncomingMessage).toHaveBeenCalledWith(msg, {
        config: mockState.config,
        storeAllowFrom: [],
        accountId: testAccountId,
        skipPolicyCheck: true,
      });
    });

    it('should return null when policy rejects', () => {
      vi.mocked(checkMessagePolicy).mockReturnValue({ allowed: false, reason: 'denied', action: 'ignore' });

      const msg = { time: 1000, message: 'hello', sender: 'blocked-user' };
      const result = processPeerMessage(msg, mockState, []);

      expect(result).toBeNull();
      expect(checkMessagePolicy).toHaveBeenCalled();
      expect(processIncomingMessage).not.toHaveBeenCalled();
    });
  });

  describe('processGroupMessage', () => {
    let mockState: AccountRuntimeState;

    beforeEach(() => {
      vi.clearAllMocks();
      mockState = {
        accountId: testAccountId,
        config: { ...testConfig, username: 'mybot' },
        chatReader: null,
        chatSender: null,
        discovery: null,
        lastError: null,
        lastStartAt: null,
        lastStopAt: null,
        lastInboundAt: null,
        lastOutboundAt: null,
        watchErrorCount: 0,
        messageCallbacks: new Set(),
        watchInterval: null,
      };
    });

    it('should return null for self message', () => {
      const msg = { time: 1000, message: 'hello', sender: 'mybot' };
      const groupInfo = { creator: 'admin', group: 'testgroup' };
      const result = processGroupMessage(msg, mockState, [], groupInfo);
      expect(result).toBeNull();
    });

    it('should return null when policy rejects', () => {
      vi.mocked(checkMessagePolicy).mockReturnValue({ allowed: false, reason: 'denied', action: 'ignore' });

      const msg = { time: 1000, message: 'hello', sender: 'alice' };
      const groupInfo = { creator: 'admin', group: 'testgroup' };
      const result = processGroupMessage(msg, mockState, [], groupInfo);

      expect(result).toBeNull();
      expect(checkMessagePolicy).toHaveBeenCalledWith({
        sender: 'alice',
        content: 'hello',
        config: mockState.config,
        accountId: testAccountId,
        storeAllowFrom: [],
        groupInfo,
      });
      expect(processIncomingMessage).not.toHaveBeenCalled();
    });

    it('should add group metadata to normalized message', () => {
      const normalizedMsg: ZTMChatMessage = {
        id: 'msg-1',
        content: 'hello',
        sender: 'alice',
        senderId: 'alice',
        timestamp: new Date(1000),
        peer: 'alice',
      };
      vi.mocked(checkMessagePolicy).mockReturnValue({ allowed: true, reason: 'allowed', action: 'process' });
      (processIncomingMessage as ReturnType<typeof vi.fn>).mockReturnValue(normalizedMsg);

      const msg = { time: 1000, message: 'hello', sender: 'alice' };
      const groupInfo = { creator: 'admin', group: 'testgroup' };
      const groupName = 'Test Group';
      const result = processGroupMessage(msg, mockState, [], groupInfo, groupName);

      expect(result).not.toBeNull();
      expect(result?.isGroup).toBe(true);
      expect(result?.groupId).toBe('testgroup');
      expect(result?.groupName).toBe('Test Group');
      expect(result?.groupCreator).toBe('admin');
    });
  });

  describe('handlePeerPolicyCheck', () => {
    let mockState: AccountRuntimeState;

    beforeEach(() => {
      vi.clearAllMocks();
      mockState = {
        accountId: testAccountId,
        config: { ...testConfig, username: 'mybot' },
        chatReader: null,
        chatSender: null,
        discovery: null,
        lastError: null,
        lastStartAt: null,
        lastStopAt: null,
        lastInboundAt: null,
        lastOutboundAt: null,
        watchErrorCount: 0,
        messageCallbacks: new Set(),
        watchInterval: null,
      };
    });

    it('should call handlePairingRequest when policy requires pairing', async () => {
      (checkDmPolicy as ReturnType<typeof vi.fn>).mockReturnValue({
        allowed: false,
        reason: 'pairing mode',
        action: 'request_pairing',
      });

      await handlePeerPolicyCheck('alice', mockState, [], 'test reason');

      expect(checkDmPolicy).toHaveBeenCalledWith('alice', mockState.config, []);
      expect(handlePairingRequest).toHaveBeenCalledWith(mockState, 'alice', 'test reason', []);
    });

    it('should not call handlePairingRequest when policy allows', async () => {
      (checkDmPolicy as ReturnType<typeof vi.fn>).mockReturnValue({
        allowed: true,
        reason: 'allowed',
        action: 'process',
      });

      await handlePeerPolicyCheck('alice', mockState, [], 'test reason');

      expect(handlePairingRequest).not.toHaveBeenCalled();
    });

    it('should not call handlePairingRequest when policy denies', async () => {
      (checkDmPolicy as ReturnType<typeof vi.fn>).mockReturnValue({
        allowed: false,
        reason: 'denied',
        action: 'ignore',
      });

      await handlePeerPolicyCheck('alice', mockState, [], 'test reason');

      expect(handlePairingRequest).not.toHaveBeenCalled();
    });
  });

  describe('processAndNotifyPeerMessages', () => {
    let mockState: AccountRuntimeState;

    beforeEach(() => {
      vi.clearAllMocks();
      mockState = {
        accountId: testAccountId,
        config: { ...testConfig, username: 'mybot' },
        chatReader: null,
        chatSender: null,
        discovery: null,
        lastError: null,
        lastStartAt: null,
        lastStopAt: null,
        lastInboundAt: null,
        lastOutboundAt: null,
        watchErrorCount: 0,
        messageCallbacks: new Set(),
        watchInterval: null,
      };
    });

    it('should process and notify for valid messages', async () => {
      const normalizedMsg: ZTMChatMessage = {
        id: 'msg-1',
        content: 'hello',
        sender: 'alice',
        senderId: 'alice',
        timestamp: new Date(1000),
        peer: 'alice',
      };
      vi.mocked(checkMessagePolicy).mockReturnValue({ allowed: true, reason: 'allowed', action: 'process' });
      (processIncomingMessage as ReturnType<typeof vi.fn>).mockReturnValue(normalizedMsg);

      const messages = [
        { time: 1000, message: 'hello', sender: 'alice' },
        { time: 2000, message: 'world', sender: 'bob' },
      ];

      await processAndNotifyPeerMessages(messages, mockState, []);

      expect(notifyMessageCallbacks).toHaveBeenCalledTimes(2);
    });

    it('should skip null messages', async () => {
      vi.mocked(checkMessagePolicy).mockReturnValue({ allowed: false, reason: 'denied', action: 'ignore' });

      const messages = [{ time: 1000, message: 'hello', sender: 'mybot' }];

      await processAndNotifyPeerMessages(messages, mockState, []);

      expect(notifyMessageCallbacks).not.toHaveBeenCalled();
    });
  });

  describe('processAndNotifyGroupMessages', () => {
    let mockState: AccountRuntimeState;

    beforeEach(() => {
      vi.clearAllMocks();
      mockState = {
        accountId: testAccountId,
        config: { ...testConfig, username: 'mybot' },
        chatReader: null,
        chatSender: null,
        discovery: null,
        lastError: null,
        lastStartAt: null,
        lastStopAt: null,
        lastInboundAt: null,
        lastOutboundAt: null,
        watchErrorCount: 0,
        messageCallbacks: new Set(),
        watchInterval: null,
      };
    });

    it('should process and notify for valid group messages', async () => {
      const normalizedMsg: ZTMChatMessage = {
        id: 'msg-1',
        content: 'hello',
        sender: 'alice',
        senderId: 'alice',
        timestamp: new Date(1000),
        peer: 'alice',
        isGroup: true,
        groupId: 'testgroup',
        groupCreator: 'admin',
      };
      vi.mocked(checkMessagePolicy).mockReturnValue({ allowed: true, reason: 'allowed', action: 'process' });
      (processIncomingMessage as ReturnType<typeof vi.fn>).mockReturnValue(normalizedMsg);

      const messages = [{ time: 1000, message: 'hello', sender: 'alice' }];
      const groupInfo = { creator: 'admin', group: 'testgroup' };

      await processAndNotifyGroupMessages(messages, mockState, [], groupInfo);

      expect(notifyMessageCallbacks).toHaveBeenCalledTimes(1);
    });

    it('should pass groupName to processGroupMessage', async () => {
      const normalizedMsg: ZTMChatMessage = {
        id: 'msg-1',
        content: 'hello',
        sender: 'alice',
        senderId: 'alice',
        timestamp: new Date(1000),
        peer: 'alice',
        isGroup: true,
        groupId: 'testgroup',
        groupCreator: 'admin',
      };
      vi.mocked(checkMessagePolicy).mockReturnValue({ allowed: true, reason: 'allowed', action: 'process' });
      (processIncomingMessage as ReturnType<typeof vi.fn>).mockReturnValue(normalizedMsg);

      const messages = [{ time: 1000, message: 'hello', sender: 'alice' }];
      const groupInfo = { creator: 'admin', group: 'testgroup' };
      const groupName = 'Test Group';

      await processAndNotifyGroupMessages(messages, mockState, [], groupInfo, groupName);

      expect(notifyMessageCallbacks).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({ groupName: 'Test Group' })
      );
    });
  });
});
