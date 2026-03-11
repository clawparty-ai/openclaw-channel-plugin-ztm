import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMessageStrategy, processAndNotify } from './message-strategies.js';
import { isGroupChat, validateChatMessage } from '../message-processor-helpers.js';
import { processIncomingMessage } from '../processor.js';
import { notifyMessageCallbacks } from '../dispatcher.js';
import { checkMessagePolicy } from '../../core/policy-checker.js';
import { checkDmPolicy } from '../../core/dm-policy.js';
import type { ZTMChat } from '../../types/api.js';
import type { AccountRuntimeState } from '../../runtime/state.js';

// Mock dependencies
vi.mock('../message-processor-helpers.js', () => ({
  isGroupChat: vi.fn(),
  extractSender: vi.fn((chat: ZTMChat) => chat.latest?.sender || chat.peer || ''),
  validateChatMessage: vi.fn(),
}));

vi.mock('../processor.js', () => ({
  processIncomingMessage: vi.fn(),
}));

vi.mock('../dispatcher.js', () => ({
  notifyMessageCallbacks: vi.fn(),
}));

vi.mock('../../core/policy-checker.js', () => ({
  checkMessagePolicy: vi.fn(),
}));

vi.mock('../../core/dm-policy.js', () => ({
  checkDmPolicy: vi.fn(),
}));

vi.mock('../../connectivity/permit.js', () => ({
  handlePairingRequest: vi.fn(),
}));

describe('getMessageStrategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return PeerMessageStrategy for peer chat', () => {
    const peerChat: ZTMChat = {
      peer: 'alice',
      time: 123,
      updated: 123,
      latest: { time: 123, message: 'hi', sender: 'alice' },
    };
    (isGroupChat as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const strategy = getMessageStrategy(peerChat);

    expect(isGroupChat).toHaveBeenCalledWith(peerChat);
    // Strategy should have normalize and getGroupInfo methods
    expect(typeof strategy.normalize).toBe('function');
    expect(typeof strategy.getGroupInfo).toBe('function');
    expect(strategy.getGroupInfo(peerChat)).toBeNull();
  });

  it('should return GroupMessageStrategy for group chat', () => {
    const groupChat: ZTMChat = {
      creator: 'admin',
      group: 'group1',
      name: 'TestGroup',
      time: 123,
      updated: 123,
      latest: { time: 123, message: 'hello', sender: 'bob' },
    };
    (isGroupChat as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const strategy = getMessageStrategy(groupChat);

    expect(isGroupChat).toHaveBeenCalledWith(groupChat);
    expect(strategy.getGroupInfo(groupChat)).toEqual({ creator: 'admin', group: 'group1' });
  });
});

describe('processAndNotify', () => {
  const mockState = {
    accountId: 'test-account',
    config: { username: 'test-bot' },
  } as unknown as AccountRuntimeState;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return false when chat validation fails', async () => {
    const chat: ZTMChat = {
      peer: 'alice',
      time: 123,
      updated: 123,
      latest: { time: 123, message: 'hi', sender: 'alice' },
    };
    (validateChatMessage as ReturnType<typeof vi.fn>).mockReturnValue({
      valid: false,
      reason: 'invalid_peer',
    });

    const result = await processAndNotify(chat, mockState, []);

    expect(result).toBe(false);
    expect(notifyMessageCallbacks).not.toHaveBeenCalled();
  });

  it('should process peer chat and notify callbacks', async () => {
    const chat: ZTMChat = {
      peer: 'alice',
      time: 123,
      updated: 123,
      latest: { time: 123, message: 'hi', sender: 'alice' },
    };

    (validateChatMessage as ReturnType<typeof vi.fn>).mockReturnValue({ valid: true });
    (isGroupChat as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (checkMessagePolicy as ReturnType<typeof vi.fn>).mockReturnValue({
      allowed: true,
      reason: 'allowed',
      action: 'process',
    });
    (processIncomingMessage as ReturnType<typeof vi.fn>).mockReturnValue({
      peer: 'alice',
      time: 123,
      message: 'hi',
      sender: 'alice',
      id: '1',
      senderId: 'alice',
      timestamp: new Date(123),
    });
    (notifyMessageCallbacks as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (checkDmPolicy as ReturnType<typeof vi.fn>).mockReturnValue({
      allowed: true,
      reason: 'allowed',
      action: 'process',
    });

    const result = await processAndNotify(chat, mockState, []);

    expect(result).toBe(true);
    expect(notifyMessageCallbacks).toHaveBeenCalled();
  });

  it('should process group chat and notify callbacks', async () => {
    const chat: ZTMChat = {
      creator: 'admin',
      group: 'group1',
      name: 'TestGroup',
      time: 123,
      updated: 123,
      latest: { time: 123, message: 'hello', sender: 'bob' },
    };

    (validateChatMessage as ReturnType<typeof vi.fn>).mockReturnValue({ valid: true });
    (isGroupChat as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (checkMessagePolicy as ReturnType<typeof vi.fn>).mockReturnValue({
      allowed: true,
      reason: 'allowed',
      action: 'process',
    });
    (processIncomingMessage as ReturnType<typeof vi.fn>).mockReturnValue({
      isGroup: true,
      groupId: 'group1',
      groupCreator: 'admin',
      groupName: 'TestGroup',
      time: 123,
      message: 'hello',
      sender: 'bob',
      id: '1',
      senderId: 'bob',
      timestamp: new Date(123),
    });
    (notifyMessageCallbacks as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const result = await processAndNotify(chat, mockState, []);

    expect(result).toBe(true);
    expect(notifyMessageCallbacks).toHaveBeenCalledWith(
      mockState,
      expect.objectContaining({ isGroup: true, groupId: 'group1' })
    );
  });

  it('should return false when normalization returns null', async () => {
    const chat: ZTMChat = {
      peer: 'alice',
      time: 123,
      updated: 123,
      latest: { time: 123, message: 'hi', sender: 'alice' },
    };

    (validateChatMessage as ReturnType<typeof vi.fn>).mockReturnValue({ valid: true });
    (isGroupChat as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (checkMessagePolicy as ReturnType<typeof vi.fn>).mockReturnValue({
      allowed: false,
      reason: 'denied',
      action: 'ignore',
    });

    const result = await processAndNotify(chat, mockState, []);

    expect(result).toBe(false);
    expect(notifyMessageCallbacks).not.toHaveBeenCalled();
  });
});
