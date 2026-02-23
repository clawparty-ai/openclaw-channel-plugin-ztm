import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMessageStrategy, processAndNotify } from './message-strategies.js';
import { isGroupChat, extractSender, validateChatMessage } from '../message-processor-helpers.js';
import {
  processPeerMessage,
  processGroupMessage,
  handlePeerPolicyCheck,
} from '../message-processor-helpers.js';
import { notifyMessageCallbacks } from '../dispatcher.js';
import type { ZTMChat } from '../../types/api.js';
import type { AccountRuntimeState } from '../../runtime/state.js';

// Mock dependencies
vi.mock('../message-processor-helpers.js', () => ({
  isGroupChat: vi.fn(),
  extractSender: vi.fn((chat: ZTMChat) => chat.latest?.sender || chat.peer || ''),
  validateChatMessage: vi.fn(),
  processPeerMessage: vi.fn(),
  processGroupMessage: vi.fn(),
  handlePeerPolicyCheck: vi.fn(),
}));

vi.mock('../dispatcher.js', () => ({
  notifyMessageCallbacks: vi.fn(),
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
    const normalizedMessage = { peer: 'alice', time: 123, message: 'hi', sender: 'alice' };

    (validateChatMessage as ReturnType<typeof vi.fn>).mockReturnValue({ valid: true });
    (isGroupChat as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (processPeerMessage as ReturnType<typeof vi.fn>).mockReturnValue(normalizedMessage);
    (notifyMessageCallbacks as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (handlePeerPolicyCheck as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const result = await processAndNotify(chat, mockState, []);

    expect(result).toBe(true);
    expect(processPeerMessage).toHaveBeenCalled();
    expect(notifyMessageCallbacks).toHaveBeenCalledWith(mockState, normalizedMessage);
    expect(handlePeerPolicyCheck).toHaveBeenCalledWith('alice', mockState, [], 'New message');
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
    const normalizedMessage = {
      isGroup: true,
      groupId: 'group1',
      groupCreator: 'admin',
      time: 123,
      message: 'hello',
      sender: 'bob',
    };

    (validateChatMessage as ReturnType<typeof vi.fn>).mockReturnValue({ valid: true });
    (isGroupChat as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (processGroupMessage as ReturnType<typeof vi.fn>).mockReturnValue(normalizedMessage);
    (notifyMessageCallbacks as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const result = await processAndNotify(chat, mockState, []);

    expect(result).toBe(true);
    expect(processGroupMessage).toHaveBeenCalled();
    expect(notifyMessageCallbacks).toHaveBeenCalledWith(mockState, normalizedMessage);
    // Group messages should NOT trigger peer policy check
    expect(handlePeerPolicyCheck).not.toHaveBeenCalled();
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
    (processPeerMessage as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const result = await processAndNotify(chat, mockState, []);

    expect(result).toBe(false);
    expect(notifyMessageCallbacks).not.toHaveBeenCalled();
  });
});
