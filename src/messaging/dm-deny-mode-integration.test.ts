/**
 * Focused integration test for the dmPolicy:deny mode bug.
 *
 * CRITICAL BUG: When dmPolicy is set to 'deny', group messages were being
 * incorrectly rejected because processIncomingMessage was checking DM policy
 * for ALL messages (including group messages).
 *
 * This test verifies the fix: group messages should NOT be affected by DM policy.
 * @module messaging/dm-deny-mode-integration.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { processGroupMessage, processPeerMessage } from './message-processor-helpers.js';
import { getOrCreateAccountState, removeAccountState } from '../runtime/state.js';

describe('DM Deny Mode Integration Tests', () => {
  const accountId = 'test-account-dm-deny';
  let mockState: any;

  beforeEach(() => {
    mockState = getOrCreateAccountState(accountId);
    mockState.config = {
      username: 'test-bot',
      dmPolicy: 'deny',  // Critical: DM policy set to deny
      allowFrom: [],     // No one is allowed
    };
  });

  afterEach(() => {
    removeAccountState(accountId);
  });

  describe('dmPolicy:deny should NOT affect group messages', () => {
    it('should allow group message when dmPolicy is deny', () => {
      const groupInfo = { creator: 'alice', group: 'test-group' };

      // DM policy: deny (no one allowed)
      mockState.config.dmPolicy = 'deny';
      mockState.config.allowFrom = [];

      // Group policy: open (group messages allowed)
      mockState.config.groupPermissions = {
        'alice/test-group': {
          groupPolicy: 'open',
          requireMention: true,
        },
      };

      const msg = {
        time: Date.now(),
        message: '@test-bot help',
        sender: 'unknown-user',  // NOT in DM allowFrom
      };

      // Group message should be ACCEPTED (DM policy ignored)
      const result = processGroupMessage(msg, mockState, [], groupInfo);

      expect(result).not.toBeNull();
      expect(result?.isGroup).toBe(true);
      expect(result?.sender).toBe('unknown-user');
    });

    it('should reject DM message when dmPolicy is deny', () => {
      // DM policy: deny (no one allowed)
      mockState.config.dmPolicy = 'deny';
      mockState.config.allowFrom = [];

      const msg = {
        time: Date.now(),
        message: 'hello',
        sender: 'unknown-user',
      };

      // DM message should be REJECTED
      const result = processPeerMessage(msg, mockState, []);

      expect(result).toBeNull();
    });

    it('should allow group message from unpaired user when dmPolicy is pairing', () => {
      const groupInfo = { creator: 'alice', group: 'test-group' };

      // DM policy: pairing (need explicit pairing)
      mockState.config.dmPolicy = 'pairing';
      mockState.config.allowFrom = [];  // No one paired yet

      // Group policy: open
      mockState.config.groupPermissions = {
        'alice/test-group': {
          groupPolicy: 'open',
          requireMention: true,
        },
      };

      const msg = {
        time: Date.now(),
        message: '@test-bot help',
        sender: 'unpaired-user',  // NOT paired
      };

      // Group message should be ACCEPTED (DM pairing not required)
      const result = processGroupMessage(msg, mockState, [], groupInfo);

      expect(result).not.toBeNull();
      expect(result?.isGroup).toBe(true);
    });
  });
});
