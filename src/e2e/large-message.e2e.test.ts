/**
 * E2E Large Message Tests
 *
 * Tests message handling at various size boundaries:
 * 1. MAX_MESSAGE_LENGTH boundary (10KB)
 * 2. 100KB messages
 * 3. 1MB messages
 * 4. 2MB messages
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { processIncomingMessage } from '../messaging/processor.js';
import {
  testConfigOpenDM,
  testAccountId,
  NOW,
  e2eBeforeEach,
  e2eAfterEach,
} from '../test-utils/index.js';
import { MAX_MESSAGE_LENGTH } from '../constants.js';

describe('E2E: Large Message Handling', () => {
  const SENDER_PREFIX = 'lm-';

  beforeEach(() => {
    e2eBeforeEach();
  });

  afterEach(async () => {
    await e2eAfterEach();
  });

  describe('MAX_MESSAGE_LENGTH Boundary (10KB)', () => {
    it('should accept message at exactly MAX_MESSAGE_LENGTH', async () => {
      const context = {
        config: testConfigOpenDM,
        storeAllowFrom: [],
        accountId: testAccountId,
      };

      // Message at exactly MAX_MESSAGE_LENGTH (10000 chars)
      const message = 'a'.repeat(MAX_MESSAGE_LENGTH);
      const msg = {
        time: NOW,
        message,
        sender: `${SENDER_PREFIX}boundary-user`,
      };

      const result = processIncomingMessage(msg, context);

      expect(result).not.toBeNull();
      expect(result?.content.length).toBe(MAX_MESSAGE_LENGTH);
    });

    it('should accept message just under MAX_MESSAGE_LENGTH', async () => {
      const context = {
        config: testConfigOpenDM,
        storeAllowFrom: [],
        accountId: testAccountId,
      };

      // Message just under MAX_MESSAGE_LENGTH
      const message = 'b'.repeat(MAX_MESSAGE_LENGTH - 1);
      const msg = {
        time: NOW,
        message,
        sender: `${SENDER_PREFIX}under-limit`,
      };

      const result = processIncomingMessage(msg, context);

      expect(result).not.toBeNull();
      expect(result?.content.length).toBe(MAX_MESSAGE_LENGTH - 1);
    });

    it('should reject message exceeding MAX_MESSAGE_LENGTH', async () => {
      const context = {
        config: testConfigOpenDM,
        storeAllowFrom: [],
        accountId: testAccountId,
      };

      // Message exceeds MAX_MESSAGE_LENGTH by 1 character
      const message = 'c'.repeat(MAX_MESSAGE_LENGTH + 1);
      const msg = {
        time: NOW,
        message,
        sender: `${SENDER_PREFIX}over-limit`,
      };

      const result = processIncomingMessage(msg, context);

      expect(result).toBeNull();
    });
  });

  describe('100KB Messages', () => {
    it('should handle 100KB message', async () => {
      const context = {
        config: testConfigOpenDM,
        storeAllowFrom: [],
        accountId: testAccountId,
      };

      const size100KB = 100 * 1024;
      const message = 'd'.repeat(size100KB);
      const msg = {
        time: NOW,
        message,
        sender: `${SENDER_PREFIX}100kb-user`,
      };

      const result = processIncomingMessage(msg, context);

      // Should be rejected as it exceeds MAX_MESSAGE_LENGTH
      expect(result).toBeNull();
    });
  });

  describe('1MB Messages', () => {
    it('should handle 1MB message', async () => {
      const context = {
        config: testConfigOpenDM,
        storeAllowFrom: [],
        accountId: testAccountId,
      };

      const size1MB = 1024 * 1024;
      const message = 'e'.repeat(size1MB);
      const msg = {
        time: NOW,
        message,
        sender: `${SENDER_PREFIX}1mb-user`,
      };

      const result = processIncomingMessage(msg, context);

      // Should be rejected as it exceeds MAX_MESSAGE_LENGTH
      expect(result).toBeNull();
    });
  });

  describe('2MB Messages', () => {
    it('should handle 2MB message', async () => {
      const context = {
        config: testConfigOpenDM,
        storeAllowFrom: [],
        accountId: testAccountId,
      };

      const size2MB = 2 * 1024 * 1024;
      const message = 'f'.repeat(size2MB);
      const msg = {
        time: NOW,
        message,
        sender: `${SENDER_PREFIX}2mb-user`,
      };

      const result = processIncomingMessage(msg, context);

      // Should be rejected as it exceeds MAX_MESSAGE_LENGTH
      expect(result).toBeNull();
    });
  });

  describe('Large Message Processing Performance', () => {
    it('should process 10KB boundary messages efficiently', async () => {
      const context = {
        config: testConfigOpenDM,
        storeAllowFrom: [],
        accountId: testAccountId,
      };

      const message = 'g'.repeat(MAX_MESSAGE_LENGTH);
      const msg = {
        time: NOW,
        message,
        sender: `${SENDER_PREFIX}perf-user`,
      };

      const startTime = Date.now();
      const result = processIncomingMessage(msg, context);
      const processingTime = Date.now() - startTime;

      expect(result).not.toBeNull();
      // Should process in reasonable time (< 100ms)
      expect(processingTime).toBeLessThan(100);

      console.log(`10KB message processed in ${processingTime}ms`);
    });
  });
});
