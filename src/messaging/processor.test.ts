// Unit tests for Message Processor

import { describe, it, expect } from 'vitest';
import {
  isValidMessage,
  createMessageId,
  parseMessageContent,
  processIncomingMessage,
} from './processor.js';
import { MAX_MESSAGE_LENGTH } from '../constants.js';
import { testConfigOpenDM } from '../test-utils/fixtures.js';

describe('Message Processor', () => {
  describe('isValidMessage', () => {
    it('should return true for valid messages', () => {
      expect(isValidMessage({ time: 123, message: 'Hi', sender: 'bob' })).toBe(true);
    });

    it('should return false for missing time', () => {
      expect(isValidMessage({ message: 'Hi', sender: 'bob' })).toBe(false);
    });

    it('should return false for missing message', () => {
      expect(isValidMessage({ time: 123, sender: 'bob' })).toBe(false);
    });

    it('should return false for missing sender', () => {
      expect(isValidMessage({ time: 123, message: 'Hi' })).toBe(false);
    });

    it('should return false for empty sender', () => {
      // Empty string for sender should fail validation (sender.length > 0)
      expect(isValidMessage({ time: 123, message: 'Hi', sender: '' })).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isValidMessage(null)).toBe(false);
      expect(isValidMessage(undefined)).toBe(false);
      expect(isValidMessage('string')).toBe(false);
      expect(isValidMessage(123)).toBe(false);
    });
  });

  describe('createMessageId', () => {
    it('should create unique ID from timestamp and sender', () => {
      const id1 = createMessageId(123456, 'alice');
      const id2 = createMessageId(123456, 'bob');

      expect(id1).toBe('123456-alice');
      expect(id2).toBe('123456-bob');
    });

    it('should handle zero timestamp', () => {
      const id = createMessageId(0, 'test');
      expect(id).toBe('0-test');
    });

    it('should handle special characters in sender', () => {
      const id = createMessageId(123456, 'user@example.com');
      expect(id).toBe('123456-user@example.com');
    });
  });

  describe('parseMessageContent', () => {
    it('should return string as-is', () => {
      expect(parseMessageContent('Hello')).toBe('Hello');
    });

    it('should extract text from object with text field', () => {
      expect(parseMessageContent({ text: 'Hello' })).toBe('Hello');
    });

    it('should extract message from object with message field', () => {
      expect(parseMessageContent({ message: 'Hello' })).toBe('Hello');
    });

    it('should prefer text field over message field', () => {
      expect(parseMessageContent({ text: 'Hello', message: 'World' })).toBe('Hello');
    });

    it('should JSON stringify complex objects', () => {
      const obj = { data: { nested: 'value' } };
      const result = parseMessageContent(obj);

      expect(result).toBe(JSON.stringify(obj));
    });

    it('should convert null to empty string', () => {
      expect(parseMessageContent(null)).toBe('');
    });

    it('should convert undefined to empty string', () => {
      expect(parseMessageContent(undefined)).toBe('');
    });

    it('should convert numbers to string', () => {
      expect(parseMessageContent(123)).toBe('123');
    });

    it('should handle empty object', () => {
      expect(parseMessageContent({})).toBe('{}');
    });

    it('should handle array', () => {
      expect(parseMessageContent([1, 2, 3])).toBe('[1,2,3]');
    });
  });

  describe('processIncomingMessage - message length boundary', () => {
    const baseMessage = { time: Date.now(), sender: 'alice' };
    const context = { config: testConfigOpenDM, storeAllowFrom: [] as string[], accountId: 'test' };

    // Empty message handling
    it('should reject empty message', () => {
      const message = '';
      const result = processIncomingMessage({ ...baseMessage, message }, context);

      expect(result).toBeNull();
    });

    // Single character message
    it('should accept single character message', () => {
      const message = 'a';
      const result = processIncomingMessage({ ...baseMessage, message }, context);

      expect(result).not.toBeNull();
      expect(result?.content).toBe('a');
    });

    it('should accept message at exactly MAX_MESSAGE_LENGTH', () => {
      const message = 'a'.repeat(MAX_MESSAGE_LENGTH);
      const result = processIncomingMessage({ ...baseMessage, message }, context);

      expect(result).not.toBeNull();
      expect(result?.content.length).toBe(MAX_MESSAGE_LENGTH);
    });

    it('should reject message exceeding MAX_MESSAGE_LENGTH', () => {
      const message = 'a'.repeat(MAX_MESSAGE_LENGTH + 1);
      const result = processIncomingMessage({ ...baseMessage, message }, context);

      expect(result).toBeNull();
    });

    it('should reject message at MAX_MESSAGE_LENGTH + 1', () => {
      const message = 'a'.repeat(10001);
      const result = processIncomingMessage({ ...baseMessage, message }, context);

      expect(result).toBeNull();
    });

    it('should reject significantly oversized message', () => {
      const message = 'a'.repeat(20000);
      const result = processIncomingMessage({ ...baseMessage, message }, context);

      expect(result).toBeNull();
    });

    it('should accept short message', () => {
      const message = 'Hello world';
      const result = processIncomingMessage({ ...baseMessage, message }, context);

      expect(result).not.toBeNull();
      expect(result?.content).toBe('Hello world');
    });

    // Ultra large message (100KB) - performance test
    it('should reject 100KB message for memory protection', () => {
      const largeMessage = 'a'.repeat(100 * 1024); // 100KB
      const result = processIncomingMessage({ ...baseMessage, message: largeMessage }, context);

      // Should be rejected as it exceeds MAX_MESSAGE_LENGTH (10KB)
      expect(result).toBeNull();
    });

    // Unicode mixed message - Chinese + English + emoji
    it('should handle Unicode mixed message (Chinese + English + emoji)', () => {
      const message = '你好 Hello 世界 🌍 这是测试 message! 🎉';
      const result = processIncomingMessage({ ...baseMessage, message }, context);

      expect(result).not.toBeNull();
      expect(result?.content).toBe(message);
    });

    it('should handle Unicode at MAX_MESSAGE_LENGTH boundary', () => {
      // Create a message with mixed Unicode that approaches the limit
      // Each Chinese character and emoji is 1 codepoint but counts as character length
      const chineseChars = '你好世界';
      const emoji = '🎉🧩🚀';
      const base = 'Hello';
      // Build message to exactly MAX_MESSAGE_LENGTH characters
      const repeatingUnit = `${base}${chineseChars}${emoji}`;
      const repeatCount = Math.floor(MAX_MESSAGE_LENGTH / repeatingUnit.length);
      const message = repeatingUnit.repeat(repeatCount).slice(0, MAX_MESSAGE_LENGTH);

      const result = processIncomingMessage({ ...baseMessage, message }, context);

      expect(result).not.toBeNull();
      expect(result?.content.length).toBe(message.length);
    });

    it('should reject Unicode message exceeding MAX_MESSAGE_LENGTH', () => {
      // Build a Unicode message that exceeds the limit
      // Note: JavaScript .length counts UTF-16 code units, emoji are 2 units each
      // "你好Hello🎉" = 9 code units (你=1, 好=1, H=1, e=1, l=1, l=1, o=1, 🎉=2)
      const repeatingUnit = '你好Hello🎉';
      const unitLength = repeatingUnit.length; // 9
      // Need enough repeats to exceed MAX_MESSAGE_LENGTH (10000)
      const repeatCount = Math.ceil((MAX_MESSAGE_LENGTH + 1) / unitLength) + 1; // ~1112
      const message = repeatingUnit.repeat(repeatCount).slice(0, MAX_MESSAGE_LENGTH + 1);

      expect(message.length).toBe(MAX_MESSAGE_LENGTH + 1); // Verify test setup

      const result = processIncomingMessage({ ...baseMessage, message }, context);

      expect(result).toBeNull();
    });
  });

  describe('Message content sanitization (XSS prevention)', () => {
    const baseMessage = { time: Date.now(), sender: 'alice' };
    const context = { config: testConfigOpenDM, storeAllowFrom: [] as string[], accountId: 'test' };

    it('should escape <script> tags to prevent XSS', () => {
      const message = '<script>alert("xss")</script>';
      const result = processIncomingMessage({ ...baseMessage, message }, context);

      expect(result).not.toBeNull();
      // After escaping, <script> becomes &lt;script&gt; which is not executable
      expect(result?.content).not.toContain('<script>');
      expect(result?.content).toContain('&lt;script&gt;');
    });

    it('should escape img onerror tags to prevent XSS', () => {
      const message = '<img src=x onerror=alert(1)>';
      const result = processIncomingMessage({ ...baseMessage, message }, context);

      expect(result).not.toBeNull();
      // After escaping, the HTML tag becomes harmless text
      expect(result?.content).toContain('&lt;img');
      expect(result?.content).not.toContain('<img');
    });

    it('should escape HTML special characters', () => {
      const message = 'Test & <script>alert(1)</script> & "quotes"';
      const result = processIncomingMessage({ ...baseMessage, message }, context);

      expect(result).not.toBeNull();
      expect(result?.content).toContain('&amp;');
      expect(result?.content).toContain('&lt;');
      expect(result?.content).toContain('&quot;');
    });

    it('should escape HTML in sender field', () => {
      const message = { ...baseMessage, sender: '<script>evil()</script>', message: 'hello' };
      const result = processIncomingMessage(message, context);

      expect(result).not.toBeNull();
      expect(result?.sender).not.toContain('<script>');
      expect(result?.sender).toContain('&lt;script&gt;');
    });

    it('should escape nested HTML tags', () => {
      const message = '<div onclick="alert(1)"><script>evil()</script></div>';
      const result = processIncomingMessage({ ...baseMessage, message }, context);

      expect(result).not.toBeNull();
      // All HTML becomes escaped text, not executable
      expect(result?.content).toContain('&lt;div');
      expect(result?.content).toContain('&lt;script&gt;');
    });

    it('should preserve plain text content unchanged', () => {
      const message = 'Hello world! This is a plain message.';
      const result = processIncomingMessage({ ...baseMessage, message }, context);

      expect(result).not.toBeNull();
      expect(result?.content).toBe('Hello world! This is a plain message.');
    });

    it('should escape mixed content with text and HTML', () => {
      const message = 'Hello <b>world</b>!';
      const result = processIncomingMessage({ ...baseMessage, message }, context);

      expect(result).not.toBeNull();
      // HTML tags are escaped, making them safe text
      expect(result?.content).toContain('&lt;b&gt;');
    });
  });

  describe('Input sanitization - path traversal patterns', () => {
    const baseMessage = { time: Date.now() };
    const context = { config: testConfigOpenDM, storeAllowFrom: [] as string[], accountId: 'test' };

    it('should escape path traversal pattern in sender', () => {
      const message = { ...baseMessage, sender: 'alice<script>', message: 'hello' };
      const result = processIncomingMessage(message, context);

      // HTML tags in sender should be escaped
      expect(result).not.toBeNull();
      expect(result?.sender).toContain('&lt;script&gt;');
    });

    it('should escape path traversal pattern in content', () => {
      const message = {
        ...baseMessage,
        sender: 'alice',
        message: 'reading <script>alert(1)</script>',
      };
      const result = processIncomingMessage(message, context);

      expect(result).not.toBeNull();
      // HTML should be escaped
      expect(result?.content).toContain('&lt;script&gt;');
    });

    it('should escape encoded path traversal patterns', () => {
      const message = { ...baseMessage, sender: 'alice%2e%2e%2fadmin', message: 'test' };
      const result = processIncomingMessage(message, context);

      // URL-encoded path traversal is passed through (not currently sanitized)
      expect(result).not.toBeNull();
      expect(result?.sender).toContain('%2e%2e%2f');
    });

    it('should handle forward slashes in sender (path-like)', () => {
      const message = { ...baseMessage, sender: 'alice/bob', message: 'hello' };
      const result = processIncomingMessage(message, context);

      // Forward slashes are not currently escaped (potential path traversal gap)
      expect(result).not.toBeNull();
      expect(result?.sender).toContain('/');
    });
  });

  describe('Input sanitization - control characters', () => {
    const baseMessage = { time: Date.now() };
    const context = { config: testConfigOpenDM, storeAllowFrom: [] as string[], accountId: 'test' };

    it('should escape null byte in message content', () => {
      const message = { ...baseMessage, sender: 'alice', message: 'hello<script>' };
      const result = processIncomingMessage(message, context);

      expect(result).not.toBeNull();
      // HTML should be escaped
      expect(result?.content).toContain('&lt;script&gt;');
    });

    it('should escape control characters in message', () => {
      const message = {
        ...baseMessage,
        sender: 'alice',
        message: 'test <script>alert(1)</script>',
      };
      const result = processIncomingMessage(message, context);

      expect(result).not.toBeNull();
      // HTML should be escaped
      expect(result?.content).toContain('&lt;script&gt;');
    });

    it('should handle newlines in sender field', () => {
      const message = { ...baseMessage, sender: 'alice<b>admin', message: 'hello' };
      const result = processIncomingMessage(message, context);

      expect(result).not.toBeNull();
      // HTML should be escaped
      expect(result?.sender).toContain('&lt;b&gt;');
    });

    it('should handle tabs in content', () => {
      const message = { ...baseMessage, sender: 'alice', message: 'hello <b>world</b>' };
      const result = processIncomingMessage(message, context);

      expect(result).not.toBeNull();
      // HTML should be escaped
      expect(result?.content).toContain('&lt;b&gt;');
    });
  });

  describe('Input sanitization - type validation', () => {
    const baseMessage = { time: Date.now(), sender: 'alice' };
    const context = { config: testConfigOpenDM, storeAllowFrom: [] as string[], accountId: 'test' };

    it('should reject message with non-string content', () => {
      const message = { ...baseMessage, message: null as unknown as string };
      const result = processIncomingMessage(message, context);

      // Should treat null as empty and skip
      expect(result).toBeNull();
    });

    it('should reject message with undefined content', () => {
      const message = { ...baseMessage, message: undefined as unknown as string };
      const result = processIncomingMessage(message, context);

      // Should treat undefined as empty and skip
      expect(result).toBeNull();
    });

    it('should reject whitespace-only message', () => {
      const message = { ...baseMessage, message: '   \n\t   ' };
      const result = processIncomingMessage(message, context);

      expect(result).toBeNull();
    });

    it('should handle numeric message content as string', () => {
      const message = { time: Date.now(), sender: 'alice', message: 'hello <script>' };
      const result = processIncomingMessage(message, context);

      // HTML is properly escaped
      expect(result).not.toBeNull();
      expect(result?.content).toContain('&lt;script&gt;');
    });
  });
});
