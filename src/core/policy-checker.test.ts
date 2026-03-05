/**
 * Tests for unified policy checking module
 * @module core/policy-checker.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkMessagePolicy, isGroupPolicyEnabled } from './policy-checker.js';
import { checkDmPolicy } from './dm-policy.js';
import { checkGroupPolicy } from './group-policy.js';
import { getGroupPermissionCached } from '../runtime/state.js';
import type { GroupPermissions } from '../types/group-policy.js';

// Mock dependencies
vi.mock('./dm-policy.js');
vi.mock('./group-policy.js');
vi.mock('../runtime/state.js');

describe('policy-checker', () => {
  const mockConfig = {
    username: 'bot',
    dmPolicy: 'pairing',
    allowFrom: [],
  } as any;

  const mockAccountId = 'test-account';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkMessagePolicy - DM messages', () => {
    it('should check DM policy for non-group messages', () => {
      vi.mocked(checkDmPolicy).mockReturnValue({
        allowed: true,
        reason: 'allowed',
        action: 'process',
      });

      const result = checkMessagePolicy({
        sender: 'alice',
        content: 'Hello',
        config: mockConfig,
        accountId: mockAccountId,
        storeAllowFrom: [],
      });

      expect(result).toEqual({
        allowed: true,
        reason: 'allowed',
        action: 'process',
      });
      expect(checkDmPolicy).toHaveBeenCalledWith('alice', mockConfig, []);
      expect(checkGroupPolicy).not.toHaveBeenCalled();
    });

    it('should return pairing action for unpaired DM senders', () => {
      vi.mocked(checkDmPolicy).mockReturnValue({
        allowed: false,
        reason: 'pending',
        action: 'request_pairing',
      });

      const result = checkMessagePolicy({
        sender: 'bob',
        content: 'Hi',
        config: mockConfig,
        accountId: mockAccountId,
        storeAllowFrom: [],
      });

      expect(result.action).toBe('request_pairing');
    });

    it('should return ignore action for denied DM senders', () => {
      vi.mocked(checkDmPolicy).mockReturnValue({
        allowed: false,
        reason: 'denied',
        action: 'ignore',
      });

      const result = checkMessagePolicy({
        sender: 'eve',
        content: 'Hack',
        config: { ...mockConfig, dmPolicy: 'deny' },
        accountId: mockAccountId,
        storeAllowFrom: [],
      });

      expect(result.action).toBe('ignore');
    });
  });

  describe('checkMessagePolicy - Group messages', () => {
    const mockPermissions: GroupPermissions = {
      creator: 'alice',
      group: 'team',
      groupPolicy: 'allowlist',
      requireMention: true,
      allowFrom: ['bob'],
      tools: { allow: ['group:messaging'] },
    };

    it('should check group policy for group messages', () => {
      vi.mocked(getGroupPermissionCached).mockReturnValue(mockPermissions);
      vi.mocked(checkGroupPolicy).mockReturnValue({
        allowed: true,
        reason: 'whitelisted',
        action: 'process',
        wasMentioned: true,
      });

      const result = checkMessagePolicy({
        sender: 'bob',
        content: '@bot help',
        config: mockConfig,
        accountId: mockAccountId,
        groupInfo: { creator: 'alice', group: 'team' },
      });

      expect(result).toEqual({
        allowed: true,
        reason: 'whitelisted',
        action: 'process',
      });
      expect(getGroupPermissionCached).toHaveBeenCalledWith(
        mockAccountId,
        'alice',
        'team',
        mockConfig
      );
      expect(checkGroupPolicy).toHaveBeenCalledWith('bob', '@bot help', mockPermissions, 'bot');
      expect(checkDmPolicy).not.toHaveBeenCalled();
    });

    it('should NOT check DM policy for group messages (CRITICAL)', () => {
      vi.mocked(getGroupPermissionCached).mockReturnValue(mockPermissions);
      vi.mocked(checkGroupPolicy).mockReturnValue({
        allowed: true,
        reason: 'allowed',
        action: 'process',
        wasMentioned: true,
      });

      checkMessagePolicy({
        sender: 'unknown-user',  // Not in DM allowFrom
        content: '@bot help',
        config: mockConfig,
        accountId: mockAccountId,
        groupInfo: { creator: 'alice', group: 'team' },
      });

      // CRITICAL: DM policy should never be called for group messages
      expect(checkDmPolicy).not.toHaveBeenCalled();
      expect(checkGroupPolicy).toHaveBeenCalled();
    });

    it('should reject group messages with disabled policy', () => {
      const disabledPermissions: GroupPermissions = { ...mockPermissions, groupPolicy: 'disabled' };
      vi.mocked(getGroupPermissionCached).mockReturnValue(disabledPermissions);
      vi.mocked(checkGroupPolicy).mockReturnValue({
        allowed: false,
        reason: 'denied',
        action: 'ignore',
      });

      const result = checkMessagePolicy({
        sender: 'bob',
        content: '@bot help',
        config: mockConfig,
        accountId: mockAccountId,
        groupInfo: { creator: 'alice', group: 'team' },
      });

      expect(result.allowed).toBe(false);
      expect(result.action).toBe('ignore');
    });

    it('should reject group messages without mention when requireMention=true', () => {
      vi.mocked(getGroupPermissionCached).mockReturnValue(mockPermissions);
      vi.mocked(checkGroupPolicy).mockReturnValue({
        allowed: false,
        reason: 'mention_required',
        action: 'ignore',
        wasMentioned: false,
      });

      const result = checkMessagePolicy({
        sender: 'bob',
        content: 'hello',  // No @mention
        config: mockConfig,
        accountId: mockAccountId,
        groupInfo: { creator: 'alice', group: 'team' },
      });

      expect(result.allowed).toBe(false);
    });

    it('should allow group creator regardless of allowlist', () => {
      vi.mocked(getGroupPermissionCached).mockReturnValue(mockPermissions);
      vi.mocked(checkGroupPolicy).mockReturnValue({
        allowed: true,
        reason: 'creator',
        action: 'process',
        wasMentioned: true,
      });

      const result = checkMessagePolicy({
        sender: 'alice',  // Creator
        content: '@bot help',
        config: mockConfig,
        accountId: mockAccountId,
        groupInfo: { creator: 'alice', group: 'team' },
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('isGroupPolicyEnabled', () => {
    it('should return true when policy is not disabled', () => {
      vi.mocked(getGroupPermissionCached).mockReturnValue({
        groupPolicy: 'open',
      } as any);

      const result = isGroupPolicyEnabled('alice', 'team', mockConfig, mockAccountId);
      expect(result).toBe(true);
    });

    it('should return false when policy is disabled', () => {
      vi.mocked(getGroupPermissionCached).mockReturnValue({
        groupPolicy: 'disabled',
      } as any);

      const result = isGroupPolicyEnabled('alice', 'team', mockConfig, mockAccountId);
      expect(result).toBe(false);
    });
  });
});
